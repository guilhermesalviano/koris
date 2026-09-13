export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Lightweight regex-based markdown renderer, ported from the previous
 * vanilla-JS chat UI (public/chat/main.js) to avoid pulling in a new
 * dependency for a small, well-understood feature set.
 */
export function renderMarkdown(raw: string, origin: string | undefined = globalThis.location?.origin): string {
  let s = escapeHtml(raw);

  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const label = lang || '';
    return `<pre data-lang="${label}"><code>${code.trim()}</code></pre>`;
  });

  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');

  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  s = s.replace(/^---+$/gm, '<hr>');

  s = s.replace(/((?:^- .+\n?)+)/gm, (m) => {
    const items = m.trim().split('\n').map((l) => `<li>${l.slice(2)}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  s = s.replace(/((?:^\d+\. .+\n?)+)/gm, (m) => {
    const items = m.trim().split('\n').map((l) => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  const blocks = s.split(/\n\n+/);
  s = blocks
    .map((b) => {
      if (/^<(pre|ul|ol|h[1-3]|hr)/.test(b.trim())) return b;
      return `<p>${b.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  return linkify(s, origin);
}

// `"` stays out of the URL so it can never close the href attribute; the input is already HTML-escaped.
const URL_PATTERN = 'https?:\\/\\/[^\\s<>"]+';
const MARKDOWN_LINK = new RegExp(`\\[([^\\]\\n]+)\\]\\((${URL_PATTERN}?)\\)`, 'g');
const BARE_URL = new RegExp(`(<a [^>]*>[\\s\\S]*?<\\/a>)|(${URL_PATTERN})`, 'g');
const CODE_SEGMENT = /(<pre[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>)/;

/** Links back into this app (e.g. the Negotiator page) open in place; anything else opens in a new tab. */
function anchor(href: string, text: string, origin: string | undefined): string {
  const internal = Boolean(origin) && (href === origin || href.startsWith(`${origin}/`));
  return internal
    ? `<a href="${href}">${text}</a>`
    : `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

/** Turns `[text](url)` and bare http(s) URLs into links, leaving code untouched. */
function linkify(html: string, origin: string | undefined): string {
  const link = (href: string, text: string) => anchor(href, text, origin);
  return html
    .split(CODE_SEGMENT)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(MARKDOWN_LINK, (_match, text: string, href: string) => link(href, text))
        .replace(BARE_URL, (match, existing: string | undefined) => {
          if (existing) return existing;
          // Sentence punctuation right after a URL is not part of it.
          const trailing = /[.,;:!?)]+$/.exec(match)?.[0] ?? '';
          const href = match.slice(0, match.length - trailing.length);
          return link(href, href) + trailing;
        });
    })
    .join('');
}

/**
 * Reduces markdown to plain speakable text: drops code, image and link syntax,
 * heading/list/quote/rule markers, and emphasis punctuation so a TTS engine
 * doesn't read `**`, `#`, backticks, etc. aloud.
 */
export function stripMarkdown(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_{1,3}(.+?)_{1,3}/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
