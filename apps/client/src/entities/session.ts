export interface SessionProps {
  id: string;
  source: string;
  startedAt: number;
  endedAt: number;
  messageCount: number;
  metadata: Record<string, unknown>;
}

export class Session {
  public readonly id: string;
  public readonly source: string;
  public readonly startedAt: number;
  public readonly endedAt: number;
  public readonly messageCount: number;
  public readonly metadata: Record<string, unknown>;

  constructor(props: SessionProps) {
    this.id = props.id;
    this.source = props.source;
    this.startedAt = props.startedAt;
    this.endedAt = props.endedAt;
    this.messageCount = props.messageCount;
    this.metadata = props.metadata;
  }

  isExpired(): boolean {
    return Date.now() > this.endedAt;
  }
}