import { generateId } from "../utils/generate-id";
import { nowISO } from "../utils/date";
import { ErrandState } from "../types/errand";

export interface ErrandProps {
  id?: string;
  goal: string;
  state?: ErrandState;
  originSessionId: string;
  pendingMessage?: string;
  notes?: string;
  result?: string;
  createdAt?: string;
  lastProgressAt?: string;
  closedAt?: string;
}

export class Errand {
  public readonly id: string;
  public readonly goal: string;
  public readonly state: ErrandState;
  public readonly originSessionId: string;
  public readonly pendingMessage?: string;
  public readonly notes?: string;
  public readonly result?: string;
  public readonly createdAt: string;
  public readonly lastProgressAt?: string;
  public readonly closedAt?: string;

  constructor(props: ErrandProps) {
    this.id = props.id ?? generateId();
    this.goal = props.goal;
    this.state = props.state ?? 'draft';
    this.originSessionId = props.originSessionId;
    this.pendingMessage = props.pendingMessage;
    this.notes = props.notes;
    this.result = props.result;
    this.createdAt = props.createdAt ?? nowISO();
    this.lastProgressAt = props.lastProgressAt;
    this.closedAt = props.closedAt;
  }
}
