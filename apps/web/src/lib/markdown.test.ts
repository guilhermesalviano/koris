import { describe, expect, it } from 'vitest';
import { escapeHtml, renderMarkdown, stripMarkdown } from './markdown';

describe('escapeHtml', () => {
  it('escapes ampersands and angle brackets', () => {
    expect(escapeHtml('<a> & <b>')).toBe('&lt;a&gt; &amp; &lt;b&gt;');
  });
});

describe('renderMarkdown', () => {
  it('escapes raw HTML before rendering', () => {
    expect(renderMarkdown('<script>x</script>')).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>');
  });

  it('renders fenced code blocks with their language label', () => {
    expect(renderMarkdown('```ts\nconst a = 1;\n```')).toBe('<pre data-lang="ts"><code>const a = 1;</code></pre>');
    expect(renderMarkdown('```\nplain\n```')).toBe('<pre data-lang=""><code>plain</code></pre>');
  });

  it('renders inline code and emphasis', () => {
    expect(renderMarkdown('`x` ***a*** **b** *c*')).toBe('<p><code>x</code> <strong><em>a</em></strong> <strong>b</strong> <em>c</em></p>');
  });

  it('renders headings and rules without wrapping them in paragraphs', () => {
    expect(renderMarkdown('# One\n\n## Two\n\n### Three\n\n---')).toBe('<h1>One</h1><h2>Two</h2><h3>Three</h3><hr>');
  });

  it('renders unordered and ordered lists', () => {
    expect(renderMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(renderMarkdown('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  it('turns bare URLs and markdown links into links that open in a new tab', () => {
    const link = (href: string, text = href) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    expect(renderMarkdown('follow details on http://localhost:3000/admin/agents/negotiator.'))
      .toBe(`<p>follow details on ${link('http://localhost:3000/admin/agents/negotiator')}.</p>`);
    expect(renderMarkdown('see [the Negotiator](https://koris.test/admin/agents/negotiator)'))
      .toBe(`<p>see ${link('https://koris.test/admin/agents/negotiator', 'the Negotiator')}</p>`);
    expect(renderMarkdown('a https://x.test?a=1&b=2 b')).toBe(`<p>a ${link('https://x.test?a=1&amp;b=2')} b</p>`);
  });

  it('opens links back into this app in the same tab', () => {
    const origin = 'http://localhost:3000';
    expect(renderMarkdown('follow details on http://localhost:3000/admin/agents/negotiator', origin))
      .toBe('<p>follow details on <a href="http://localhost:3000/admin/agents/negotiator">http://localhost:3000/admin/agents/negotiator</a></p>');
    expect(renderMarkdown('http://localhost:30001/x', origin)).toContain('target="_blank"');
  });

  it('does not link URLs inside code or let a quote escape the href', () => {
    expect(renderMarkdown('`https://x.test`')).toBe('<p><code>https://x.test</code></p>');
    expect(renderMarkdown('https://x.test/"onmouseover="alert(1)'))
      .toBe('<p><a href="https://x.test/" target="_blank" rel="noopener noreferrer">https://x.test/</a>"onmouseover="alert(1)</p>');
  });

  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    expect(renderMarkdown('line 1\nline 2\n\nnext')).toBe('<p>line 1<br>line 2</p><p>next</p>');
  });
});

describe('stripMarkdown', () => {
  it('drops heading, quote and list markers', () => {
    expect(stripMarkdown('# Title\n> quoted\n- item\n1. first')).toBe('Title\nquoted\nitem\nfirst');
  });

  it('removes emphasis punctuation and inline code backticks', () => {
    expect(stripMarkdown('**bold** *italic* ***both*** _under_ ~~gone~~ `code`')).toBe('bold italic both under gone code');
  });

  it('keeps link text and drops images, code blocks and rules', () => {
    expect(stripMarkdown('[link](https://x.test) ![img](a.png)')).toBe('link');
    expect(stripMarkdown('before\n```js\nignored()\n```\nafter')).toBe('before\n \nafter');
    expect(stripMarkdown('above\n\n---\n\nbelow')).toBe('above\nbelow');
  });
});
