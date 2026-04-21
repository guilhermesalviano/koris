import { defaultColors } from './colors';
import type { TuiContext } from './types';

// ── Title art variants ────────────────────────────────────────────────────
// Each variant is an array of lines. The selector picks the largest art that
// fits inside the inner content area (terminalWidth - 4).

const TITLE_LARGE = [
  `██╗  ██╗  ██████╗  ██████╗  ██╗ ███████╗        █████╗   ██████╗  ███████╗ ███╗   ██╗ ████████╗`,
  `██║ ██╔╝ ██╔═══██╗ ██╔══██╗ ██║ ██╔════╝        ██╔══██╗ ██╔════╝ ██╔════╝ ████╗  ██║ ╚══██╔══╝`,
  `█████╔╝  ██║   ██║ ██████╔╝ ██║ ███████╗ █████╗ ███████║ ██║  ███╗█████╗   ██╔██╗ ██║    ██║   `,
  `██╔═██╗  ██║   ██║ ██╔══██╗ ██║ ╚════██║ ╚════╝ ██╔══██║ ██║   ██║██╔══╝   ██║╚██╗██║    ██║   `,
  `██║  ██╗ ╚██████╔╝ ██║  ██║ ██║ ███████║        ██║  ██║ ╚██████╔╝███████╗ ██║ ╚████║    ██║   `,
  `╚═╝  ╚═╝  ╚═════╝  ╚═╝  ╚═╝ ╚═╝ ╚══════╝        ╚═╝  ╚═╝  ╚═════╝ ╚══════╝ ╚═╝  ╚═══╝    ╚═╝   `,
];

// 3-row compact art using Unicode box-drawing characters (~46 chars wide).
// Letters: K O R I S
const TITLE_MEDIUM = [
  `██╗  ██╗  ██████╗  ██████╗  ██╗ ███████╗`,
  `██║ ██╔╝ ██╔═══██╗ ██╔══██╗ ██║ ██╔════╝`,
  `█████╔╝  ██║   ██║ ██████╔╝ ██║ ███████╗`,
  `██╔═██╗  ██║   ██║ ██╔══██╗ ██║ ╚════██║`,
  `██║  ██╗ ╚██████╔╝ ██║  ██║ ██║ ███████║`,
  `╚═╝  ╚═╝  ╚═════╝  ╚═╝  ╚═╝ ╚═╝ ╚══════╝`,
];

// Widths of the art lines (used to pick the right variant).
const TITLE_LARGE_WIDTH = 104;
const TITLE_MEDIUM_WIDTH = 46;

function titleArtForWidth(innerWidth: number): string[] {
  if (innerWidth >= TITLE_LARGE_WIDTH) return TITLE_LARGE;
  if (innerWidth >= TITLE_MEDIUM_WIDTH) return TITLE_MEDIUM;
  return []; // tiny: caller renders a plain text fallback
}

export function defaultWelcome(ctx: TuiContext, title?: string, aiModel?: string, showHints?: boolean): void {
  const { colors, println, terminalWidth } = ctx;
  const displayHints = showHints !== false;
  const innerWidth = Math.max(20, terminalWidth - 4);
  const ansiPattern = /^\x1b\[[0-9;?]*[ -/]*[@-~]/;
  const visibleWidth = (value: string) => value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').length;
  const fit = (value: string) => {
    let output = '';
    let index = 0;
    let width = 0;

    while (index < value.length && width < innerWidth) {
      const remaining = value.slice(index);
      const ansiMatch = remaining.match(ansiPattern);

      if (ansiMatch) {
        output += ansiMatch[0];
        index += ansiMatch[0].length;
        continue;
      }

      output += value[index];
      index += 1;
      width += 1;
    }

    return output;
  };
  const frameLine = (content = '') => {
    const fitted = fit(content);
    return `${colors.bright}${colors.cyan}┃${colors.reset} ${fitted}${' '.repeat(Math.max(0, innerWidth - visibleWidth(fitted)))} ${colors.bright}${colors.cyan}┃${colors.reset}`;
  };

  const topBorder = `${colors.bright}${colors.cyan}┏${'━'.repeat(terminalWidth - 2)}┓${colors.reset}`;
  println(topBorder);

  const artLines = titleArtForWidth(innerWidth);
  if (artLines.length > 0) {
    for (const line of artLines) {
      println(frameLine(`${colors.bright}${colors.green}${line}${colors.reset}`));
    }
  } else {
    // Terminal too narrow for any art: show a single centered label.
    const label = `  ✦  KOARIS-AGENT  ✦  `;
    const pad = ' '.repeat(Math.max(0, Math.floor((innerWidth - label.length) / 2)));
    println(frameLine(`${pad}${colors.bright}${colors.green}${label}${colors.reset}`));
  }

  if (title) {
    println(frameLine(`${colors.dim}${title}${colors.reset}`));
  }

  const now = new Date();
  const timeStr = now.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const modelLabel = aiModel || 'agent';
  println(frameLine(`${colors.gray}Model:${colors.reset} ${modelLabel}`));
  println(frameLine(`${colors.gray}Started:${colors.reset} ${timeStr}`));

  const bottomBorder = `${colors.bright}${colors.cyan}┗${'━'.repeat(terminalWidth - 2)}┛${colors.reset}`;
  println(bottomBorder);

  println();

  if (displayHints) {
    println(`${colors.bright}${colors.magenta}Quick Tips:${colors.reset}`);
    println(`  ${colors.cyan}•${colors.reset} Start commands with ${colors.bright}/${colors.reset}`);
    println(`  ${colors.cyan}•${colors.reset} Type ${colors.bright}/help${colors.reset} for available commands`);
    println(`  ${colors.cyan}•${colors.reset} Press ${colors.bright}Esc${colors.reset} to cancel the current AI request`);
    println(`  ${colors.cyan}•${colors.reset} Press ${colors.bright}Ctrl+C${colors.reset} to exit gracefully`);
    println();
  }

//   println(`${colors.dim}${modelLabel} is ready to assist! What can I help you with?${colors.reset}`);
//   println();
}

export function getDefaultColors() {
  return defaultColors;
}