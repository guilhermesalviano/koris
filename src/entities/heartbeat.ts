import { generateId } from "../utils/generate-id";
import { BeatType } from "../types/beat";

export class Heartbeat {
  public readonly id: string;
  public readonly beat: string;
  public readonly type: BeatType;
  public readonly cronExpression: string;
  public lastRun?: Date;
  public readonly createdAt: Date;

  constructor(data: {
    id?: string;
    beat: string;
    type: BeatType;
    cronExpression: string;
    lastRun?: Date;
    createdAt?: Date;
  }) {
    this.id = data.id || generateId();
    this.beat = data.beat;
    this.type = data.type as BeatType;
    this.cronExpression = data.cronExpression;
    this.lastRun = data.lastRun;
    this.createdAt = data.createdAt || new Date();
  }
}
