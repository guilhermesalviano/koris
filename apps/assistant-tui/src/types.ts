import type * as readline from 'readline';

import type { TuiColors } from './colors';

export interface SessionState {
  messageCount: number;
  startTime: Date;
}

export type TuiAction = 'exit' | 'clear' | 'reset' | 'none';

export interface TuiCommandResult {
  response?: string;
  action?: TuiAction;
  handled: boolean;
}

export interface TuiContext {
  rl: readline.Interface;
  session: SessionState;
  colors: TuiColors;
  clear(): void;
  println(text?: string): void;
  contentBuffer: string[];
  terminalWidth: number;
  terminalHeight: number;
  requestSignal?: AbortSignal;
  cancelActiveRequest(): boolean;
  /** Update the iteration badge shown in the bottom-right corner. Pass empty string to clear. */
  setIterationBadge(text: string): void;
}

export interface SpinnerOptions {
  enabled?: boolean;
  label?: string;
  intervalMs?: number;
  frames?: readonly string[];
}

export interface CommandSuggestion {
  name: string;
  description?: string;
}

export interface StartTuiOptions {
  onInput(input: string, ctx: TuiContext): Promise<string | AsyncIterable<string> | void>;
  onCommand?: (command: string, ctx: TuiContext) => Promise<TuiCommandResult | string | void>;
  isCommand?: (line: string) => boolean;
  prompt?: string;
  footerText?: string | ((ctx: TuiContext) => string);
  renderWelcome?: (ctx: TuiContext) => void;
  formatResponse?: (response: string, ctx: TuiContext) => string;
  spinner?: boolean | SpinnerOptions;
  answerDoneSound?: boolean;
  confirmExit?: boolean;
  clearOnStart?: boolean;
  assistantPrefix?: string;
  inputCursorMark?: string;
  title?: string;
  showHints?: boolean;
  fixedInput?: boolean;
  aiModel?: string;
  /** List of commands shown in the autocomplete popup when the user types /. */
  commands?: CommandSuggestion[];
}