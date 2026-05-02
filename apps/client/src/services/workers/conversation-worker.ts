import type { ILogger } from "../../infrastructure/logger";
import { IWorker } from "../../types/workers";
import { IMessageService } from "../message-service";

interface ConversationWorkerProps {
  sessionId: string,
  ask: string,
  answer: string,
  channel: string,
}

class ConversationWorker implements IWorker {
  constructor(
    private logger: ILogger,
    public name: string = 'conversationWorker',
    private messageService: IMessageService
  ) { }

  async run(
    props: ConversationWorkerProps
  ): Promise<void> {
    const { sessionId, ask, answer, channel } = props;
    this.logger.info(`Conversation worker started for session ${sessionId} in ${channel}`);

    try {
      this.messageService.save({ role: 'user', content: ask });
      this.messageService.save({ role: 'assistant', content: answer });
      this.logger.info(`Conversation worker completed for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to process conversation for session ${sessionId}`, { error });
    }
  }
}

class ConversationWorkerFactory {
  static create(logger: ILogger, messageService: IMessageService): IWorker {
    return new ConversationWorker(logger, 'conversationWorker', messageService);
  }
}

export { ConversationWorkerFactory };