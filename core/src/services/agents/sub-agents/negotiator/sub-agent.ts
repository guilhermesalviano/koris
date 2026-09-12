import { IDatabaseService } from "../../../../infrastructure/db-sqlite";
import type { ILogger } from "../../../../infrastructure/logger";
import { IPromptRepository, PromptRepositoryFactory } from "../../../../repositories/prompt";
import { getAIProvider } from "../../../providers";
import { AICompletionService, IAICompletionService } from "../../../ai-completion-service";
import { NEGOTIATOR_INSTRUCTIONS } from "../../../../constants";
import { replacePlaceholders } from "../../../../utils/prompt";
import { parseNegotiatorResponse } from "../../../../utils/negotiator-response";
import { ISessionManager } from "../../../session-manager";
import { buildErrandService } from "../../../errands";
import type { Message } from "../../../../entities/message";

export interface NegotiatorTurnProps {
  errandId: string;
  sessionId: string;
  channel: string;
  peerMessage: string;
  messageHistory: Message[];
}

export interface NegotiatorTurnResult {
  reply: string;
  applied: 'continue' | 'escalate' | 'resolved' | 'failed' | 'skipped';
}

const HOLDING_REPLY = "Let me check on that and get back to you shortly.";

class Negotiator {
  constructor(
    private logger: ILogger,
    private db: IDatabaseService,
    private sessionManager: ISessionManager,
    private completionService: IAICompletionService,
    private promptRepository: IPromptRepository,
  ) {}

  async run(props: NegotiatorTurnProps): Promise<NegotiatorTurnResult> {
    const errandService = buildErrandService(this.logger, this.db, this.sessionManager);
    if (!errandService) {
      this.logger.warn('Negotiator: errands are unavailable (no channel manager is running)');
      return { reply: '', applied: 'skipped' };
    }

    const errand = errandService.get(props.errandId);
    if (!errand) {
      this.logger.warn(`Negotiator: errand ${props.errandId} not found`);
      return { reply: '', applied: 'skipped' };
    }

    const instructions = replacePlaceholders(NEGOTIATOR_INSTRUCTIONS, {
      v1: errand.goal,
      v2: errand.notes || '(none yet)',
    });

    const payload = await this.promptRepository.build({
      userMessage: props.peerMessage,
      channel: props.channel,
      messageHistory: props.messageHistory,
      toolsEnabled: false,
      learnedSkillsEnabled: false,
      includeMemory: false,
      sessionId: props.sessionId,
      extraSystemBlocks: [instructions],
    });

    const response = await this.completionService.complete(payload, {
      audit: { sessionId: props.sessionId, channel: props.channel, runId: errand.id },
    });

    const verdict = response.kind === 'message'
      ? parseNegotiatorResponse(response.text)
      : { action: 'continue' as const, reply: '' };

    switch (verdict.action) {
      case 'escalate':
        errandService.escalate(errand.id, verdict.detail || 'The negotiator needs your input.', verdict.notes);
        break;
      case 'resolved':
        errandService.resolve(errand.id, verdict.detail || verdict.reply || 'Resolved.', verdict.notes);
        break;
      case 'failed':
        errandService.fail(errand.id, verdict.detail || verdict.reply || 'Failed.', verdict.notes);
        break;
      case 'continue':
      default:
        errandService.recordPeerReply(errand.id, verdict.notes);
        break;
    }

    const reply = verdict.reply || (verdict.action === 'escalate' ? HOLDING_REPLY : '');
    return { reply, applied: verdict.action };
  }
}

class NegotiatorFactory {
  static create(logger: ILogger, db: IDatabaseService, sessionManager: ISessionManager): Negotiator {
    const embedProvider = getAIProvider(logger, 'embed');
    const promptRepository = PromptRepositoryFactory.create(db, logger, embedProvider);
    const completionService = new AICompletionService(
      () => getAIProvider(logger, 'worker', { background: true }),
      logger,
      { role: 'worker', agentName: 'negotiator' },
    );
    return new Negotiator(logger, db, sessionManager, completionService, promptRepository);
  }
}

export { Negotiator, NegotiatorFactory };
