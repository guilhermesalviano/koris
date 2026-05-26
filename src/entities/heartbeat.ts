import { generateId } from "../utils/generate-id";
import { TaskType } from "../types/task";

export class Heartbeat {
  public readonly id: string;
  public readonly task: string;
  public readonly type: TaskType;
  public readonly cronExpression: string;
  public lastRun?: Date;
  public readonly createdAt: Date;

  constructor(data: {
    id?: string;
    task: string;
    type: TaskType;
    cronExpression: string;
    lastRun?: Date;
    createdAt?: Date;
  }) {
    this.id = data.id || generateId();
    this.task = data.task;
    this.type = data.type as TaskType;
    this.cronExpression = data.cronExpression;
    this.lastRun = data.lastRun;
    this.createdAt = data.createdAt || new Date();
  }
}