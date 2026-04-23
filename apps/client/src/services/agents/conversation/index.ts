import type { ILogger } from "../../../infrastructure/logger";
import { IMessageService } from "../../message-service";

interface conversationWorkerProps {
  sessionId: string,
  ask: string,
  answer: string,
  logger: ILogger,
  channel: string,
  messageService: IMessageService,
}

async function conversationWorker(
  props: conversationWorkerProps
): Promise<void> {
  const { sessionId, ask, answer, logger, channel, messageService } = props;
  logger.info(`Conversation worker started for session ${sessionId} in ${channel}`);

  try {
    messageService.save({ role: 'user', content: ask });
    messageService.save({ role: 'assistant', content: answer });
    logger.info(`Conversation worker completed for session ${sessionId}`);
  } catch (error) {
    logger.error(`Failed to process conversation for session ${sessionId}`, { error });
  }
}

export { conversationWorker };
