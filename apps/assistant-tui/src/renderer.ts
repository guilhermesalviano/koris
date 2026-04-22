import type * as readline from 'readline';
import type { Ansi } from './ansi';
import { visibleWidth } from './ansi';
import type { TuiColors } from './colors';
import type { TuiContext, StartTuiOptions } from './types';

export interface TuiInternalState {
  contentBuffer: string[];
  scrollOffset: number;
  terminalWidth: number;
  terminalHeight: number;
  /** How many terminal rows the prompt + current input text occupies (≥ 1). */
  inputLineCount: number;
  spinnerStatus: string;
  isRendering: boolean;
  renderQueued: boolean;
  renderScheduled: NodeJS.Timeout | undefined;
  activeAbortController: AbortController | undefined;
  isBusy: boolean;
  iterationBadge: string;
}

export interface RendererDeps {
  state: TuiInternalState;
  ansi: Ansi;
  colors: TuiColors;
  fixedInput: boolean;
  rl: readline.Interface;
  anyRl: any;
  footerText?: StartTuiOptions['footerText'];
  placeholder?: string;
  getCtx: () => TuiContext;
}

export function createRenderer(deps: RendererDeps) {
  const { state, ansi, colors, fixedInput, rl, anyRl } = deps;

  const maxContentLines = () => Math.max(1, state.terminalHeight - state.inputLineCount - 4);

  const ensureScrollOffsetInRange = () => {
    const maxOffset = Math.max(0, state.contentBuffer.length - maxContentLines());
    state.scrollOffset = Math.max(0, Math.min(maxOffset, state.scrollOffset));
  };

  const buildSeparatorLine = (status: string) => {
    const prefix = status ? `- ${status} ` : '';
    const dashCount = Math.max(0, state.terminalWidth - prefix.length);
    return `${colors.dim}${prefix}${'─'.repeat(dashCount)}${colors.reset}`;
  };

  const buildSpinnerLine = (status: string) => {
    if (state.scrollOffset > 0) {
      const hint = `↑ ${state.scrollOffset} line(s) above  ·  scroll to navigate`;
      return `${colors.dim}${colors.yellow}${hint.slice(0, state.terminalWidth)}${colors.reset}`;
    }
    if (!status) return '';
    return status;
  };

  const renderFooterLine = () => {
    if (!fixedInput) return;
    const ctx = deps.getCtx();
    const footerText =
      typeof deps.footerText === 'function'
        ? deps.footerText(ctx)
        : (deps.footerText ?? '/ for commands');

    process.stdout.write('\x1b7');
    process.stdout.write(ansi.cursorPos(state.terminalHeight - 1, 1));
    process.stdout.write(buildSeparatorLine(''));
    process.stdout.write(ansi.cursorPos(state.terminalHeight, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(
      `${colors.bright}${colors.gray}${footerText.slice(0, state.terminalWidth)}${colors.reset}`,
    );

    if (state.iterationBadge) {
      const badge = ` ${state.iterationBadge} `;
      const col = Math.max(1, state.terminalWidth - badge.length + 1);
      process.stdout.write(ansi.cursorPos(state.terminalHeight, col));
      process.stdout.write(`${colors.dim}${colors.cyan}${badge}${colors.reset}`);
    }

    process.stdout.write('\x1b8');
  };

  const renderSpinnerRow = () => {
    if (!fixedInput || state.isRendering) return;
    process.stdout.write('\x1b7');
    process.stdout.write(ansi.cursorPos(state.terminalHeight - state.inputLineCount - 3, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(buildSpinnerLine(state.spinnerStatus));
    process.stdout.write('\x1b8');
  };

  // Forward-declared so requestRender can reference it.
  let renderScreen: () => void;

  const requestRender = () => {
    if (!fixedInput) return;
    if (state.renderScheduled) return;
    state.renderScheduled = setTimeout(() => {
      state.renderScheduled = undefined;
      renderScreen();
    }, 16);
  };

  renderScreen = () => {
    if (!fixedInput) return;
    if (state.isRendering) {
      state.renderQueued = true;
      return;
    }
    state.isRendering = true;

    ensureScrollOffsetInRange();
    rl.pause();

    const availableHeight = maxContentLines();
    const startIdx = Math.max(
      0,
      state.contentBuffer.length - availableHeight - state.scrollOffset,
    );
    const endIdx = Math.min(state.contentBuffer.length, startIdx + availableHeight);
    const visibleContent = state.contentBuffer.slice(startIdx, endIdx);

    for (let row = 0; row < availableHeight; row++) {
      process.stdout.write(ansi.cursorPos(row + 1, 1));
      process.stdout.write(ansi.clearLine);
      const line = visibleContent[row];
      if (typeof line === 'string') process.stdout.write(line);
    }

    // Spinner / scroll-hint row (exclusively chrome).
    process.stdout.write(ansi.cursorPos(state.terminalHeight - state.inputLineCount - 3, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(buildSpinnerLine(state.spinnerStatus));

    // Separator above input.
    process.stdout.write(ansi.cursorPos(state.terminalHeight - state.inputLineCount - 2, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(buildSeparatorLine(''));

    // Input rows are positioned and rendered by patchRefreshLine/_refreshLine.
    rl.resume();
    if (typeof anyRl._refreshLine === 'function') {
      anyRl._refreshLine();
    } else {
      rl.prompt(true);
      renderFooterLine();
    }

    process.stdout.write(state.isBusy ? ansi.cursorHide : ansi.cursorShow);

    state.isRendering = false;

    if (state.renderQueued) {
      state.renderQueued = false;
      requestRender();
    }
  };

  /** Patch readline's internal `_refreshLine` to keep the footer painted. */
  const patchRefreshLine = () => {
    if (!fixedInput || typeof anyRl._refreshLine !== 'function') return;
    anyRl._refreshLine = () => {
      const prompt: string = rl.getPrompt();
      const promptVW = visibleWidth(prompt);
      const inputText: string = (anyRl.line as string | undefined) ?? '';
      const cursor: number = (anyRl.cursor as number | undefined) ?? inputText.length;
      const termWidth = Math.max(1, state.terminalWidth);

      const totalVW = promptVW + visibleWidth(inputText);
      const newCount = Math.max(1, Math.min(
        Math.ceil(totalVW / termWidth),
        Math.max(1, state.terminalHeight - 5),
      ));
      const oldCount = state.inputLineCount;
      const maxCount = Math.max(newCount, oldCount);

      // Clear entire region that was or will be occupied by input.
      for (let i = 0; i < maxCount; i++) {
        const row = state.terminalHeight - maxCount - 1 + i;
        if (row >= 1) {
          process.stdout.write(ansi.cursorPos(row, 1));
          process.stdout.write(ansi.clearLine);
        }
      }

      state.inputLineCount = newCount;

      // When the zone height changed, immediately redraw separator/spinner so
      // there is no flash while waiting for requestRender.
      if (newCount !== oldCount) {
        const oldSpinnerRow = state.terminalHeight - oldCount - 3;
        const oldSeparatorRow = state.terminalHeight - oldCount - 2;
        if (oldSpinnerRow >= 1) {
          process.stdout.write(ansi.cursorPos(oldSpinnerRow, 1));
          process.stdout.write(ansi.clearLine);
        }
        if (oldSeparatorRow >= 1) {
          process.stdout.write(ansi.cursorPos(oldSeparatorRow, 1));
          process.stdout.write(ansi.clearLine);
        }

        const spinnerRow = state.terminalHeight - newCount - 3;
        const separatorRow = state.terminalHeight - newCount - 2;
        if (spinnerRow >= 1) {
          process.stdout.write(ansi.cursorPos(spinnerRow, 1));
          process.stdout.write(ansi.clearLine);
          process.stdout.write(buildSpinnerLine(state.spinnerStatus));
        }
        if (separatorRow >= 1) {
          process.stdout.write(ansi.cursorPos(separatorRow, 1));
          process.stdout.write(ansi.clearLine);
          process.stdout.write(buildSeparatorLine(''));
        }
      }

      const inputTopRow = Math.max(1, state.terminalHeight - newCount - 1);

      // Write prompt on the first input row, then the input text (terminal
      // wraps it naturally across subsequent rows in the zone).
      process.stdout.write(ansi.cursorPos(inputTopRow, 1));
      process.stdout.write(prompt);
      if (inputText.length > 0) process.stdout.write(inputText);

      // Position the visible cursor at the correct spot within the input.
      const textBeforeCursor = inputText.slice(0, cursor);
      const cursorVirtualCol = promptVW + visibleWidth(textBeforeCursor);
      const cursorRow = inputTopRow + Math.floor(cursorVirtualCol / termWidth);
      const cursorCol = (cursorVirtualCol % termWidth) + 1; // 1-indexed
      process.stdout.write(ansi.cursorPos(cursorRow, cursorCol));

      // Keep readline's internal row count in sync so any other internal
      // readline call that reads _prevRows gets a sensible value.
      anyRl._prevRows = newCount - 1;

      // Placeholder shown when input is empty.
      if (deps.placeholder && !state.isBusy && inputText === '') {
        process.stdout.write('\x1b7');
        process.stdout.write(`${colors.dim}${deps.placeholder}${colors.reset}`);
        process.stdout.write('\x1b8');
      }

      renderFooterLine();

      if (newCount !== oldCount && !state.isRendering) {
        requestRender();
      }
    };
  };

  return {
    buildSeparatorLine,
    buildSpinnerLine,
    renderFooterLine,
    renderSpinnerRow,
    renderScreen,
    requestRender,
    maxContentLines,
    ensureScrollOffsetInRange,
    patchRefreshLine,
  };
}
