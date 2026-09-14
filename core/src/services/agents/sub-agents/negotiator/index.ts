import { buildErrandService } from '../../../errands';
import { runErrandOperation } from '../../../errands/operations';
import type { IDatabaseService } from '../../../../infrastructure/db-sqlite';
import type { ILogger } from '../../../../infrastructure/logger';
import type { ISessionManager } from '../../../session-manager';
import { defineSubAgent, type InboundClaim, type InboundPeerMessage } from '../contracts';
import { NEGOTIATOR, type NegotiatorApi } from './key';
import { Negotiator } from './sub-agent';

interface NegotiatorRouteDeps {
  logger: ILogger;
  db: IDatabaseService;
  sessionManager: ISessionManager;
}

export function createNegotiatorInboundRoute(
  negotiator: Pick<NegotiatorApi, 'run'>,
  { logger, db, sessionManager }: NegotiatorRouteDeps,
): (message: InboundPeerMessage) => Promise<InboundClaim | null> {
  return async (message) => {
    const routesErrands = message.isTrustedSender !== undefined
      && (!message.isCommand || message.isTrustedSender === false);
    if (!routesErrands) return null;

    const errandService = buildErrandService(logger, db, sessionManager);
    if (!errandService) return null;

    const activeErrand = errandService.findActiveForPeer(message.channel, message.originId, message.peerAliases);
    if (activeErrand) {
      return {
        sessionId: activeErrand.sessionId,
        handle: ({ sessionService, messageService }) => runErrandOperation(activeErrand.errand.id, async () => {
          const messageHistory = messageService.getHistory();
          messageService.save({ role: 'user', content: message.text, images: message.images });
          const result = await negotiator.run({
            errandId: activeErrand.errand.id,
            sessionId: sessionService.getSession().id,
            channel: message.channel,
            peerMessage: message.text,
            peerImages: message.images,
            messageHistory,
          });
          if (result.reply) messageService.save({ role: 'assistant', content: result.reply });
          return result.reply;
        }),
      };
    }

    if (message.isTrustedSender !== false) return null;

    const reopenedErrand = errandService.reopenForPeer(message.channel, message.originId, message.text, message.peerAliases);
    if (!reopenedErrand) return null;

    return {
      sessionId: reopenedErrand.sessionId,
      handle: ({ messageService }) => runErrandOperation(reopenedErrand.errand.id, async () => {
        messageService.save({ role: 'user', content: message.text, images: message.images });
        return '';
      }),
    };
  };
}

export const negotiatorSubAgent = defineSubAgent(NEGOTIATOR, (services) => {
  const { logger, db, sessionManager, completion } = services;
  const negotiator = new Negotiator(logger, db, sessionManager, completion, services.createPromptRepository());

  return {
    api: {
      composeOpener: (props) => negotiator.composeOpener(props),
      composeResume: (props) => negotiator.composeResume(props),
      run: (props) => negotiator.run(props),
    },
    triggers: { routeInbound: createNegotiatorInboundRoute(negotiator, { logger, db, sessionManager }) },
  };
});

export { NEGOTIATOR };
export type { NegotiatorApi } from './key';
