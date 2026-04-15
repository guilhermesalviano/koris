import { Message } from "../../entities/message";
import { IDatabaseService } from "../../infrastructure/db-sqlite";
import { IMessageRepository, MessageRepositoryFactory } from "../../repositories/message";
import { MessageRole } from "../../types/messages";

interface IMessageService {
  save(props: { sessionId: string; role: MessageRole; content: string }): void;
}

class MessageService implements IMessageService {
  private messageRepository: IMessageRepository;

  constructor(messageRepository: IMessageRepository) {
    this.messageRepository = messageRepository;
  }

  save(props: { sessionId: string; role: MessageRole; content: string }) {
    const message = new Message({
      sessionId: props.sessionId,
      role: props.role,
      content: props.content,
    });
    this.messageRepository.save(message);
  }
}

class MessageServiceFactory {
  public static create(db: IDatabaseService): MessageService {
    const messageRepository = MessageRepositoryFactory.create(db);

    return new MessageService(messageRepository);
  }
}

export { MessageServiceFactory, IMessageService }