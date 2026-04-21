import type * as readline from 'readline';
import type { Ansi } from './ansi';
import type { TuiColors } from './colors';
import type { TuiContext, StartTuiOptions } from './types';

export interface TuiInternalState {
  contentBuffer: string[];
  scrollOffset: number;
  terminalWidth: number;
  terminalHeight: number;
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

  const maxContentLines = () => Math.max(1, state.terminalHeight - 5);

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
    process.stdout.write(ansi.cursorPos(state.terminalHeight - 4, 1));
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
    process.stdout.write(ansi.cursorPos(state.terminalHeight - 4, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(buildSpinnerLine(state.spinnerStatus));

    // Separator above input.
    process.stdout.write(ansi.cursorPos(state.terminalHeight - 3, 1));
    process.stdout.write(ansi.clearLine);
    process.stdout.write(buildSeparatorLine(''));

    // Input pinned row.
    process.stdout.write(ansi.cursorPos(state.terminalHeight - 2, 1));

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
    const originalRefreshLine = anyRl._refreshLine.bind(rl);
    anyRl._refreshLine = (...args: unknown[]) => {
      originalRefreshLine(...args);
      // Erase any stale chars past the cursor.
      process.stdout.write('\x1b[0K');
      // Show placeholder when input is empty and not busy.
      if (deps.placeholder && !state.isBusy && (anyRl.line ?? '') === '') {
        process.stdout.write('\x1b7');
        process.stdout.write(`${colors.dim}${deps.placeholder}${colors.reset}`);
        process.stdout.write('\x1b8');
      }
      renderFooterLine();
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
