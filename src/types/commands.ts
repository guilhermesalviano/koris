import readline from 'readline';

export interface CommandContext {
  source: string;
  session?: {
    messageCount: number;
    startTime: Date;
  };
  rl?: readline.Interface;
}

export interface CommandResult {
  response?: string;
  action?: 'exit' | 'clear' | 'reset' | 'none';
  handled: boolean;
}