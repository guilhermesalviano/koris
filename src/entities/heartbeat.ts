import { generateId } from "../utils/generate-id";
import { BeatType } from "../types/beat";

export class Heartbeat {
  public readonly id: string;
  public readonly beat: string;
  public readonly type: BeatType;
  public readonly cronExpression: string;
  public channel?: string;
  public target?: string;
  public lastRun?: Date;
  public readonly createdAt: Date;

  constructor(data: {
    id?: string;
    beat: string;
    type: BeatType;
    cronExpression: string;
    channel?: string;
    target?: string;
    lastRun?: Date;
    createdAt?: Date;
  }) {
    this.id = data.id || generateId();
    this.beat = data.beat;
    this.type = data.type as BeatType;
    this.cronExpression = data.cronExpression;
    this.channel = data.channel;
    this.target = data.target;
    this.lastRun = data.lastRun;
    this.createdAt = data.createdAt || new Date();
  }
}
