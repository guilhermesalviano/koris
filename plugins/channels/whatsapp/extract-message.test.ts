import { describe, expect, it } from 'vitest';
import type { WAMessage } from '@whiskeysockets/baileys';
import {
  extractAudio,
  extractImage,
  extractQuotedAudio,
  extractQuotedImage,
  extractQuotedSticker,
  extractQuotedText,
  extractText,
  getQuotedMessageInfo,
} from './extract-message';

function makeMsg(overrides: Partial<WAMessage> = {}): WAMessage {
  return {
    key: { remoteJid: '12345@s.whatsapp.net', fromMe: false, id: 'test-id' },
    messageTimestamp: 1700000000,
    ...overrides,
  } as WAMessage;
}

describe('extract-message', () => {
  describe('extractAudio', () => {
    it('returns null when message is missing or invalid', () => {
      expect(extractAudio({} as WAMessage)).toBeNull();
      expect(extractAudio({ message: null } as unknown as WAMessage)).toBeNull();
      expect(extractAudio({ message: 'not an object' } as unknown as WAMessage)).toBeNull();
    });

    it('returns null when audioMessage is missing', () => {
      const msg = makeMsg({ message: { conversation: 'hello' } });
      expect(extractAudio(msg)).toBeNull();
    });

    it('extracts audioMessage with default mimetype when omitted', () => {
      const msg = makeMsg({
        message: {
          audioMessage: {
            seconds: 12,
            ptt: true,
          },
        },
      });

      const result = extractAudio(msg);
      expect(result).toEqual({
        mimetype: 'audio/ogg; codecs=opus',
        seconds: 12,
        ptt: true,
        message: msg,
      });
    });

    it('extracts audioMessage with default mimetype when empty string is provided', () => {
      const msg = makeMsg({
        message: {
          audioMessage: {
            mimetype: '',
            seconds: 3,
            ptt: false,
          },
        },
      });

      const result = extractAudio(msg);
      expect(result).toEqual({
        mimetype: 'audio/ogg; codecs=opus',
        seconds: 3,
        ptt: false,
        message: msg,
      });
    });

    it('extracts audioMessage with custom mimetype', () => {
      const msg = makeMsg({
        message: {
          audioMessage: {
            mimetype: 'audio/mp4',
            seconds: 45,
            ptt: false,
          },
        },
      });

      const result = extractAudio(msg);
      expect(result).toEqual({
        mimetype: 'audio/mp4',
        seconds: 45,
        ptt: false,
        message: msg,
      });
    });

    it('handles missing or non-primitive seconds and ptt gracefully', () => {
      const msg = makeMsg({
        message: {
          audioMessage: {
            mimetype: 'audio/wav',
            seconds: 'not-a-number' as unknown as number,
            ptt: 'not-a-bool' as unknown as boolean,
          },
        },
      });

      const result = extractAudio(msg);
      expect(result).toEqual({
        mimetype: 'audio/wav',
        seconds: undefined,
        ptt: undefined,
        message: msg,
      });
    });
  });

  describe('extractText', () => {
    it('returns null when message is missing or invalid', () => {
      expect(extractText({})).toBeNull();
      expect(extractText({ message: null })).toBeNull();
      expect(extractText({ message: 123 })).toBeNull();
    });

    it('extracts text from conversation field', () => {
      expect(extractText({ message: { conversation: 'hello world' } })).toBe('hello world');
    });

    it('extracts text from extendedTextMessage field', () => {
      expect(extractText({ message: { extendedTextMessage: { text: 'extended text' } } })).toBe('extended text');
    });

    it('returns null when text is not found', () => {
      expect(extractText({ message: { imageMessage: {} } })).toBeNull();
    });
  });

  describe('extractImage', () => {
    it('returns null when message or imageMessage is missing', () => {
      expect(extractImage({} as WAMessage)).toBeNull();
      expect(extractImage(makeMsg({ message: { conversation: 'hi' } }))).toBeNull();
    });

    it('extracts image caption and mimetype', () => {
      const msg = makeMsg({
        message: {
          imageMessage: { caption: 'sunset', mimetype: 'image/jpeg' },
        },
      });
      expect(extractImage(msg)).toEqual({
        caption: 'sunset',
        mimetype: 'image/jpeg',
        message: msg,
      });
    });
  });

  describe('quoted message extraction', () => {
    it('getQuotedMessageInfo returns null if no extendedTextMessage contextInfo', () => {
      expect(getQuotedMessageInfo(makeMsg({ message: {} }))).toBeNull();
      expect(getQuotedMessageInfo(makeMsg({ message: { extendedTextMessage: {} } }))).toBeNull();
    });

    it('extracts quoted text, sticker, and image', () => {
      const stickerMsg = makeMsg({
        message: {
          extendedTextMessage: {
            text: 'nice sticker',
            contextInfo: {
              stanzaId: 'stanza-1',
              participant: 'user@s.whatsapp.net',
              quotedMessage: {
                stickerMessage: { mimetype: 'image/webp' },
              },
            },
          },
        },
      });

      const extractedSticker = extractQuotedSticker(stickerMsg);
      expect(extractedSticker).toEqual({
        mimetype: 'image/webp',
        quotedMessage: { stickerMessage: { mimetype: 'image/webp' } },
        stanzaId: 'stanza-1',
        participant: 'user@s.whatsapp.net',
      });

      const textMsg = makeMsg({
        message: {
          extendedTextMessage: {
            contextInfo: {
              quotedMessage: { conversation: 'quoted plain text' },
            },
          },
        },
      });
      expect(extractQuotedText(textMsg)).toBe('quoted plain text');

      const imgMsg = makeMsg({
        message: {
          extendedTextMessage: {
            contextInfo: {
              stanzaId: 's-2',
              participant: 'u-2',
              quotedMessage: {
                imageMessage: { caption: 'quoted image caption', mimetype: 'image/png' },
              },
            },
          },
        },
      });
      expect(extractQuotedImage(imgMsg)).toEqual({
        caption: 'quoted image caption',
        mimetype: 'image/png',
        quotedMessage: { imageMessage: { caption: 'quoted image caption', mimetype: 'image/png' } },
        stanzaId: 's-2',
        participant: 'u-2',
      });
    });

    it('extracts a quoted voice note', () => {
      const audioMsg = makeMsg({
        message: {
          extendedTextMessage: {
            text: 'what did they say?',
            contextInfo: {
              stanzaId: 'a-1',
              participant: 'u-1@s.whatsapp.net',
              quotedMessage: {
                audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 7, ptt: true },
              },
            },
          },
        },
      });
      expect(extractQuotedAudio(audioMsg)).toEqual({
        mimetype: 'audio/ogg; codecs=opus',
        seconds: 7,
        ptt: true,
        quotedMessage: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 7, ptt: true } },
        stanzaId: 'a-1',
        participant: 'u-1@s.whatsapp.net',
      });
    });

    it('defaults the mimetype for a quoted voice note that omits it', () => {
      const audioMsg = makeMsg({
        message: {
          extendedTextMessage: {
            contextInfo: { quotedMessage: { audioMessage: {} } },
          },
        },
      });
      expect(extractQuotedAudio(audioMsg)?.mimetype).toBe('audio/ogg; codecs=opus');
    });

    it('extractQuotedAudio returns null for a non-audio or absent quote', () => {
      expect(extractQuotedAudio(makeMsg({ message: { conversation: 'hi' } }))).toBeNull();
      expect(extractQuotedAudio(makeMsg({
        message: { extendedTextMessage: { contextInfo: { quotedMessage: { conversation: 'hi' } } } },
      }))).toBeNull();
    });
  });
});
