import { defaultColors, type TuiColors } from './colors';
import type { TuiContext } from './types';

export function buildBeautifulPrompt(colors: TuiColors = defaultColors): string {
  return `${colors.bright}${colors.gray}>${colors.reset}${colors.cyan}${colors.bright} ${colors.reset}`;
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<string> {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as { [Symbol.asyncIterator]?: unknown };
  return typeof maybe[Symbol.asyncIterator] === 'function';
}

export function applyInlineMarkdown(text: string, colors: TuiColors = defaultColors): string {
  let formatted = text.replace(/\*\*(.+?)\*\*/g, `${colors.bright}$1${colors.reset}`);
  formatted = formatted.replace(/__(.+?)__/g, `${colors.bright}$1${colors.reset}`);
  formatted = formatted.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, `${colors.dim}$1${colors.reset}`);
  formatted = formatted.replace(/`([^`]+)`/g, `${colors.yellow}$1${colors.reset}`);
  return formatted;
}

export function defaultFormatResponse(response: string, ctx: TuiContext): string {
  const { colors } = ctx;
  const lines = response.split('\n');
  let inCodeBlock = false;

  return lines
    .map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        return `${colors.dim}${line}${colors.reset}`;
      }

      if (inCodeBlock) {
        return `${colors.green}${line}${colors.reset}`;
      }

      const h3 = line.match(/^#{3}\s+(.*)/);
      if (h3) return `${colors.bright}${colors.yellow}▸ ${applyInlineMarkdown(h3[1], colors)}${colors.reset}`;

      const h2 = line.match(/^#{2}\s+(.*)/);
      if (h2) return `${colors.bright}${colors.cyan}▶ ${applyInlineMarkdown(h2[1], colors)}${colors.reset}`;

      const h1 = line.match(/^#\s+(.*)/);
      if (h1) return `${colors.bright}${colors.blue}◆ ${applyInlineMarkdown(h1[1], colors)}${colors.reset}`;

      if (/^\s*([-•])\s+/.test(line)) {
        const content = applyInlineMarkdown(line.replace(/^\s*[-•]\s+/, ''), colors);
        return `  ${colors.cyan}•${colors.reset} ${content}`;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        return `  ${applyInlineMarkdown(line.trimStart(), colors)}`;
      }

      return applyInlineMarkdown(line, colors);
    })
    .join('\n');
}