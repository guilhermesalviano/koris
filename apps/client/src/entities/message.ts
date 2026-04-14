import { MessageRole } from "../types/messages";

interface MessageProps {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  created_at: string;
  tool_calls: unknown[];
  tool_results: unknown[];
}

export class Message {
  public readonly id: string;
  public readonly sessionId: string;
  public readonly role: MessageRole;
  public readonly content: string;
  public readonly created_at: string;
  public readonly tool_calls: unknown[];
  public readonly tool_results: unknown[];

  constructor(props: MessageProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.role = props.role;
    this.content = props.content;
    this.created_at = props.created_at;
    this.tool_calls = props.tool_calls;
    this.tool_results = props.tool_results;
  }
}