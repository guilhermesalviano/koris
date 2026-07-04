import type { ChannelDefinition } from '../../src/channels';
import { ADAPTERS } from '../../src/channels';
import type { ILogger } from '../../src/infrastructure/logger';
import type { Plugin, PluginRegistry } from '../registry';
import type { IAgent } from '../../src/services/agents/main-agent/agent';
import { stripInternalStreamMarkers } from '../../src/utils/stream-markers';
import { config } from '../../src/config';

const WHATSAPP_MESSAGE_LIMIT = 4_000;

interface WhatsAppChannelStartOptions {
  authFolder: string;
  mentionId: string;
  agent: IAgent;
  logger: ILogger;
}

interface WhatsAppPluginOptions {
  enabled: boolean;
  authFolder: string;
  mentionId: string;
}

interface IWhatsAppChannel {
  handleMessage(agent: IAgent, jid: string, text: string): Promise<void>;
  sendText(jid: string, text: string): Promise<void>;
}

interface SocketLike {
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
  end(err: Error | undefined): void;
  ev: {
    on(event: string, handler: (data: unknown) => void): void;
  };
}

let activeSocket: SocketLike | null = null;

async function startBaileysSocket(options: WhatsAppChannelStartOptions): Promise<SocketLike> {
  const { makeWASocket, useMultiFileAuthState, DisconnectReason } = await import('@whiskeysockets/baileys');
  const qrcode = await import('qrcode-terminal');
  const { state, saveCreds } = await useMultiFileAuthState(options.authFolder);

  const sock = makeWASocket({
    auth: state,
    logger: createBaileysLogger(options.logger),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      options.logger.info('Scan the QR code below with WhatsApp on your phone:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      options.logger.warn(
        `WhatsApp connection closed (code=${statusCode ?? 'unknown'}). Reconnect=${shouldReconnect}`,
      );

      if (shouldReconnect) {
        startBaileysSocket(options)
          .then((newSock) => { activeSocket = newSock; })
          .catch((err: Error) => options.logger.warn(`WhatsApp reconnect failed: ${err.message}`));
      } else {
        activeSocket = null;
      }
    }

    if (connection === 'open') {
      options.logger.info('WhatsApp is ready!');
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      options.logger.debug(`[whatsapp] raw message received: ${JSON.stringify(msg)}`);

      if (msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      if (!jid) continue;

      const text = extractText(msg);
      if (!text) continue;

      const channel = new WhatsAppChannel(sock, options.mentionId, options.logger);
      void channel.handleMessage(options.agent, jid, text).catch((err: Error) => {
        options.logger.warn(`WhatsApp message handling error: ${err.message}`);
      });
    }
  });

  return sock;
}

function extractText(msg: { message?: unknown }): string | null {
  if (!msg.message || typeof msg.message !== 'object') return null;

  const content = msg.message as Record<string, unknown>;

  const conversation = content['conversation'];
  if (typeof conversation === 'string') return conversation;

  const extended = content['extendedTextMessage'];
  if (extended && typeof extended === 'object') {
    const text = (extended as Record<string, unknown>)['text'];
    if (typeof text === 'string') return text;
  }

  return null;
}

function createBaileysLogger(logger: ILogger) {
  return {
    level: 'silent' as const,
    trace: () => {},
    debug: () => {},
    info: (msg: unknown) => logger.debug(`[baileys] ${String(msg)}`),
    warn: (msg: unknown) => logger.warn(`[baileys] ${String(msg)}`),
    error: (msg: unknown) => logger.error(`[baileys] ${String(msg)}`),
    fatal: (msg: unknown) => logger.error(`[baileys] fatal: ${String(msg)}`),
    child: () => createBaileysLogger(logger),
  };
}

class WhatsAppChannel implements IWhatsAppChannel {
  constructor(
    private readonly sock?: SocketLike,
    private readonly mentionId: string = '',
    private readonly logger?: ILogger,
  ) {}

  async handleMessage(agent: IAgent, jid: string, text: string): Promise<void> {
    try {
      if (jid.endsWith('@g.us')) {
        const mention = `@${this.mentionId}`;
        const isMentioned = this.mentionId.length > 0 && text.startsWith(mention);

        this.logger?.debug(
          `[whatsapp] group message — expected="${mention}" text_start="${text.slice(0, 30)}" match=${isMentioned}`,
        );

        if (!isMentioned) return;
      }

      const response = await agent.handle(text);
      const resolved = await this.resolveResponse(response);
      await this.sendText(jid, resolved);
    } catch (error) {
      const sock = await this.getSocket();
      await sock.sendMessage(jid, {
        text: '❌ Sorry, I encountered an error processing your message. Please try again.',
      });
    }
  }

  async sendText(jid: string, text: string): Promise<void> {
    const sock = await this.getSocket();
    for (const chunk of splitMessage(text, WHATSAPP_MESSAGE_LIMIT)) {
      await sock.sendMessage(jid, { text: chunk });
    }
  }

  private async resolveResponse(response: unknown): Promise<string> {
    if (typeof response === 'string') {
      return stripInternalStreamMarkers(response);
    }

    if (this.isAsyncIterable(response)) {
      let out = '';
      for await (const chunk of response) {
        out += chunk;
      }
      return stripInternalStreamMarkers(out);
    }

    return String(response);
  }

  private isAsyncIterable(value: unknown): value is AsyncIterable<string> {
    if (!value || typeof value !== 'object') return false;
    const maybe = value as { [Symbol.asyncIterator]?: unknown };
    return typeof maybe[Symbol.asyncIterator] === 'function';
  }

  private async getSocket(): Promise<SocketLike> {
    if (this.sock) return this.sock;
    if (activeSocket) return activeSocket;
    throw new Error('WhatsApp socket is not connected.');
  }
}

class WhatsAppChannelFactory {
  static create(): IWhatsAppChannel {
    return new WhatsAppChannel();
  }

  static async start(
    options: WhatsAppChannelStartOptions,
  ): Promise<{ channel: IWhatsAppChannel; stop: () => void }> {
    const channel = new WhatsAppChannel(undefined, options.mentionId, options.logger);
    const sock = await startBaileysSocket(options);
    activeSocket = sock;

    return {
      channel,
      stop: () => {
        sock.end(undefined);
        activeSocket = null;
      },
    };
  }

  static async sendText(jid: string, text: string): Promise<void> {
    const channel = new WhatsAppChannel();
    await channel.sendText(jid, text);
  }
}

const whatsappChannel = WhatsAppChannelFactory.create();

async function handleMessage(agent: IAgent, jid: string, text: string): Promise<void> {
  await whatsappChannel.handleMessage(agent, jid, text);
}

async function sendText(jid: string, text: string): Promise<void> {
  await whatsappChannel.sendText(jid, text);
}

function createWhatsAppAdapter(options: WhatsAppPluginOptions): ChannelDefinition {
  return {
    name: 'whatsapp',
    enabled: () => options.enabled,
    start: (logger: ILogger, agent: IAgent) => {
      let stopFn: (() => void) | null = null;

      WhatsAppChannelFactory.start({ authFolder: options.authFolder, mentionId: options.mentionId, agent, logger })
        .then(({ stop }) => { stopFn = stop; })
        .catch((err: Error) => logger.warn(`Failed to start WhatsApp: ${err.message}`));

      return () => { stopFn?.(); };
    },
    sendMessage: async (_logger: ILogger, target: string, message: string) => {
      await WhatsAppChannelFactory.sendText(target, message);
    },
  };
}

function createWhatsAppPlugin(options: WhatsAppPluginOptions): Plugin {
  return {
    name: 'whatsapp',
    setup(registry: PluginRegistry) {
      registry.extend(ADAPTERS, createWhatsAppAdapter(options));
    },
  };
}

export {
  createWhatsAppPlugin,
  handleMessage,
  IWhatsAppChannel,
  sendText,
  WhatsAppChannel,
  WhatsAppChannelFactory,
};

export function create(): Plugin {
  return createWhatsAppPlugin({
    enabled: config.CHANNELS.WHATSAPP.ENABLED,
    authFolder: config.CHANNELS.WHATSAPP.AUTH_FOLDER,
    mentionId: config.CHANNELS.WHATSAPP.MENTION_ID,
  });
}

function splitMessage(text: string, maxLength: number): string[] {
  if (!text) return [];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const splitIndex = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf(' '));
    const end = splitIndex > 0 ? splitIndex : maxLength;

    chunks.push(remaining.slice(0, end).trimEnd());
    remaining = remaining.slice(end).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
