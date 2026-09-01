import { handleCommand, isCommand } from '../commands';
import { previewMessage, toSafeMessage } from '../../utils/message';
import { config } from '../../config';
import { AIServiceError } from '../ai-completion-service';
import { findGateBlocks, formatGateBlockNotice } from '../security/gate-blocks';
import { AuditLogRepositoryFactory, type IAuditLogRepository } from '../../repositories/audit-log';
import { ILogger } from '../../infrastructure/logger';
import { IDatabaseService } from '../../infrastructure/db-sqlite';
import { ISessionManager } from '../session-manager';
import { IMainAgent, MainAgentFactory } from './main-agent';
import { ProcessedMessage, ProcessOptions } from '../../types/agents';
import { ImageAttachment } from '../../types/messages';
import { generateId } from '../../utils/generate-id';
import { ISessionContextFactory, SessionContextFactory, SessionContext } from './session-context';
import { IBackgroundDispatcher, BackgroundDispatcherFactory } from './background-dispatcher';
import { shouldAutoCompact } from './context-budget';
import { IChannelService, ChannelServiceFactory } from '../channel-service';
import type { InboundInput, IMessageGateway, StickerReference } from '../../../../plugins/channels/contracts';

export type { InboundInput, IMessageGateway };

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

// User-facing explanation shown when a manual-mode session is auto-compacted.
const COMPACTION_NOTICE = {
  proactive: "This conversation got long enough to crowd the model's context window, so I summarized what we've covered into memory and started a fresh session. Nothing is lost — carry on.",
  reactive: "The conversation outgrew the model's context limit, so I summarized this session into memory, started a fresh one, and I'm retrying your last message now.",
} as const;

function normalizeInput(input: InboundInput): { text: string; images?: ImageAttachment[]; stickers?: StickerReference[] } {
  if (typeof input === 'string') {
    return { text: input };
  }
  if (input == null || typeof input !== 'object') {
    return { text: '' };
  }
  return { text: input.text, images: input.images, stickers: input.stickers };
}

class MessageGateway implements IMessageGateway {
  constructor(
    private logger: ILogger,
    private channel: string,
    private sessionContextFactory: ISessionContextFactory,
    private backgroundDispatcher: IBackgroundDispatcher,
    private mainAgent: IMainAgent,
    private channelService: IChannelService,
    private auditRepo: IAuditLogRepository,
  ) {}

  async handle(input: InboundInput, originId: string, options?: ProcessOptions): Promise<ProcessedMessage> {
    const { text, images, stickers } = normalizeInput(input);
    const safeMessage = toSafeMessage(text);
    const channel = options?.channel ?? this.channel;

    this.logger.info(`Processing message from ${channel} (origin: ${originId}): "${previewMessage(safeMessage)}"${images?.length ? ` with ${images.length} image(s)` : ''}`);

    const { sessionService, messageService, memoryService } = this.sessionContextFactory.resolve(originId, options?.sessionId);

    this.channelService.record(channel, originId);

    if (isCommand(safeMessage)) {
      const commandResult = handleCommand(safeMessage, { source: channel, trusted: !!options?.toolsEnabled });

      if (commandResult.action === 'compact') {
        return this.handleCompact(
          { sessionService, messageService, memoryService },
          safeMessage,
          images,
          channel,
          commandResult.response || '',
          options,
        );
      }

      const response = commandResult.response || '';
      this.backgroundDispatcher.persistConversation({
        sessionId: sessionService.getSession().id,
        ask: safeMessage,
        askImages: images,
        answer: response,
        channel,
      });
      return response;
    }

    const runId = options?.runId ?? generateId();
    const turnOptions = { ...options, runId };
    const sessionCtx: SessionContext = { sessionService, messageService, memoryService };

    // Manual-mode safety valve (proactive): if the session is near the manager's
    // context window, summarize it into memory and start fresh before this turn.
    if (
      config.SESSION.SUMMARIZER_MODE === 'manual' &&
      shouldAutoCompact(messageService.getHistory(), metadataString(messageService.getSessionMetadata(), 'compactSummary'))
    ) {
      this.logger.info(`Context near limit on ${channel} — auto-compacting manual-mode session before turn`);
      options?.onProgress?.(`🗜️ ${COMPACTION_NOTICE.proactive}`);
      await this.compactAndRotate(sessionCtx, channel, options);
    }

    let response: ProcessedMessage | undefined;
    let compactedOnce = false;
    while (response === undefined) {
      try {
        response = await this.mainAgent.run({
          userMessage: safeMessage,
          channel,
          message: messageService,
          images,
          stickers,
          target: originId,
          options: turnOptions,
        });
      } catch (err) {
        // Manual-mode safety valve (reactive): a context-length overflow →
        // compact, rotate and retry the turn once on the fresh session.
        if (
          err instanceof AIServiceError &&
          err.code === 'context_length' &&
          config.SESSION.SUMMARIZER_MODE === 'manual' &&
          !compactedOnce &&
          messageService.getHistory().length > 0
        ) {
          compactedOnce = true;
          this.logger.warn(`Context overflow on ${channel} turn — auto-compacting and retrying once`);
          options?.onProgress?.(`🗜️ ${COMPACTION_NOTICE.reactive}`);
          await this.compactAndRotate(sessionCtx, channel, options);
          continue;
        }

        // A provider error (auth, rate limit, unavailable, …) is still an outcome:
        // persist the turn so it survives a reload and the web can offer "Resend".
        if (err instanceof AIServiceError && err.code !== 'aborted') {
          this.logger.warn(`Provider error on ${channel} turn (${err.code}): ${err.message}`);
          this.backgroundDispatcher.persistConversation({
            sessionId: messageService.getSessionId(),
            ask: safeMessage,
            askImages: images,
            answer: err.message,
            answerErrorCode: err.code,
            channel,
          });
        }
        throw err;
      }
    }

    this.logger.info(`Processed message from ${channel}: "${previewMessage(safeMessage)}" => "${previewMessage(response)}"`);

    const sessionId = messageService.getSessionId();
    const finalResponse = this.appendGateBlockNotice(response, runId, channel);

    this.backgroundDispatcher.persistConversation({ sessionId, ask: safeMessage, askImages: images, answer: finalResponse, channel });
    this.backgroundDispatcher.summarizeConversation({
      sessionId,
      ask: safeMessage,
      answer: response,
      channel,
      memoryService,
    });

    return finalResponse;
  }

  // When a tool call this turn was refused by the domain gate, tell the user
  // which domain and how to allow it. The web UI has its own banner for this
  // (GET /api/admin/chat/gate-blocks), so it's skipped here; streaming
  // responses (non-string) are skipped too.
  private appendGateBlockNotice(response: string, runId: string, channel: string): string {
    if (channel === 'web' || typeof response !== 'string') {
      return response;
    }

    try {
      const blocks = findGateBlocks(this.auditRepo, { runId, allowed: config.ALLOWED_DOMAINS });
      if (blocks.length === 0) {
        return response;
      }

      const notice = formatGateBlockNotice(blocks);
      this.logger.info(`Domain-gate notice added for ${blocks.map((b) => b.domain).join(', ')}`);
      return response ? `${response}\n\n${notice}` : notice;
    } catch (err) {
      this.logger.warn('Failed to build domain-gate notice', {
        error: err instanceof Error ? err.message : String(err),
      });
      return response;
    }
  }

  private async handleCompact(
    ctx: SessionContext,
    safeMessage: string,
    images: ImageAttachment[] | undefined,
    channel: string,
    confirmation: string,
    options?: ProcessOptions,
  ): Promise<ProcessedMessage> {
    if (ctx.messageService.getHistory().length === 0) {
      return 'Nothing to compact yet.';
    }

    const { compactedSessionId } = await this.compactAndRotate(ctx, channel, options);

    // Record the `/compact` command against the session it compacted, not the
    // fresh one — the new session must start empty.
    this.backgroundDispatcher.persistConversation({
      sessionId: compactedSessionId,
      ask: safeMessage,
      askImages: images,
      answer: confirmation,
      channel,
    });

    return confirmation;
  }

  // Summarize the current session into a memory and rotate into a fresh one
  // seeded with that summary. Shared by `/compact` and the manual-mode
  // auto-compaction safety valve. No-op (no rotation) when there is nothing to
  // compact.
  private async compactAndRotate(
    { sessionService, messageService, memoryService }: SessionContext,
    channel: string,
    options?: ProcessOptions,
  ): Promise<{ compactedSessionId: string; rotated: boolean }> {
    const history = messageService.getHistory();
    const compactedSessionId = sessionService.getSession().id;
    if (history.length === 0) return { compactedSessionId, rotated: false };

    const result = await this.backgroundDispatcher.compactConversation({
      sessionId: compactedSessionId,
      messages: history,
      channel,
      memoryService,
    });

    sessionService.forceRotate(result ? { compactSummary: result.content } : undefined);
    options?.onSessionRotated?.(sessionService.getSession().id);
    this.logger.info(`Compacted session ${compactedSessionId} → ${sessionService.getSession().id} (${channel})`);
    return { compactedSessionId, rotated: true };
  }
}

class MessageGatewayFactory {
  static create(logger: ILogger, channel: string, db: IDatabaseService, sessionManager: ISessionManager): MessageGateway {
    const sessionContextFactory = SessionContextFactory.create(logger, db, sessionManager);
    const backgroundDispatcher = BackgroundDispatcherFactory.create(logger, db, sessionManager);
    const mainAgent = MainAgentFactory.create(logger);
    const channelService = ChannelServiceFactory.create(db);
    const auditRepo = AuditLogRepositoryFactory.create(db);

    return new MessageGateway(logger, channel, sessionContextFactory, backgroundDispatcher, mainAgent, channelService, auditRepo);
  }
}

export { MessageGateway, MessageGatewayFactory }
