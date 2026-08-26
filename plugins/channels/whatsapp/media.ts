import type { WAMessage } from '@whiskeysockets/baileys';
import type { ILogger, ImageAttachment, StickerReference } from '../contracts';
import type { ExtractedImage, ExtractedQuotedImage, ExtractedSticker } from './types';

export async function downloadImageBase64(image: ExtractedImage, logger: ILogger): Promise<ImageAttachment | null> {
  try {
    const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
    const buffer = await downloadMediaMessage(image.message, 'buffer', {}) as Buffer;
    return { data: buffer.toString('base64'), mimeType: image.mimetype };
  } catch (err) {
    logger.warn(`WhatsApp image download failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function downloadQuotedImageBase64(jid: string, image: ExtractedQuotedImage, logger: ILogger): Promise<ImageAttachment | null> {
  try {
    const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
    const syntheticMessage = {
      key: { remoteJid: jid, id: image.stanzaId, participant: image.participant, fromMe: false },
      message: image.quotedMessage,
    } as WAMessage;
    const buffer = await downloadMediaMessage(syntheticMessage, 'buffer', {}) as Buffer;
    return { data: buffer.toString('base64'), mimeType: image.mimetype, source: 'quoted' };
  } catch (err) {
    logger.warn(`WhatsApp quoted image download failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function toStickerReference(jid: string, sticker: ExtractedSticker, logger: ILogger): StickerReference {
  logger.debug(`[whatsapp] quoted sticker captured (stanzaId=${sticker.stanzaId ?? 'unknown'}, participant=${sticker.participant ?? 'unknown'})`);
  return {
    key: {
      remoteJid: jid,
      id: sticker.stanzaId,
      participant: sticker.participant,
      fromMe: false,
    },
    message: sticker.quotedMessage,
    mimeType: sticker.mimetype,
  };
}
