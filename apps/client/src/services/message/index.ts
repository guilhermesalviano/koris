import { Message } from "../../entities/message";
import { IDatabaseService } from "../../infrastructure/db-sqlite";
import { IMessageRepository, MessageRepositoryFactory } from "../../repositories/message";

interface IMessageService {
  save(params: Message): string;
}

class MessageService implements IMessageService {
  private messageRepository: IMessageRepository;

  constructor(messageRepository: IMessageRepository) {
    this.messageRepository = messageRepository;
  }

  save (message: Message): string {
    this.messageRepository.save(message);
    return message.id;
  }
}

class MessageServiceFactory {
  public static create(db: IDatabaseService): MessageService {
    const messageRepository = MessageRepositoryFactory.create(db);

    return new MessageService(messageRepository);
  }
}

export { MessageServiceFactory, IMessageService }