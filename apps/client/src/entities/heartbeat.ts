import { generateId } from "../utils/generate-id";

export class Heartbeat {
  public readonly id: string;
  public readonly task: string;
  public readonly cronExpression: string;
  public lastRun?: Date;
  public readonly createdAt: Date;

  constructor(data: {
    id?: string;
    task: string;
    cronExpression: string;
    lastRun?: Date;
    createdAt?: Date;
  }) {
    this.id = data.id || generateId();
    this.task = data.task;
    this.cronExpression = data.cronExpression;
    this.lastRun = data.lastRun;
    this.createdAt = data.createdAt || new Date();
  }
}