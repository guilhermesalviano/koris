import { generateId } from "../utils/generate-id";
import { nowISO } from "../utils/date";

export interface SessionProps {
  id?: string;
  source: string;
  startedAt?: string;
  endedAt?: string;
  messageCount?: number;
  metadata?: Record<string, unknown>;
}

export class Session {
  public readonly id: string;
  public readonly source: string;
  public readonly startedAt?: string;
  public readonly endedAt?: string;
  public readonly messageCount: number;
  public readonly metadata: Record<string, unknown>;

  constructor(props: SessionProps) {
    this.id = props.id || generateId();
    this.source = props.source;
    this.startedAt = props.startedAt || nowISO();
    this.endedAt = props.endedAt;
    this.messageCount = props.messageCount || 0;
    this.metadata = props.metadata || {};
  }
}