import readline from 'readline';

export interface CommandContext {
  source: string;
  /** Whether the sender is trusted (tools enabled). Gates config-mutating commands. */
  trusted?: boolean;
  session?: {
    messageCount: number;
    startTime: Date;
  };
  rl?: readline.Interface;
}

export interface CommandResult {
  response?: string;
  action?: 'exit' | 'clear' | 'reset' | 'compact' | 'none';
  handled: boolean;
}