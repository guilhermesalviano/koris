export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
}

export function escapeTelegramMarkdown(text: string): string {
  // Tests expect escaping for '.' and '-' at minimum.
  // NOTE: Telegram "Markdown" vs "MarkdownV2" escaping differs; keep it minimal + test-driven.
  return text.replace(/([\\._-])/g, '\\$1');
}