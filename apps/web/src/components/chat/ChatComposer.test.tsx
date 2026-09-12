import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../ProviderPicker', () => ({
  default: () => <div data-testid="provider-picker">ProviderPicker</div>,
}));

import { ChatComposer } from './ChatComposer';
import { readFileAsAttachment } from './shared';
import type { ImageAttachment } from '../../lib/types';

describe('ChatComposer', () => {
  const dummyAttachments: ImageAttachment[] = [
    { data: 'base64image1', mimeType: 'image/png' },
    { data: 'base64image2', mimeType: 'image/jpeg' },
  ];

  it('renders textarea with placeholder, value, and shortcuts hint', () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        input="Hello world"
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(html).toContain('Hello world');
    expect(html).toContain('placeholder="Ask something…"');
    expect(html).toContain('↵ send · ⇧↵ newline');
    expect(html).toContain('ProviderPicker');
  });

  it('renders attach and mic buttons with proper titles', () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        input=""
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        onOpenAudioModal={vi.fn()}
      />,
    );

    expect(html).toContain('title="Attach image"');
    expect(html).toContain('title="Record voice note &amp; sound recognition"');
  });

  it('disables action buttons when streaming', () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        input="some prompt"
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        streaming={true}
      />,
    );

    expect(html).toContain('title="Stop generating"');
    expect(html).not.toContain('title="Send message"');
  });

  it('renders send button in enabled and disabled states based on canSend', () => {
    const htmlDisabled = renderToStaticMarkup(
      <ChatComposer
        input=""
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        canSend={false}
      />,
    );
    expect(htmlDisabled).toContain('title="Send message"');
    expect(htmlDisabled).toContain('disabled=""');

    const htmlEnabled = renderToStaticMarkup(
      <ChatComposer
        input="valid text"
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        canSend={true}
      />,
    );
    expect(htmlEnabled).toContain('title="Send message"');
    expect(htmlEnabled).not.toContain('disabled=""');
  });

  it('renders attachment previews with remove buttons', () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        input=""
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        attachments={dummyAttachments}
      />,
    );

    expect(html).toContain('data:image/png;base64,base64image1');
    expect(html).toContain('data:image/jpeg;base64,base64image2');
    expect(html).toContain('title="Remove image"');
    expect(html).toContain('alt="attachment 1"');
    expect(html).toContain('alt="attachment 2"');
  });

  it('displays character counter and highlights warning when near limit', () => {
    const shortInput = 'abc';
    const htmlShort = renderToStaticMarkup(
      <ChatComposer
        input={shortInput}
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        maxChars={100}
      />,
    );
    expect(htmlShort).toContain('>3<');
    expect(htmlShort).not.toContain('text-amber-500');

    const longInput = 'a'.repeat(90);
    const htmlLong = renderToStaticMarkup(
      <ChatComposer
        input={longInput}
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        maxChars={100}
      />,
    );
    expect(htmlLong).toContain('>90<');
    expect(htmlLong).toContain('text-amber-500');
  });
});

describe('readFileAsAttachment', () => {
  it('reads a file into an ImageAttachment object', async () => {
    const file = new File(['mock-image-data'], 'avatar.png', { type: 'image/png' });
    const attachment = await readFileAsAttachment(file);
    expect(attachment.mimeType).toBe('image/png');
    expect(typeof attachment.data).toBe('string');
  });
});
