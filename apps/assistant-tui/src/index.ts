import * as readline from 'readline';

// ANSI color codes
export const defaultColors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
} as const;

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
  colors: typeof defaultColors;
  clear(): void;
  println(text?: string): void;
}

export interface SpinnerOptions {
  enabled?: boolean;
  label?: string;
  intervalMs?: number;
  frames?: readonly string[];
}

export interface StartTuiOptions {
  /** Called for normal (non-command) input. If you return a string, it will be printed. */
  onInput(input: string, ctx: TuiContext): Promise<string | void>;

  /** If provided, command input is routed here (when `isCommand` matches). */
  onCommand?: (command: string, ctx: TuiContext) => Promise<TuiCommandResult | string | void>;

  /** Defaults to (line) => line.startsWith('/') */
  isCommand?: (line: string) => boolean;

  /** Customize the prompt string. */
  prompt?: string;

  /** Print a welcome banner on start (and after clear). */
  renderWelcome?: (ctx: TuiContext) => void;

  /** Customize response formatting. */
  formatResponse?: (response: string, ctx: TuiContext) => string;

  /** Thinking spinner. Set `false` to disable or provide options. */
  spinner?: boolean | SpinnerOptions;

  /** Ask for confirmation on Ctrl+C. Defaults to true. */
  confirmExit?: boolean;

  /** Clear terminal at startup. Defaults to true. */
  clearOnStart?: boolean;

  /** Prefix before assistant responses. Defaults to '●'. */
  assistantPrefix?: string;
}

export function startTui(options: StartTuiOptions): void {
  const session: SessionState = {
    messageCount: 0,
    startTime: new Date(),
  };

  const colors = defaultColors;
  const clear = () => console.clear();
  const println = (text = '') => console.log(text);

  const prompt = options.prompt ?? `${colors.cyan}>${colors.reset} `;
  const isCommand = options.isCommand ?? ((line: string) => line.startsWith('/'));
  const renderWelcome = options.renderWelcome ?? defaultWelcome;
  const formatResponse = options.formatResponse ?? defaultFormatResponse;
  const confirmExit = options.confirmExit ?? true;
  const clearOnStart = options.clearOnStart ?? true;
  const assistantPrefix = options.assistantPrefix ?? '●';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt,
    terminal: true,
  });

  const ctx: TuiContext = {
    rl,
    session,
    colors,
    clear,
    println,
  };

  if (clearOnStart) clear();
  renderWelcome(ctx);

  rl.prompt();

  rl.on('line', async (input: string) => {
    const trimmed = input.trim();

    if (!trimmed) {
      rl.prompt();
      return;
    }

    const shouldRouteToCommand = Boolean(options.onCommand) && isCommand(trimmed);

    if (shouldRouteToCommand && options.onCommand) {
      const result = await options.onCommand(trimmed, ctx);
      const commandResult = normalizeCommandResult(result);

      // If it wasn't handled, treat it as normal input.
      if (commandResult && commandResult.handled === false) {
        await handleNormalInput(trimmed);
        return;
      }

      if (commandResult) {
        if (commandResult.action === 'exit') {
          if (commandResult.response) println(`\n${colors.green}${commandResult.response}${colors.reset}`);
          rl.close();
          return;
        }

        if (commandResult.action === 'clear') {
          clear();
          renderWelcome(ctx);
          rl.prompt();
          return;
        }

        if (commandResult.action === 'reset') {
          session.messageCount = 0;
          session.startTime = new Date();
          if (commandResult.response) println(`${colors.green}${commandResult.response}${colors.reset}\n`);
          rl.prompt();
          return;
        }

        if (commandResult.response) println(`\n${commandResult.response}\n`);
        rl.prompt();
        return;
      }

      // undefined/null result: just continue
      rl.prompt();
      return;
    }

    await handleNormalInput(trimmed);
  });

  rl.on('close', () => {
    println(`\n${colors.dim}Session ended. Messages: ${session.messageCount}${colors.reset}`);
    process.exit(0);
  });

  if (confirmExit) {
    rl.on('SIGINT', () => {
      println('\n');
      rl.question(`${colors.yellow}Are you sure you want to exit? (y/n)${colors.reset} `, (answer: string) => {
        const a = answer.toLowerCase();
        if (a === 'y' || a === 'yes') rl.close();
        else rl.prompt();
      });
    });
  }

  async function handleNormalInput(message: string): Promise<void> {
    session.messageCount++;

    const spinnerEnabled = options.spinner === true || typeof options.spinner === 'object';
    const stopSpinner = startSpinner(
      typeof options.spinner === 'object' ? options.spinner : undefined,
      spinnerEnabled,
      colors
    );

    try {
      const response = await options.onInput(message, ctx);
      stopSpinner();

      if (typeof response === 'string' && response.trim().length > 0) {
        const formatted = formatResponse(response, ctx);
        println(`${colors.reset}${assistantPrefix}${colors.reset} ${formatted}`);
        println();
      }
    } catch (error) {
      stopSpinner();
      const msg = error instanceof Error ? error.message : String(error);
      println(`${colors.red}✗ Error:${colors.reset} ${msg}`);
      println();
    }

    rl.prompt();
  }
}

/** Backwards-compatible alias. */
export function startTUI(options: StartTuiOptions): void {
  startTui(options);
}

function defaultWelcome(ctx: TuiContext): void {
  const { colors, println } = ctx;

  println(`${colors.bright}${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
  println(`${colors.bright}${colors.cyan}║${colors.reset}  ${colors.bright}TUI${colors.reset}                                         ${colors.bright}${colors.cyan}║${colors.reset}`);
  println(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}`);
  println();
  println(`${colors.dim}Type your message. Commands start with '/'.${colors.reset}`);
  println();
}

function startSpinner(
  spinnerOptions: SpinnerOptions | undefined,
  enabled: boolean,
  colors: typeof defaultColors
): () => void {
  if (!enabled) return () => undefined;
  if (spinnerOptions?.enabled === false) return () => undefined;

  const frames = spinnerOptions?.frames ?? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const label = spinnerOptions?.label ?? 'Thinking';
  const intervalMs = spinnerOptions?.intervalMs ?? 80;

  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${colors.dim}${colors.gray}${frames[i]} ${label}...${colors.reset}`);
    i = (i + 1) % frames.length;
  }, intervalMs);

  return () => {
    clearInterval(interval);
    // Clear current line
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  };
}

function defaultFormatResponse(response: string, ctx: TuiContext): string {
  const { colors } = ctx;
  const lines = response.split('\n');

  return lines
    .map((line) => {
      const trimmed = line.trim();

      // Code fences
      if (trimmed.startsWith('```')) return `${colors.dim}${line}${colors.reset}`;

      // Bullets (- or •)
      if (/^\s*([-•])\s+/.test(line)) {
        const content = line.replace(/^\s*[-•]\s+/, '');
        return `  ${colors.cyan}•${colors.reset} ${content}`;
      }

      // Numbered lists
      if (/^\s*\d+\./.test(line)) return `  ${line.trim()}`;

      return line;
    })
    .join('\n');
}

function normalizeCommandResult(
  result: TuiCommandResult | string | void
): TuiCommandResult | undefined {
  if (typeof result === 'string') {
    return { response: result, action: 'none', handled: true };
  }
  if (!result) return undefined;
  return result;
}
