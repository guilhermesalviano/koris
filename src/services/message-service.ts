import { Message } from "../entities/message";
import { IDatabaseService } from "../infrastructure/db-sqlite";
import { IMessageRepository, MessageRepositoryFactory } from "../repositories/message";
import { MessageRole } from "../types/messages";
import { ISessionService } from "./session-service";

interface IMessageService {
  save(props: { role: MessageRole; content: string }): void;
  getHistory(): Message[];
}

class MessageService implements IMessageService {
  private messageRepository: IMessageRepository;
  private session: ISessionService;

  constructor(messageRepository: IMessageRepository, session: ISessionService) {
    this.messageRepository = messageRepository;
    this.session = session;
  }

  save(props: { role: MessageRole; content: string }) {
    const message = new Message({
      sessionId: this.session.getSession().id,
      role: props.role,
      content: props.content,
    });
    this.messageRepository.save(message);
    this.session.updateCount();
  }

  getHistory(): Message[] {
    const sessionId = this.session.getSession().id;
    return this.messageRepository.getBySessionId(sessionId);
  }
}

class MessageServiceFactory {
  public static create(db: IDatabaseService, sessionService: ISessionService): MessageService {
    const messageRepository = MessageRepositoryFactory.create(db);

    return new MessageService(messageRepository, sessionService);
  }
}

export { IMessageService, MessageService, MessageServiceFactory }