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
  contentBuffer: string[];
  terminalWidth: number;
  terminalHeight: number;
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

  /** Title for the welcome message. Defaults to 'Assistant'. */
  title?: string;

  /** Show feature hints in welcome message. Defaults to true. */
  showHints?: boolean;

  /** Use fixed input layout with scrollable history. Defaults to true. */
  fixedInput?: boolean;
}

export function startTui(options: StartTuiOptions): void {
  const session: SessionState = {
    messageCount: 0,
    startTime: new Date(),
  };

  const colors = defaultColors;
  const fixedInput = options.fixedInput !== false;
  
  let contentBuffer: string[] = [];
  let terminalWidth = process.stdout.columns || 80;
  let terminalHeight = process.stdout.rows || 24;

  const clearScreen = () => console.clear();
  const println = (text = '') => {
    contentBuffer.push(text);
    if (!fixedInput) {
      console.log(text);
    }
  };

  const prompt = options.prompt ?? buildBeautifulPrompt(colors);
  const isCommand = options.isCommand ?? ((line: string) => line.startsWith('/'));
  const renderWelcome = options.renderWelcome ?? ((ctx) => defaultWelcome(ctx, options.title, options.showHints));
  const formatResponse = options.formatResponse ?? defaultFormatResponse;
  const confirmExit = options.confirmExit ?? true;
  const clearOnStart = options.clearOnStart ?? true;
  const assistantPrefix = options.assistantPrefix ?? '●';

  // ANSI escape codes for terminal control
  const ansi = {
    cursorHome: '\x1b[H',
    clearScreen: '\x1b[2J',
    clearLine: '\x1b[2K',
    altScreenOn: '\x1b[?1049h',
    altScreenOff: '\x1b[?1049l',
    cursorPos: (row: number, col: number) => `\x1b[${row};${col}H`,
  };

  // For fixed input, use dummy stream to prevent readline interference
  const dummyOutput = fixedInput ? {
    write: () => {},
    on: () => {},
    once: () => {},
  } as any : process.stdout;

  const rl = readline.createInterface({
    input: process.stdin,
    output: dummyOutput,
    terminal: true,
  });

  // Enable alternate screen buffer for fixed input (prevents terminal scrolling)
  if (fixedInput) {
    process.stdout.write(ansi.altScreenOn);
    process.stdout.write(ansi.clearScreen);
  }

  const ctx: TuiContext = {
    rl,
    session,
    colors,
    clear: clearScreen,
    println,
    contentBuffer,
    terminalWidth,
    terminalHeight,
  };

  // Handle terminal resize
  const handleResize = () => {
    terminalWidth = process.stdout.columns || 80;
    terminalHeight = process.stdout.rows || 24;
    ctx.terminalWidth = terminalWidth;
    ctx.terminalHeight = terminalHeight;
    if (fixedInput) {
      renderScreen();
    }
  };

  process.stdout.on('resize', handleResize);

  const renderScreen = () => {
    if (!fixedInput) return;
    
    // Move to home, clear screen
    process.stdout.write(ansi.clearScreen);
    process.stdout.write(ansi.cursorHome);
    
    // Calculate available height for content (leave room for input area)
    const inputAreaHeight = 3;
    const availableHeight = Math.max(3, terminalHeight - inputAreaHeight);
    
    // Show last N lines of content
    const startIdx = Math.max(0, contentBuffer.length - availableHeight);
    const visibleContent = contentBuffer.slice(startIdx);
    
    visibleContent.forEach(line => {
      console.log(line);
    });
    
    // Add padding to fill remaining space
    const paddingNeeded = Math.max(0, availableHeight - visibleContent.length);
    for (let i = 0; i < paddingNeeded; i++) {
      console.log('');
    }
    
    // Render fixed input area separator
    console.log(`${colors.dim}${'─'.repeat(terminalWidth)}${colors.reset}`);
    
    // Position cursor at bottom for input and write prompt (no newline)
    process.stdout.write(ansi.cursorPos(terminalHeight, 1));
    process.stdout.write(prompt);
  };

  if (clearOnStart) clearScreen();
  renderWelcome(ctx);
  
  if (fixedInput) {
    renderScreen();
  }

  rl.setPrompt(prompt);
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

      if (commandResult && commandResult.handled === false) {
        await handleNormalInput(trimmed);
        return;
      }

      if (commandResult) {
        if (commandResult.action === 'exit') {
          if (commandResult.response) println(`\n${colors.green}${commandResult.response}${colors.reset}`);
          process.stdout.removeListener('resize', handleResize);
          rl.close();
          return;
        }

        if (commandResult.action === 'clear') {
          contentBuffer = [];
          clearScreen();
          renderWelcome(ctx);
          if (fixedInput) {
            renderScreen();
          }
          rl.prompt();
          return;
        }

        if (commandResult.action === 'reset') {
          session.messageCount = 0;
          session.startTime = new Date();
          if (commandResult.response) println(`${colors.green}${commandResult.response}${colors.reset}\n`);
          if (fixedInput) {
            renderScreen();
          }
          rl.prompt();
          return;
        }

        if (commandResult.response) println(`\n${commandResult.response}\n`);
        if (fixedInput) {
          renderScreen();
        }
        rl.prompt();
        return;
      }

      rl.prompt();
      return;
    }

    await handleNormalInput(trimmed);
  });

  rl.on('close', () => {
    process.stdout.removeListener('resize', handleResize);
    println(`\n${colors.dim}Session ended. Messages: ${session.messageCount}${colors.reset}`);
    if (fixedInput) {
      // Disable alternate screen buffer and restore terminal
      process.stdout.write(ansi.altScreenOff);
    }
    process.exit(0);
  });

  if (confirmExit) {
    rl.on('SIGINT', () => {
      println('\n');
      rl.question(`${colors.yellow}Are you sure you want to exit? (y/n)${colors.reset} `, (answer: string) => {
        const a = answer.toLowerCase();
        if (a === 'y' || a === 'yes') {
          rl.close();
        } else {
          if (fixedInput) {
            renderScreen();
          }
          rl.prompt();
        }
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

    if (fixedInput) {
      renderScreen();
    }
    rl.prompt();
  }
}

/** Backwards-compatible alias. */
export function startTUI(options: StartTuiOptions): void {
  startTui(options);
}

function defaultWelcome(ctx: TuiContext, title?: string, showHints?: boolean): void {
  const { colors, println, terminalWidth } = ctx;
  const appTitle = title ?? 'Assistant';
  const displayHints = showHints !== false;

  // Calculate box width (leave 2 chars for padding on each side)
  const boxWidth = Math.max(30, terminalWidth - 4);
  const contentWidth = boxWidth - 4; // Account for borders and padding

  // Build top border
  const topBorder = `${colors.bright}${colors.cyan}┏${('━').repeat(boxWidth - 2)}┓${colors.reset}`;
  println(topBorder);

  // Build title line with dynamic spacing
  const titleContent = `✨  ${appTitle}  ✨`;
  const totalPadding = contentWidth - titleContent.length;
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  const titleLine = `${colors.bright}${colors.cyan}┃${colors.reset}  ${colors.bright}${colors.blue}${titleContent}${' '.repeat(Math.max(0, rightPadding))}${colors.reset}  ${colors.bright}${colors.cyan}┃${colors.reset}`;
  println(titleLine);

  // Build bottom border
  const bottomBorder = `${colors.bright}${colors.cyan}┗${('━').repeat(boxWidth - 2)}┛${colors.reset}`;
  println(bottomBorder);
  println();

  // Display current time
  const now = new Date();
  const timeStr = now.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  println(`${colors.dim}${colors.gray}🕐 ${timeStr}${colors.reset}`);
  println();

  // Feature hints
  if (displayHints) {
    println(`${colors.bright}${colors.magenta}📚 Quick Tips:${colors.reset}`);
    println(`  ${colors.cyan}•${colors.reset} Start commands with ${colors.bright}/${colors.reset}`);
    println(`  ${colors.cyan}•${colors.reset} Type ${colors.bright}/help${colors.reset} for available commands`);
    println(`  ${colors.cyan}•${colors.reset} Press ${colors.bright}Ctrl+C${colors.reset} to exit gracefully`);
    println();
  }

  println(`${colors.dim}Ready to assist! What can I help you with?${colors.reset}`);
  println();
}

function buildBeautifulPrompt(colors: typeof defaultColors): string {
  return `${colors.bright}${colors.blue}❯${colors.reset}${colors.cyan}${colors.bright} ${colors.reset}`;
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
