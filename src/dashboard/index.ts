import express, { type Request, type Response, type Application, type NextFunction } from 'express';
import { type Server } from 'node:http';
import path from 'node:path';
import { config } from '../config';
import { RESPONSE_ANCHOR, THINK_END, THINK_START } from '../constants/thinking';
import { ILogger } from '../infrastructure/logger';
import { healthCheck } from '../services/provider-health-service';
import { AIServiceError } from '../services/ai-completion-service';
import { IAgent } from '../services/agents/main-agent/agent';
import { stripInternalStreamMarkers } from '../utils/stream-markers';
import { IDatabaseService } from '../infrastructure/db-sqlite';
import { AdminRouterFactory } from './admin';

interface WebServerHandle {
  start(): Promise<WebServerHandle>;
  stop(): Promise<void>;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

type SseWriter = (payload: unknown) => void;

const INDEX_RATE_LIMIT_WINDOW_MS = 60_000;
const INDEX_RATE_LIMIT_MAX_REQUESTS = 60;

class IndexRouteHandler {
  private static readonly rateLimitStore = new Map<string, RateLimitEntry>();

  constructor(
    private readonly publicDir: string,
    private readonly relativeFilePath: string = '/index.html',
  ) {}

  readonly handle = (req: Request, res: Response): void => {
    const now = Date.now();
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const existing = IndexRouteHandler.rateLimitStore.get(clientIp);

    if (!existing || now - existing.windowStart >= INDEX_RATE_LIMIT_WINDOW_MS) {
      IndexRouteHandler.rateLimitStore.set(clientIp, { count: 1, windowStart: now });
    } else if (existing.count >= INDEX_RATE_LIMIT_MAX_REQUESTS) {
      res.status(429).json({ error: 'Too many requests to /. Please try again later.' });
      return;
    } else {
      existing.count += 1;
      IndexRouteHandler.rateLimitStore.set(clientIp, existing);
    }

    this.pruneExpiredEntries(now);
    res.sendFile(path.join(this.publicDir, this.relativeFilePath));
  };

  private pruneExpiredEntries(now: number): void {
    if (IndexRouteHandler.rateLimitStore.size <= 5_000) {
      return;
    }

    for (const [ip, entry] of IndexRouteHandler.rateLimitStore.entries()) {
      if (now - entry.windowStart >= INDEX_RATE_LIMIT_WINDOW_MS) {
        IndexRouteHandler.rateLimitStore.delete(ip);
      }
    }
  }
}

class HealthRouteHandler {
  constructor(private readonly logger: ILogger) {}

  readonly handle = async (_: Request, res: Response): Promise<void> => {
    const { status, timestamp, details } = await healthCheck(this.logger);
    res.status(status === 'ok' ? 200 : 500).json({ status, timestamp, details });
  };
}

class ChatRouteHandler {
  constructor(private readonly agent: IAgent) {}

  readonly handle = async (req: Request, res: Response): Promise<void> => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined;

    // The AI run is decoupled from the client connection: when the browser
    // disconnects (tab close/reload, navigating away) we keep processing so
    // the exchange is still persisted by the conversation worker. `clientClosed`
    // only stops further SSE writes.
    let clientClosed = false;

    const onClose = () => {
      clientClosed = true;
    };

    req.on('aborted', onClose);
    res.on('close', onClose);

    const writeSse = this.createSseWriter(res, () => clientClosed);
    this.setupSseHeaders(res);

    try {
      const result = await this.agent.handle(message, 'web', {
        sessionId,
        onProgress: (summary: string) => {
          if (clientClosed) {
            return;
          }

          writeSse({
            type: 'progress',
            delta: { status: summary },
          });
        },
      });

      await this.writeResponse(result, writeSse, () => clientClosed || res.writableEnded || res.destroyed);

      if (clientClosed) {
        return;
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      if (clientClosed) {
        return;
      }

      const payload = error instanceof AIServiceError
        ? error.toJSON()
        : { code: 'unknown' as const, message: error instanceof Error ? error.message : String(error) };
      writeSse({
        type: 'error',
        error: payload,
      });
      res.write('data: [DONE]\n\n');
      res.end();
    } finally {
      req.off('aborted', onClose);
      res.off('close', onClose);
    }
  };

  private createSseWriter(res: Response, isClosed: () => boolean): SseWriter {
    return (payload: unknown) => {
      if (isClosed() || res.writableEnded || res.destroyed) {
        return;
      }

      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
  }

  private async writeResponse(
    result: unknown,
    writeSse: SseWriter,
    isClosed: () => boolean,
  ): Promise<void> {
    if (typeof result === 'string') {
      this.writeTextChunk(stripInternalStreamMarkers(result), writeSse);
      return;
    }

    if (!this.isAsyncIterable(result)) {
      this.writeTextChunk(String(result), writeSse);
      return;
    }

    let inThinking = false;

    for await (const chunk of result) {
      if (isClosed()) {
        return;
      }

      if (chunk === THINK_START) {
        inThinking = true;
        continue;
      }

      if (chunk === THINK_END) {
        inThinking = false;
        continue;
      }

      if (inThinking || chunk === RESPONSE_ANCHOR) {
        continue;
      }

      this.writeTextChunk(chunk, writeSse);
    }
  }

  private writeTextChunk(text: string, writeSse: SseWriter): void {
    if (!text) {
      return;
    }

    writeSse({
      type: 'content_block_delta',
      delta: { text },
    });
  }

  private isAsyncIterable(value: unknown): value is AsyncIterable<string> {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const maybe = value as { [Symbol.asyncIterator]?: unknown };
    return typeof maybe[Symbol.asyncIterator] === 'function';
  }

  private setupSseHeaders(res: Response): void {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }
}

class DashboardServer implements WebServerHandle {
  private server: Server | null = null;

  constructor(
    private readonly logger: ILogger,
    private readonly agent: IAgent,
    private readonly db: IDatabaseService,
  ) {}

  async start(): Promise<WebServerHandle> {
    const app = this.createApp();
    this.server = app.listen(config.WEB_PORT, () => {
      this.logger.info(`Server running at http://localhost:${config.WEB_PORT}`);
    });

    return this;
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await DashboardServer.stopServer(this.server);
    this.server = null;
  }

  private static stopServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  createApp(): Application {
    const app = express();
    const publicDir = path.resolve(config.BASE_DIR, './dist-web');
    const indexHandler = new IndexRouteHandler(publicDir);
    const chatHandler = new ChatRouteHandler(this.agent);
    const healthHandler = new HealthRouteHandler(this.logger);
    const adminRouter = AdminRouterFactory.create(this.logger, this.db);

    app.use(express.json());
    app.use(express.static(publicDir));
    app.post('/api/chat', chatHandler.handle);
    app.use('/api/admin', adminRouter);
    app.get('/health', healthHandler.handle);

    // SPA fallback: any unmatched GET request (e.g. "/", "/admin", "/admin/sessions")
    // is served the same index.html so React Router can handle client-side routing.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') {
        next();
        return;
      }

      indexHandler.handle(req, res);
    });

    return app;
  }
}

class DashboardServerFactory {
  static create(logger: ILogger, agent: IAgent, db: IDatabaseService): WebServerHandle {
    return new DashboardServer(logger, agent, db);
  }
}

function createApp(options: { logger: ILogger; agent: IAgent; db: IDatabaseService }): Application {
  return new DashboardServer(options.logger, options.agent, options.db).createApp();
}

function serveIndexHandler(publicDir: string) {
  return new IndexRouteHandler(publicDir).handle;
}

function createHealthHandler(logger: ILogger) {
  return new HealthRouteHandler(logger).handle;
}

function createChatHandler(agent: IAgent) {
  return new ChatRouteHandler(agent).handle;
}

async function startWebServer(logger: ILogger, agent: IAgent, db: IDatabaseService): Promise<WebServerHandle> {
  return new DashboardServer(logger, agent, db).start();
}

export {
  WebServerHandle,
  DashboardServerFactory,
  createApp,
  serveIndexHandler,
  createHealthHandler,
  createChatHandler,
  startWebServer,
};
