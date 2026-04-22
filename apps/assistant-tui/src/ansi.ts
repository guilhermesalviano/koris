/** ANSI escape-code constants and low-level text utilities. */

export const ansi = {
  cursorHome:   '\x1b[H',
  clearScreen:  '\x1b[2J',
  clearLine:    '\x1b[2K',
  altScreenOn:  '\x1b[?1049h',
  altScreenOff: '\x1b[?1049l',
  cursorHide:   '\x1b[?25l',
  cursorShow:   '\x1b[?25h',
  mouseOn:      '\x1b[?1007h',
  mouseOff:     '\x1b[?1007l',
  cursorPos:    (row: number, col: number) => `\x1b[${row};${col}H`,
} as const;

export type Ansi = typeof ansi;

export const ansiStripRegex = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/** Returns the printable width of a string (strips ANSI codes). */
export function visibleWidth(value: string): number {
  return value.replace(ansiStripRegex, '').length;
}

/**
 * Word-wraps a single (already LF-split) line to fit inside `width` columns.
 * Returns an array of wrapped lines (never empty).
 */
export function wrapSingleLineForWidth(line: string, width: number): string[] {
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
}
