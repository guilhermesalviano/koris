import { defaultColors } from './colors';
import type { TuiContext } from './types';

export function defaultWelcome(ctx: TuiContext, title?: string, aiModel?: string, showHints?: boolean): void {
  const { colors, println, terminalWidth } = ctx;
  const appTitle = title ?? 'Assistant';
  const displayHints = showHints !== false;

  const topBorder = `${colors.bright}${colors.cyan}┏${'━'.repeat(terminalWidth - 2)}┓${colors.reset}`;
  println(topBorder);

  const titleContent = `✨  ${appTitle}  ✨`;
  const titleLine = `${colors.bright}${colors.cyan}┃${colors.reset}  ${colors.bright}${colors.blue}${titleContent}${' '.repeat(Math.max(0, terminalWidth - (titleContent.length + 8)))}${colors.reset}  ${colors.bright}${colors.cyan}┃${colors.reset}`;
  println(titleLine);

  const bottomBorder = `${colors.bright}${colors.cyan}┗${'━'.repeat(terminalWidth - 2)}┛${colors.reset}`;
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

export function getDefaultColors() {
  return defaultColors;
}