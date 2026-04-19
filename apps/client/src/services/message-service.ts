import { Message } from "../entities/message";
import { IDatabaseService } from "../infrastructure/db-sqlite";
import { ILearnedSkillsRepository, LearnedSkillsRepositoryFactory } from "../repositories/learned-skills";
import { IMessageRepository, MessageRepositoryFactory } from "../repositories/message";
import { MessageRole } from "../types/messages";
import { ISessionService } from "./session-service";

interface IMessageService {
  save(props: { role: MessageRole; content: string }): void;
  getHistory(): Message[];
}

class MessageService implements IMessageService {
  private messageRepository: IMessageRepository;
  private learnedSkillsRepository: ILearnedSkillsRepository;
  private session: ISessionService;

  constructor(messageRepository: IMessageRepository, learnedSkillsRepository: ILearnedSkillsRepository, session: ISessionService) {
    this.messageRepository = messageRepository;
    this.learnedSkillsRepository = learnedSkillsRepository;
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
    const buildSkillLearned = this.learnedSkillsRepository.getAll();
    const sessionId = this.session.getSession().id;
    const history = buildSkillLearned.map(skill => new Message({
      id: skill.id,
      sessionId,
      role: 'system',
      content: skill.skill_content,
      createdAt: skill.learned_at,
    }));
    history.push(...this.messageRepository.getBySessionId(sessionId));
    return history;
  }
}

class MessageServiceFactory {
  public static create(db: IDatabaseService, sessionService: ISessionService): MessageService {
    const learnedSkillsRepository = LearnedSkillsRepositoryFactory.create(db);
    const messageRepository = MessageRepositoryFactory.create(db);

    return new MessageService(messageRepository, learnedSkillsRepository, sessionService);
  }
}

export { MessageServiceFactory, IMessageService }