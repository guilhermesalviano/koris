import { IMessageService } from "../services/message-service";

export function isSkillAlreadyLearned(skillName: string, history: ReturnType<IMessageService['getHistory']>): boolean {
  return history.some(msg => 
    msg.role === 'system' && 
    msg.content.includes(skillName)
  );
}