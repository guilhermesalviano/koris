import * as readline from 'readline';
import { Transform } from 'stream';

// ANSI color codes
export const defaultColors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  white: '\x1b[97m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bgBlue: '\x1b[44m',
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
  /** If you return a string, it will be printed. If you return an `AsyncIterable<string>`, yielded chunks will be streamed to the output. */
  onInput(input: string, ctx: TuiContext): Promise<string | AsyncIterable<string> | void>;

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

  aiModel?: string;
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
  const renderWelcome = options.renderWelcome ?? ((ctx) => defaultWelcome(ctx, options.title, options.aiModel, options.showHints));
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

  // Layout in fixed mode:
  // - content area
  // - spinner status line
  // - separator line
  // - footer help line
  // - input line
  const maxContentLines = () => Math.max(1, terminalHeight - 4);
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

  const ansiRegex = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
  const visibleWidth = (value: string): number => value.replace(ansiRegex, '').length;

  const wrapSingleLineForWidth = (line: string, width: number): string[] => {
    const maxWidth = Math.max(1, width);
    if (line.length === 0) return [''];

    const wrapped: string[] = [];
    const tokens = line.match(/ +|[^ ]+/g) ?? [line];
    let currentLine = '';
    let currentWidth = 0;

    for (const token of tokens) {
      const isSpaces = token.startsWith(' ');
      const tokenWidth = isSpaces ? token.length : visibleWidth(token);

      if (isSpaces) {
        if (currentLine.length === 0) {
          currentLine = token;
          currentWidth = tokenWidth;
          continue;
        }

        if (currentWidth + tokenWidth <= maxWidth) {
          currentLine += token;
          currentWidth += tokenWidth;
          continue;
        }

        wrapped.push(currentLine.replace(/ +$/, ''));
        currentLine = '';
        currentWidth = 0;
        continue;
      }

      if (currentLine.length === 0) {
        currentLine = token;
        currentWidth = tokenWidth;
        continue;
      }

      if (currentWidth + tokenWidth <= maxWidth) {
        currentLine += token;
        currentWidth += tokenWidth;
        continue;
      }

      wrapped.push(currentLine.replace(/ +$/, ''));
      currentLine = token;
      currentWidth = tokenWidth;
    }

    if (currentLine.length > 0) wrapped.push(currentLine);
    return wrapped.length > 0 ? wrapped : [''];
  };

  const wrapLinesForTerminal = (text: string): string[] => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (!fixedInput) return lines;
    return lines.flatMap((line) => wrapSingleLineForWidth(line, terminalWidth));
  };

  const println = (text = '') => {
    const lines = wrapLinesForTerminal(text);

    // If user is scrolled up, keep their viewport anchored as new lines arrive.
    if (fixedInput && scrollOffset > 0) scrollOffset += lines.length;

    for (const line of lines) {
      contentBuffer.push(line);
      if (!fixedInput) console.log(line);
    }

    if (fixedInput) {
      ensureScrollOffsetInRange();
    }
  };

  let renderScreen: () => void = () => undefined;
  let renderScheduled: NodeJS.Timeout | undefined;
  let spinnerStatus = '';

  const requestRender = () => {
    if (!fixedInput) return;
    if (renderScheduled) return;

    // Coalesce rapid wheel/key events to reduce flicker and prevent interleaving with readline writes.
    renderScheduled = setTimeout(() => {
      renderScheduled = undefined;
      renderScreen();
    }, 16);
  };

  const buildSeparatorLine = (spinnerStatus: string) => {
    const prefix = spinnerStatus ? `- ${spinnerStatus} ` : '';
    const dashCount = Math.max(0, terminalWidth - prefix.length);
    return `${colors.dim}${prefix}${'─'.repeat(dashCount)}${colors.reset}`;
  };

  const buildSpinnerLine = (status: string) => {
    if (!status) return '';
    return `${colors.dim}${colors.gray}${status.slice(0, terminalWidth)}${colors.reset}`;
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
  const footerText = `Commands: /help - /clear - /reset - /exit`;
  const renderFooterLine = () => {
    if (!fixedInput) return;
    // Save/restore cursor so footer paint never steals input cursor position.
    process.stdout.write('\x1b7');
    process.stdout.write(ansi.cursorPos(terminalHeight -1, 1));
    process.stdout.write(buildSeparatorLine(""));
    process.stdout.write(ansi.cursorPos(terminalHeight, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(`${colors.bright}${colors.cyan}${footerText.slice(0, terminalWidth)}${colors.reset}`);
    process.stdout.write('\x1b8');
  };

  const anyRl = rl as any;
  if (fixedInput && typeof anyRl._refreshLine === 'function') {
    const originalRefreshLine = anyRl._refreshLine.bind(rl);
    anyRl._refreshLine = (...args: unknown[]) => {
      originalRefreshLine(...args);
      renderFooterLine();
    };
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

    // Spinner status row (line above separator)
    process.stdout.write(ansi.cursorPos(terminalHeight - 4, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(buildSpinnerLine(spinnerStatus));

    // Separator row above input
    process.stdout.write(ansi.cursorPos(terminalHeight - 3, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(buildSeparatorLine(''));

    // Input pinned to row above the footer
    process.stdout.write(ansi.cursorPos(terminalHeight - 2, 1));

    rl.resume();
    if (typeof anyRl._refreshLine === 'function') {
      anyRl._refreshLine();
    } else {
      rl.prompt(true);
      renderFooterLine();
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

    println(`${colors.bgBlue}${colors.white} YOU ${colors.reset} ${trimmed}`);
    println();
    if (fixedInput) requestRender();

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
      (rl as any).line = '';
      (rl as any).cursor = 0;

      process.stdout.write('\x1b7'); // save cursor
      process.stdout.write(ansi.cursorPos(terminalHeight, 1));
      process.stdout.write(ansi.clearLine);
      process.stdout.write(`${colors.yellow}Are you sure you want to exit? (y/n)${colors.reset} `);
      process.stdout.write('\x1b8'); // restore cursor

      const onKey = (key: string) => {
        const k = key.toLowerCase();

        if (k === 'y') {
          rl.close();
        } else {
          process.stdout.write('\x1b7');
          process.stdout.write(ansi.cursorPos(terminalHeight, 1));
          process.stdout.write(ansi.clearLine);
          process.stdout.write(`${colors.bright}${colors.cyan}${footerText.slice(0, terminalWidth)}${colors.reset}`);
          process.stdout.write('\x1b8');
          rl.prompt();
        }

        (rl as any).input?.removeListener('keypress', onKey);
      };

      (rl as any).input?.on('keypress', onKey);
    });
  }

  async function handleNormalInput(message: string): Promise<void> {
    session.messageCount++;

    const spinnerEnabled = options.spinner !== false;
    const stopSpinner = startSpinner(
      typeof options.spinner === 'object' ? options.spinner : undefined,
      spinnerEnabled,
      colors,
      fixedInput
        ? {
            onFrame: (text) => {
              spinnerStatus = text;
              requestRender();
            },
            onStop: () => {
              spinnerStatus = '';
              requestRender();
            },
          }
        : undefined
    );

    try {
      const response = await options.onInput(message, ctx);

      if (isAsyncIterable(response)) {
        await renderStreamedResponse(response);
      } else if (typeof response === 'string' && response.trim().length > 0) {
        const formatted = formatResponse(response, ctx);
        println(`${colors.reset}${assistantPrefix}${colors.reset} ${formatted}`);
        println();
      }
      stopSpinner();
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

  async function renderStreamedResponse(stream: AsyncIterable<string>): Promise<void> {
    let out = '';

    if (!fixedInput) {
      for await (const chunk of stream) out += chunk;
      if (!out.trim()) return;
      const formatted = formatResponse(out, ctx);
      println(`${colors.reset}${assistantPrefix}${colors.reset} ${formatted}`);
      println();
      return;
    }

    const baseIndex = contentBuffer.length;
    let renderedLineCount = 0;
    let lastRenderedAt = 0;
    const minRenderIntervalMs = 25;

    const renderCurrent = (force = false) => {
      const now = Date.now();
      if (!force && now - lastRenderedAt < minRenderIntervalMs) return;
      lastRenderedAt = now;

      const formatted = formatResponse(out, ctx);
      const rawLines = formatted.length > 0 ? formatted.replace(/\r\n/g, '\n').split('\n') : [''];
      rawLines[0] = `${colors.reset}${assistantPrefix}${colors.reset} ${rawLines[0]}`;
      const prefixedLines = rawLines.flatMap((line) => wrapSingleLineForWidth(line, terminalWidth));

      contentBuffer.splice(baseIndex, renderedLineCount, ...prefixedLines);
      renderedLineCount = prefixedLines.length;
      requestRender();
    };

    for await (const chunk of stream) {
      out += chunk;
      renderCurrent();
    }

    if (!out.trim()) return;

    renderCurrent(true);
    contentBuffer.splice(baseIndex + renderedLineCount, 0, '');
    requestRender();
  }
}

/** Backwards-compatible alias. */
export function startTUI(options: StartTuiOptions): void {
  startTui(options);
}

function defaultWelcome(ctx: TuiContext, title?: string, aiModel?: string, showHints?: boolean): void {
  const { colors, println, terminalWidth } = ctx;
  const appTitle = title ?? 'Assistant';
  const displayHints = showHints !== false;

  const topBorder = `${colors.bright}${colors.cyan}┏${('━').repeat(terminalWidth - 2)}┓${colors.reset}`;
  println(topBorder);

  const titleContent = `✨  ${appTitle}  ✨`;
  const titleLine = `${colors.bright}${colors.cyan}┃${colors.reset}  ${colors.bright}${colors.blue}${titleContent}${' '.repeat(Math.max(0, terminalWidth - (titleContent.length + 8)))}${colors.reset}  ${colors.bright}${colors.cyan}┃${colors.reset}`;
  println(titleLine);

  const bottomBorder = `${colors.bright}${colors.cyan}┗${('━').repeat(terminalWidth - 2)}┛${colors.reset}`;
  println(bottomBorder);

  const now = new Date();
  const timeStr = now.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  println(`${colors.dim}${colors.gray}Session started at ${timeStr}${colors.reset}`);
  println();

  if (displayHints) {
    println(`${colors.bright}${colors.magenta}Quick Tips:${colors.reset}`);
    println(`  ${colors.cyan}•${colors.reset} Start commands with ${colors.bright}/${colors.reset}`);
    println(`  ${colors.cyan}•${colors.reset} Type ${colors.bright}/help${colors.reset} for available commands`);
    println(`  ${colors.cyan}•${colors.reset} Press ${colors.bright}Ctrl+C${colors.reset} to exit gracefully`);
    println();
  }

  const modelLabel = aiModel || 'Assistant';
  println(`${colors.dim}${modelLabel} is ready to assist! What can I help you with?${colors.reset}`);
  println();
}

function buildBeautifulPrompt(colors: typeof defaultColors): string {
  return `${colors.bright}${colors.blue}❯${colors.reset}${colors.cyan}${colors.bright} ${colors.reset}`;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<string> {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as { [Symbol.asyncIterator]?: unknown };
  return typeof maybe[Symbol.asyncIterator] === 'function';
}

function startSpinner(
  spinnerOptions: SpinnerOptions | undefined,
  enabled: boolean,
  colors: typeof defaultColors,
  hooks?: {
    onFrame(text: string): void;
    onStop(): void;
  }
): () => void {
  if (!enabled) return () => undefined;
  if (spinnerOptions?.enabled === false) return () => undefined;

  const frames = spinnerOptions?.frames ?? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const label = spinnerOptions?.label ?? 'Thinking';
  const intervalMs = spinnerOptions?.intervalMs ?? 80;

  let i = 0;
  const interval = setInterval(() => {
    const text = `${frames[i]} ${label}...`;
    if (hooks) {
      hooks.onFrame(text);
    } else {
      process.stdout.write(`\r${colors.dim}${colors.gray}${text}${colors.reset}`);
    }
    i = (i + 1) % frames.length;
  }, intervalMs);

  return () => {
    clearInterval(interval);
    if (hooks) {
      hooks.onStop();
      return;
    }
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
