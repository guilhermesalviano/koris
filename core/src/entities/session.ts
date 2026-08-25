import { generateId } from "../utils/generate-id";
import { nowISO } from "../utils/date";

export interface SessionProps {
  id?: string;
  entryChannel: string;
  startedAt?: string;
  endedAt?: string;
  messageCount?: number;
  metadata?: Record<string, unknown>;
}

export class Session {
  public readonly id: string;
  public readonly entryChannel: string;
  public readonly startedAt?: string;
  public readonly endedAt?: string;
  public readonly messageCount: number;
  public readonly metadata: Record<string, unknown>;

  constructor(props: SessionProps) {
    this.id = props.id || generateId();
    this.entryChannel = props.entryChannel;
    this.startedAt = props.startedAt || nowISO();
    this.endedAt = props.endedAt;
    this.messageCount = props.messageCount || 0;
    this.metadata = props.metadata || {};
  }
}