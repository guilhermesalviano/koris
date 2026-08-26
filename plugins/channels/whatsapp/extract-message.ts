import type { WAMessage } from '@whiskeysockets/baileys';
import type { ExtractedImage, ExtractedQuotedImage, ExtractedSticker, QuotedMessageInfo } from './types';

export function getQuotedMessageInfo(msg: WAMessage): QuotedMessageInfo | null {
  if (!msg.message || typeof msg.message !== 'object') return null;

  const content = msg.message as Record<string, unknown>;
  const extendedText = content['extendedTextMessage'];
  if (!extendedText || typeof extendedText !== 'object') return null;

  const contextInfo = (extendedText as Record<string, unknown>)['contextInfo'];
  if (!contextInfo || typeof contextInfo !== 'object') return null;

  const info = contextInfo as Record<string, unknown>;
  const quotedMessage = info['quotedMessage'];
  if (!quotedMessage || typeof quotedMessage !== 'object') return null;

  return {
    quotedMessage: quotedMessage as Record<string, unknown>,
    stanzaId: typeof info['stanzaId'] === 'string' ? info['stanzaId'] : undefined,
    participant: typeof info['participant'] === 'string' ? info['participant'] : undefined,
  };
}

export function extractText(msg: { message?: unknown }): string | null {
  if (!msg.message || typeof msg.message !== 'object') return null;

  const content = msg.message as Record<string, unknown>;

  const conversation = content['conversation'];
  if (typeof conversation === 'string') return conversation;

  const extended = content['extendedTextMessage'];
  if (extended && typeof extended === 'object') {
    const text = (extended as Record<string, unknown>)['text'];
    if (typeof text === 'string') return text;
  }

  return null;
}

export function extractImage(msg: WAMessage): ExtractedImage | null {
  if (!msg.message || typeof msg.message !== 'object') return null;

  const content = msg.message as Record<string, unknown>;
  const imageMessage = content['imageMessage'];
  if (!imageMessage || typeof imageMessage !== 'object') return null;

  const image = imageMessage as Record<string, unknown>;
  return {
    caption: typeof image['caption'] === 'string' ? image['caption'] : undefined,
    mimetype: typeof image['mimetype'] === 'string' ? image['mimetype'] : undefined,
    message: msg,
  };
}

export function extractQuotedSticker(msg: WAMessage): ExtractedSticker | null {
  const quoted = getQuotedMessageInfo(msg);
  if (!quoted) return null;

  const stickerMessage = quoted.quotedMessage['stickerMessage'];
  if (!stickerMessage || typeof stickerMessage !== 'object') return null;

  const sticker = stickerMessage as Record<string, unknown>;
  return {
    mimetype: typeof sticker['mimetype'] === 'string' ? sticker['mimetype'] : 'image/webp',
    quotedMessage: quoted.quotedMessage,
    stanzaId: quoted.stanzaId,
    participant: quoted.participant,
  };
}

export function extractQuotedText(msg: WAMessage): string | null {
  const quoted = getQuotedMessageInfo(msg);
  if (!quoted) return null;

  const conversation = quoted.quotedMessage['conversation'];
  if (typeof conversation === 'string') return conversation;

  const extended = quoted.quotedMessage['extendedTextMessage'];
  if (extended && typeof extended === 'object') {
    const text = (extended as Record<string, unknown>)['text'];
    if (typeof text === 'string') return text;
  }

  return null;
}

export function extractQuotedImage(msg: WAMessage): ExtractedQuotedImage | null {
  const quoted = getQuotedMessageInfo(msg);
  if (!quoted) return null;

  const imageMessage = quoted.quotedMessage['imageMessage'];
  if (!imageMessage || typeof imageMessage !== 'object') return null;

  const image = imageMessage as Record<string, unknown>;
  return {
    caption: typeof image['caption'] === 'string' ? image['caption'] : undefined,
    mimetype: typeof image['mimetype'] === 'string' ? image['mimetype'] : undefined,
    quotedMessage: quoted.quotedMessage,
    stanzaId: quoted.stanzaId,
    participant: quoted.participant,
  };
}
