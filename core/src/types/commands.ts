import readline from 'readline';

export interface CommandContext {
  source: string;
  /** Whether the sender is trusted (tools enabled). Gates config-mutating commands. */
  trusted?: boolean;
  /** Stable id of the conversation origin (chat/user), surfaced by `/whoami`. */
  originId?: string;
  session?: {
    messageCount: number;
    startTime: Date;
  };
  rl?: readline.Interface;
}

export interface CommandResult {
  response?: string;
  /**
   * A follow-up the MessageGateway must perform:
   * - `clear`   — rotate into a fresh, empty session
   * - `compact` — summarise this session into memory, then rotate
   * - `memory`  — reply with the summary carried into this session
   * - `none`    — nothing beyond sending `response`
   */
  action?: 'clear' | 'compact' | 'memory' | 'none';
  handled: boolean;
}