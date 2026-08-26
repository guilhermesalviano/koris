import { Message } from "../entities/message";
import { IDatabaseService } from "../infrastructure/db-sqlite";
import { IMessageRepository, MessageRepositoryFactory } from "../repositories/message";
import { MessageRole, ImageAttachment } from "../types/messages";
import { ISessionService } from "./session-service";

interface IMessageService {
  save(props: { role: MessageRole; content: string; images?: ImageAttachment[] }): void;
  getHistory(): Message[];
  getSessionId(): string;
  getSessionMetadata(): Record<string, unknown>;
}

class MessageService implements IMessageService {
  private messageRepository: IMessageRepository;
  private session: ISessionService;

  constructor(messageRepository: IMessageRepository, session: ISessionService) {
    this.messageRepository = messageRepository;
    this.session = session;
  }

  save(props: { role: MessageRole; content: string; images?: ImageAttachment[] }) {
    this.session.ensureActiveSession();
    const message = new Message({
      sessionId: this.session.getSession().id,
      role: props.role,
      content: props.content,
      images: props.images,
    });
    this.messageRepository.save(message);
    this.session.updateCount();
  }

  getHistory(): Message[] {
    this.session.ensureActiveSession();
    const sessionId = this.session.getSession().id;
    return this.messageRepository.getBySessionId(sessionId);
  }

  getSessionId(): string {
    return this.session.getSession().id;
  }

  getSessionMetadata(): Record<string, unknown> {
    return this.session.getSession().metadata;
  }
}

class MessageServiceFactory {
  public static create(db: IDatabaseService, sessionService: ISessionService): MessageService {
    const messageRepository = MessageRepositoryFactory.create(db);

    return new MessageService(messageRepository, sessionService);
  }
}

export { IMessageService, MessageService, MessageServiceFactory }