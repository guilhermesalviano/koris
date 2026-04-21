import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { defaultColors } from './colors';
import { createInputFilter } from './input-filter';
import { buildBeautifulPrompt, defaultFormatResponse, isAsyncIterable } from './formatting';
import { startSpinner } from './spinner';
import type { SessionState, StartTuiOptions, TuiCommandResult, TuiContext } from './types';
import { defaultWelcome } from './welcome';

export { defaultColors } from './colors';
export type { SessionState, SpinnerOptions, StartTuiOptions, TuiAction, TuiCommandResult, TuiContext } from './types';

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
  const answerDoneSound = options.answerDoneSound ?? true;
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
  // Layout (bottom-up from terminalHeight):
  //   row terminalHeight     = footer text
  //   row terminalHeight - 1 = footer separator
  //   row terminalHeight - 2 = input line (readline)
  //   row terminalHeight - 3 = separator above input
  //   row terminalHeight - 4 = spinner / progress row  ← exclusively chrome
  //   rows 1 … terminalHeight - 5 = scrollable content area
  const maxContentLines = () => Math.max(1, terminalHeight - 5);
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

      // Hard-wrap a single token wider than the column budget.
      if (!isSpaces && tokenWidth > maxWidth) {
        if (currentLine.length > 0) {
          wrapped.push(currentLine.replace(/ +$/, ''));
          currentLine = '';
          currentWidth = 0;
        }
        let rem = token;
        while (visibleWidth(rem) > maxWidth) {
          wrapped.push(rem.slice(0, maxWidth));
          rem = rem.slice(maxWidth);
        }
        currentLine = rem;
        currentWidth = visibleWidth(rem);
        continue;
      }

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
      requestRender();
    }
  };

  let renderScreen: () => void = () => undefined;
  let renderScheduled: NodeJS.Timeout | undefined;
  let spinnerStatus = '';
  let activeAbortController: AbortController | undefined;

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
    if (scrollOffset > 0) {
      const hint = `↑ ${scrollOffset} line(s) above  ·  scroll to navigate`;
      return `${colors.dim}${colors.yellow}${hint.slice(0, terminalWidth)}${colors.reset}`;
    }
    if (!status) return '';
    return status;
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
  const renderFooterLine = () => {
    if (!fixedInput) return;
    const footerText = typeof options.footerText === 'function'
      ? options.footerText(ctx)
      : (options.footerText ?? '/ for commands');
    // Save/restore cursor so footer paint never steals input cursor position.
    process.stdout.write('\x1b7');
    process.stdout.write(ansi.cursorPos(terminalHeight -1, 1));
    process.stdout.write(buildSeparatorLine(""));
    process.stdout.write(ansi.cursorPos(terminalHeight, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(`${colors.bright}${colors.gray}${footerText.slice(0, terminalWidth)}${colors.reset}`);

    if (iterationBadge) {
      const badge = ` ${iterationBadge} `;
      const col = Math.max(1, terminalWidth - badge.length + 1);
      process.stdout.write(ansi.cursorPos(terminalHeight, col));
      process.stdout.write(`${colors.dim}${colors.cyan}${badge}${colors.reset}`);
    }

    process.stdout.write('\x1b8');
  };

  const renderSpinnerRow = () => {
    if (!fixedInput || isRendering) {
      return;
    }

    process.stdout.write('\x1b7');
    process.stdout.write(ansi.cursorPos(terminalHeight - 4, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(buildSpinnerLine(spinnerStatus));
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
    requestSignal: undefined,
    cancelActiveRequest: () => {
      if (!activeAbortController || activeAbortController.signal.aborted) {
        return false;
      }

      activeAbortController.abort();
      return true;
    },
    setIterationBadge: (text: string) => {
      iterationBadge = text;
      if (fixedInput) renderFooterLine();
    },
  };

  let isRendering = false;
  let renderQueued = false;
  let isBusy = false; // true while a request is in-flight (spinner running)
  let iterationBadge = ''; // bottom-right overlay text (e.g. "⟳ iter 3")

  // ── Autocomplete ────────────────────────────────────────────────────────────
  const allCommands = options.commands ?? [];
  let acSuggestions: { name: string; description?: string }[] = [];
  let acIndex = -1;
  let acMode: 'commands' | 'files' = 'commands';
  const AC_MAX_ROWS = 8;
  // Reserved area: always AC_MAX_ROWS rows, flush to the bottom just above the spinner.
  const acPopupBottom = () => terminalHeight - 5;
  const acPopupTop    = () => acPopupBottom() - AC_MAX_ROWS + 1;

  const renderAc = () => {
    if (!fixedInput) return;
    process.stdout.write('\x1b7');
    const count = Math.min(acSuggestions.length, AC_MAX_ROWS);
    for (let i = 0; i < AC_MAX_ROWS; i++) {
      const row = acPopupTop() + i;
      process.stdout.write(ansi.cursorPos(row, 1));
      process.stdout.write(ansi.clearLine);
      const sugIdx = i - (AC_MAX_ROWS - count);
      if (sugIdx < 0) continue;
      const item = acSuggestions[sugIdx];
      if (!item) continue;
      const isSelected = sugIdx === acIndex;
      const nameStr = item.name.padEnd(20);
      const desc = item.description ? `  ${colors.dim}${item.description}${colors.reset}` : '';
      if (isSelected) {
        process.stdout.write(`\x1b[46m\x1b[30m ${nameStr}\x1b[0m\x1b[46m\x1b[30m${desc} \x1b[0m`);
      } else {
        process.stdout.write(`${colors.dim} ${nameStr}${desc}${colors.reset}`);
      }
    }
    process.stdout.write('\x1b8');
  };

  const acDismiss = () => {
    if (acSuggestions.length === 0 && acIndex === -1) return;
    acSuggestions = [];
    acIndex = -1;
    renderAc();
  };

  const listFileCompletions = (query: string): { name: string; description: string }[] => {
    let dir: string;
    let base: string;
    if (query === '' || query.endsWith('/') || query.endsWith(path.sep)) {
      dir  = query || '.';
      base = '';
    } else {
      dir  = path.dirname(query) || '.';
      base = path.basename(query);
    }
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries
        .filter((e) => !base || e.name.toLowerCase().startsWith(base.toLowerCase()))
        .filter((e) => !e.name.startsWith('.') || base.startsWith('.'))
        .slice(0, AC_MAX_ROWS)
        .map((e) => {
          const fullPath = dir === '.' ? e.name : path.join(dir, e.name);
          return {
            name:        e.isDirectory() ? fullPath + '/' : fullPath,
            description: e.isDirectory() ? 'dir' : 'file',
          };
        });
    } catch {
      return [];
    }
  };

  const acUpdateFromInput = () => {
    if (isBusy) { acDismiss(); return; }
    const currentLine: string = (anyRl as any).line ?? '';

    // Command autocomplete: line starts with / (no spaces).
    if (currentLine.startsWith('/') && !currentLine.includes(' ')) {
      acMode = 'commands';
      const query = currentLine.toLowerCase();
      const next = allCommands.filter(c => c.name.toLowerCase().startsWith(query));
      acSuggestions = next;
      acIndex = next.length > 0 ? 0 : -1;
      renderAc();
      return;
    }

    // File autocomplete: line contains @ — trigger from the last @.
    const atIdx = currentLine.lastIndexOf('@');
    if (atIdx !== -1) {
      acMode = 'files';
      const fileQuery = currentLine.slice(atIdx + 1);
      const next = listFileCompletions(fileQuery);
      acSuggestions = next;
      acIndex = next.length > 0 ? 0 : -1;
      renderAc();
      return;
    }

    acDismiss();
  };

  /** Apply the chosen suggestion to the current input line. */
  const acApply = (chosen: string) => {
    if (acMode === 'files') {
      const currentLine: string = (anyRl as any).line ?? '';
      const atIdx = currentLine.lastIndexOf('@');
      const newLine = currentLine.slice(0, atIdx + 1) + chosen;
      (anyRl as any).line   = newLine;
      (anyRl as any).cursor = newLine.length;
    } else {
      (anyRl as any).line   = chosen;
      (anyRl as any).cursor = chosen.length;
    }
    if (typeof anyRl._refreshLine === 'function') (anyRl as any)._refreshLine();
  };

  // Patch _ttyWrite to swallow ↑/↓ history navigation while popup is open.
  {
    const originalTtyWrite = (anyRl as any)._ttyWrite?.bind(rl);
    if (typeof originalTtyWrite === 'function') {
      (anyRl as any)._ttyWrite = function (s: string, key?: { name?: string }) {
        if (key?.name === 'tab') return;
        if (acSuggestions.length > 0 && (key?.name === 'up' || key?.name === 'down')) {
          return;
        }
        return originalTtyWrite(s, key);
      };
    }
  }

  const onAcKeypress = (_ch: string, key?: { name?: string; shift?: boolean }) => {
    if (!fixedInput || isBusy) return;
    const k = key?.name;

    if (k === 'tab') {
      if (acSuggestions.length === 0) { acUpdateFromInput(); return; }
      acIndex = key?.shift
        ? (acIndex <= 0 ? acSuggestions.length - 1 : acIndex - 1)
        : (acIndex + 1) % acSuggestions.length;
      acApply(acSuggestions[acIndex].name);
      // Directories: drill in on Tab.
      if (acMode === 'files' && acSuggestions[acIndex]?.name.endsWith('/')) {
        setTimeout(acUpdateFromInput, 0);
      } else {
        renderAc();
      }
      return;
    }

    if (k === 'up' && acSuggestions.length > 0) {
      acIndex = acIndex <= 0 ? acSuggestions.length - 1 : acIndex - 1;
      renderAc();
      return;
    }

    if (k === 'down' && acSuggestions.length > 0) {
      acIndex = (acIndex + 1) % acSuggestions.length;
      renderAc();
      return;
    }

    if ((k === 'return' || k === 'enter') && acIndex >= 0 && acSuggestions[acIndex]) {
      const chosen = acSuggestions[acIndex].name;
      if (acMode === 'files' && chosen.endsWith('/')) {
        // Directory: drill in, don't submit.
        acApply(chosen);
        setTimeout(acUpdateFromInput, 0);
        return;
      }
      // Apply the selection; readline will emit 'line' with the updated value.
      acApply(chosen);
      return;
    }

    if (k === 'escape') { acDismiss(); return; }

    if (k !== 'return' && k !== 'enter') {
      setTimeout(acUpdateFromInput, 0);
    }
  };

  // prependListener so we run BEFORE readline's own keypress handler.
  const acInput = (anyRl as any).input as (NodeJS.EventEmitter & { prependListener?: Function }) | undefined;
  if (typeof acInput?.prependListener === 'function') {
    acInput.prependListener('keypress', onAcKeypress);
  } else {
    acInput?.on('keypress', onAcKeypress);
  }
  // ────────────────────────────────────────────────────────────────────────────

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

    // Repaint content area (rows 1 … terminalHeight-5) strictly above chrome.
    for (let row = 0; row < availableHeight; row++) {
      process.stdout.write(ansi.cursorPos(row + 1, 1));
      process.stdout.write(ansi.clearLine);
      const line = visibleContent[row];
      if (typeof line === 'string') process.stdout.write(line);
    }

    // Row terminalHeight-4: spinner/progress (exclusively chrome, never content).
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

    // Show real cursor when idle; keep it hidden while busy to prevent
    // it from jumping across the screen during spinner/render cycles.
    process.stdout.write(isBusy ? ansi.cursorHide : ansi.cursorShow);

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

    const altScreenCleanup = () => {
      process.stdout.write(ansi.mouseOff);
      process.stdout.write(ansi.cursorShow);
      process.stdout.write(ansi.altScreenOff);
    };
    process.once('exit', altScreenCleanup);
    process.once('SIGTERM', () => { altScreenCleanup(); process.exit(0); });
    process.once('uncaughtException', (err) => { altScreenCleanup(); throw err; });

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
    // Dismiss autocomplete and go back to bottom on any submission.
    acDismiss();
    scrollOffset = 0;

    const trimmed = input.trim();

    if (!trimmed) {
      rl.prompt();
      return;
    }

    println(`${colors.bgGray}${colors.white} ${trimmed} ${colors.reset}`);
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
    acInput?.removeListener('keypress', onAcKeypress);
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
      process.stdout.write(ansi.cursorShow);
      process.stdout.write('\x1b8'); // restore cursor

      const onKey = (key: string) => {
        const k = key.toLowerCase();

        if (k === 'y') {
          rl.close();
        } else {
          const footerText = typeof options.footerText === 'function'
            ? options.footerText(ctx)
            : (options.footerText ?? '/ for commands');
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
    isBusy = true;
    if (fixedInput) process.stdout.write(ansi.cursorHide);
    activeAbortController = new AbortController();
    ctx.requestSignal = activeAbortController.signal;

    const spinnerEnabled = options.spinner !== false;
    const stopSpinner = startSpinner(
      typeof options.spinner === 'object' ? options.spinner : undefined,
      spinnerEnabled,
      colors,
      fixedInput
        ? {
            onFrame: (text) => {
              spinnerStatus = text;
              renderSpinnerRow();
            },
            onStop: () => {
              spinnerStatus = '';
              renderSpinnerRow();
            },
          }
        : undefined
    );

    const onInputKeypress = (_value: string, key?: { name?: string }) => {
      if (key?.name !== 'escape') {
        return;
      }

      if (ctx.cancelActiveRequest()) {
        println(`${colors.yellow}Request canceled.${colors.reset}`);
        println();
        if (fixedInput) {
          requestRender();
        }
      }
    };

    (anyRl as { input?: NodeJS.EventEmitter }).input?.on('keypress', onInputKeypress);

    let shouldPlayDoneSound = false;

    try {
      const response = await options.onInput(message, ctx);
      shouldPlayDoneSound = true;

      if (isAsyncIterable(response)) {
        await renderStreamedResponse(response);
      } else if (typeof response === 'string' && response.trim().length > 0) {
        const formatted = formatResponse(response, ctx);
        println(`${colors.reset}${assistantPrefix}${colors.reset} ${formatted}`);
        println();
      }
    } catch (error) {
      if (!isAbortError(error)) {
        const msg = error instanceof Error ? error.message : String(error);
        println(`${colors.red}✗ Error:${colors.reset} ${msg}`);
        println();
      }
    } finally {
      (anyRl as { input?: NodeJS.EventEmitter }).input?.removeListener('keypress', onInputKeypress);
      activeAbortController = undefined;
      ctx.requestSignal = undefined;
      isBusy = false;
      iterationBadge = '';
      stopSpinner();
    }

    if (answerDoneSound && shouldPlayDoneSound) {
      emitTerminalBell();
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

function emitTerminalBell(): void {
  if (!process.stdout.isTTY) {
    return;
  }

  process.stdout.write('\x07');
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { name?: string; message?: string };
  return maybeError.name === 'AbortError' || maybeError.message === 'This operation was aborted';
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
