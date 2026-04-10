import * as readline from 'readline';
import { Transform } from 'stream';

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

  const contentBuffer: string[] = [];
  let terminalWidth = process.stdout.columns || 80;
  let terminalHeight = process.stdout.rows || 24;

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
    cursorHide: '\x1b[?25l',
    cursorShow: '\x1b[?25h',
    // Alternate scroll mode: mouse wheel becomes Up/Down key sequences while on the alt screen.
    // This is more reliable than full mouse reporting across terminals and avoids terminal viewport scrolling.
    mouseOn: '\x1b[?1007h',
    mouseOff: '\x1b[?1007l',
    cursorPos: (row: number, col: number) => `\x1b[${row};${col}H`,
  };

  let scrollOffset = 0; // 0 = latest; higher = scrolled up.

  const maxContentLines = () => Math.max(1, terminalHeight - 2);
  const ensureScrollOffsetInRange = () => {
    const maxOffset = Math.max(0, contentBuffer.length - maxContentLines());
    scrollOffset = Math.max(0, Math.min(maxOffset, scrollOffset));
  };

  const clearScreen = () => {
    if (fixedInput) {
      process.stdout.write(ansi.clearScreen);
      process.stdout.write(ansi.cursorHome);
    } else {
      console.clear();
    }
  };

  const println = (text = '') => {
    // If user is scrolled up, keep their viewport anchored as new lines arrive.
    if (fixedInput && scrollOffset > 0) scrollOffset += 1;

    contentBuffer.push(text);

    if (!fixedInput) {
      console.log(text);
    } else {
      ensureScrollOffsetInRange();
    }
  };

  let renderScreen: () => void = () => undefined;
  let renderScheduled: NodeJS.Timeout | undefined;

  const requestRender = () => {
    if (!fixedInput) return;
    if (renderScheduled) return;

    // Coalesce rapid wheel/key events to reduce flicker and prevent interleaving with readline writes.
    renderScheduled = setTimeout(() => {
      renderScheduled = undefined;
      renderScreen();
    }, 16);
  };

  const createInputFilter = (handlers: {
    line(dir: 'up' | 'down'): void;
    page(dir: 'up' | 'down'): void;
  }): Transform => {
    // We support multiple scroll input sources:
    // - Alternate scroll mode (1007): wheel becomes Up/Down key sequences while in the alt screen
    // - PageUp/PageDown keys
    // - (Optional) mouse-reporting formats if the terminal still emits them
    let pending = '';

    const decodeWheel = (rawBtn: number): 'up' | 'down' | undefined => {
      const btn = rawBtn >= 96 ? rawBtn - 32 : rawBtn;
      if (btn === 64) return 'up';
      if (btn === 65) return 'down';
      return undefined;
    };

    const t = new Transform({
      transform(chunk, _enc, cb) {
        pending += chunk.toString('latin1');

        const pushText = (s: string) => {
          if (s.length > 0) this.push(Buffer.from(s, 'latin1'));
        };

        while (pending.length > 0) {
          const idxSgr = pending.indexOf('\x1b[<');
          const idxX10 = pending.indexOf('\x1b[M');
          const idxUp = pending.indexOf('\x1b[A');
          const idxDown = pending.indexOf('\x1b[B');
          const idxPgUp = pending.indexOf('\x1b[5~');
          const idxPgDown = pending.indexOf('\x1b[6~');

          const indices = [idxSgr, idxX10, idxUp, idxDown, idxPgUp, idxPgDown].filter((i) => i !== -1);
          const start = indices.length ? Math.min(...indices) : -1;

          if (start === -1) {
            pushText(pending);
            pending = '';
            break;
          }

          if (start > 0) {
            pushText(pending.slice(0, start));
            pending = pending.slice(start);
          }

          // Alternate scroll mode (1007) wheel events
          if (pending.startsWith('\x1b[A')) {
            handlers.line('up');
            pending = pending.slice(3);
            continue;
          }
          if (pending.startsWith('\x1b[B')) {
            handlers.line('down');
            pending = pending.slice(3);
            continue;
          }

          // Page keys
          if (pending.startsWith('\x1b[5~')) {
            handlers.page('up');
            pending = pending.slice(4);
            continue;
          }
          if (pending.startsWith('\x1b[6~')) {
            handlers.page('down');
            pending = pending.slice(4);
            continue;
          }

          // Mouse reporting formats (if emitted)
          if (pending.startsWith('\x1b[<')) {
            const m = pending.match(/^\x1b\[<([0-9]+);([0-9]+);([0-9]+)([mM])/);
            if (!m) break;

            const dir = decodeWheel(Number(m[1]));
            if (dir) handlers.line(dir);
            pending = pending.slice(m[0].length);
            continue;
          }

          if (pending.startsWith('\x1b[M')) {
            if (pending.length < 6) break;

            const cbByte = pending.charCodeAt(3) - 32;
            const dir = decodeWheel(cbByte);
            if (dir) handlers.line(dir);
            pending = pending.slice(6);
            continue;
          }

          const u = pending.match(/^\x1b\[([0-9]+);([0-9]+);([0-9]+)([mM])/);
          if (u) {
            const dir = decodeWheel(Number(u[1]));
            if (dir) handlers.line(dir);
            pending = pending.slice(u[0].length);
            continue;
          }

          pushText(pending.slice(0, 1));
          pending = pending.slice(1);
        }

        cb();
      },
      flush(cb) {
        if (pending.length) this.push(Buffer.from(pending, 'latin1'));
        pending = '';
        cb();
      },
    });

    const anyT = t as any;
    anyT.isTTY = Boolean((process.stdin as any).isTTY);
    anyT.setRawMode = (mode: boolean) => (process.stdin as any).setRawMode?.(mode);

    return t;
  };

  const inputFilter = fixedInput
    ? createInputFilter({
        line: (dir) => {
          const delta = Math.max(1, Math.min(5, Math.floor(maxContentLines() / 12) + 1));
          scrollOffset += dir === 'up' ? delta : -delta;
          ensureScrollOffsetInRange();
          requestRender();
        },
        page: (dir) => {
          const delta = maxContentLines();
          scrollOffset += dir === 'up' ? delta : -delta;
          ensureScrollOffsetInRange();
          requestRender();
        },
      })
    : undefined;

  if (inputFilter) {
    process.stdin.pipe(inputFilter);
  }

  const inputStream = inputFilter ?? process.stdin;

  const rl = readline.createInterface({
    input: inputStream,
    output: process.stdout,
    terminal: true,
  });

  rl.setPrompt(prompt);

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

  let isRendering = false;
  let renderQueued = false;

  renderScreen = () => {
    if (!fixedInput) return;
    if (isRendering) {
      renderQueued = true;
      return;
    }
    isRendering = true;

    ensureScrollOffsetInRange();

    rl.pause();

    const availableHeight = maxContentLines();
    const startIdx = Math.max(0, contentBuffer.length - availableHeight - scrollOffset);
    const endIdx = Math.min(contentBuffer.length, startIdx + availableHeight);
    const visibleContent = contentBuffer.slice(startIdx, endIdx);

    // Repaint content area line-by-line to reduce flicker.
    for (let row = 0; row < availableHeight; row++) {
      process.stdout.write(ansi.cursorPos(row + 1, 1));
      process.stdout.write(ansi.clearLine);
      const line = visibleContent[row];
      if (typeof line === 'string') process.stdout.write(line);
    }

    // Separator row (just above the input line)
    process.stdout.write(ansi.cursorPos(terminalHeight - 1, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(`${colors.dim}${'─'.repeat(terminalWidth)}${colors.reset}`);

    // Input pinned to last row
    process.stdout.write(ansi.cursorPos(terminalHeight, 1));

    rl.resume();
    const anyRl = rl as any;
    if (typeof anyRl._refreshLine === 'function') {
      anyRl._refreshLine();
    } else {
      rl.prompt(true);
    }

    isRendering = false;

    if (renderQueued) {
      renderQueued = false;
      requestRender();
    }
  };

  // Enable alternate screen buffer for fixed input and capture wheel scroll.
  if (fixedInput) {
    process.stdout.write(ansi.altScreenOn);
    process.stdout.write(ansi.cursorHide);
    process.stdout.write(ansi.mouseOn);
    clearScreen();
  }

  // Handle terminal resize
  const handleResize = () => {
    terminalWidth = process.stdout.columns || 80;
    terminalHeight = process.stdout.rows || 24;
    ctx.terminalWidth = terminalWidth;
    ctx.terminalHeight = terminalHeight;
    if (fixedInput) {
      requestRender();
    }
  };

  process.stdout.on('resize', handleResize);

  if (clearOnStart) clearScreen();
  renderWelcome(ctx);

  if (fixedInput) {
    requestRender();
  }

  rl.prompt();

  rl.on('line', async (input: string) => {
    // Any user action implies “go back to bottom”.
    scrollOffset = 0;

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
          contentBuffer.length = 0;
          scrollOffset = 0;
          clearScreen();
          renderWelcome(ctx);
          if (fixedInput) {
            requestRender();
          }
          rl.prompt();
          return;
        }

        if (commandResult.action === 'reset') {
          session.messageCount = 0;
          session.startTime = new Date();
          if (commandResult.response) println(`${colors.green}${commandResult.response}${colors.reset}\n`);
          if (fixedInput) {
            requestRender();
          }
          rl.prompt();
          return;
        }

        if (commandResult.response) println(`\n${commandResult.response}\n`);
        if (fixedInput) {
          requestRender();
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

    if (inputFilter) {
      try {
        process.stdin.unpipe(inputFilter);
      } catch {
        // ignore
      }
      inputFilter.destroy();
    }

    if (fixedInput) {
      process.stdout.write(ansi.mouseOff);
      process.stdout.write(ansi.cursorShow);
      process.stdout.write(ansi.altScreenOff);
    }

    process.exit(0);
  });

  if (confirmExit) {
    rl.on('SIGINT', () => {
      println('\n');
      if (fixedInput) requestRender();

      rl.question(`${colors.yellow}Are you sure you want to exit? (y/n)${colors.reset} `, (answer: string) => {
        const a = answer.toLowerCase();
        if (a === 'y' || a === 'yes') {
          rl.close();
        } else {
          if (fixedInput) {
            requestRender();
          }
          rl.prompt();
        }
      });
    });
  }

  async function handleNormalInput(message: string): Promise<void> {
    session.messageCount++;

    // The legacy spinner writes directly to stdout and can interfere with the fixed input layout.
    const spinnerEnabled = (options.spinner === true || typeof options.spinner === 'object') && !fixedInput;
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
      requestRender();
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
