import type { ImageAttachment, StickerReference } from '../contracts';
import { createBaileysLogger } from './baileys-logger';
import { WhatsAppChannel } from './channel';
import { isDuplicateMessage } from './dedupe';
import {
  extractImage,
  extractQuotedImage,
  extractQuotedSticker,
  extractQuotedText,
  extractText,
} from './extract-message';
import { resolveGroupName } from './group-name';
import { downloadImageBase64, downloadQuotedImageBase64, toStickerReference } from './media';
import { isWhitelistedSender } from './sender';
import { whatsappState } from './state';
import type { ExtractedImage, ExtractedQuotedImage, ExtractedSticker, SocketLike, WhatsAppChannelStartOptions } from './types';

export async function startBaileysSocket(options: WhatsAppChannelStartOptions): Promise<SocketLike> {
  const { makeWASocket, useMultiFileAuthState, DisconnectReason } = await import('@whiskeysockets/baileys');
  const qrcode = await import('qrcode-terminal');
  const { state, saveCreds } = await useMultiFileAuthState(options.authFolder);

  const sock = makeWASocket({
    auth: state,
    logger: createBaileysLogger(options.logger),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      options.logger.info('Scan the QR code below with WhatsApp on your phone:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      options.logger.warn(
        `WhatsApp connection closed (code=${statusCode ?? 'unknown'}). Reconnect=${shouldReconnect}`,
      );

      if (shouldReconnect) {
        startBaileysSocket(options)
          .then((newSock) => { whatsappState.activeSocket = newSock; })
          .catch((err: Error) => options.logger.warn(`WhatsApp reconnect failed: ${err.message}`));
      } else {
        whatsappState.activeSocket = null;
      }
    }

    if (connection === 'open') {
      options.logger.info('WhatsApp is ready!');
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      options.logger.debug(`[whatsapp] raw message received: ${JSON.stringify(msg)}`);

      const { key, pushName: senderName } = msg;
      const { fromMe, remoteJid: jid, id: externalId } = key;

      if (isDuplicateMessage(externalId)) {
        options.logger.debug(`[whatsapp] dropping duplicate message ${externalId} (already processed)`);
        continue;
      }

      if (fromMe) continue;

      const isWhitelisted = isWhitelistedSender(msg);

      if (!jid || !senderName) continue;

      const rawText = extractText(msg);
      const image = extractImage(msg);
      const sticker = extractQuotedSticker(msg);
      const quotedText = extractQuotedText(msg);
      const quotedImage = extractQuotedImage(msg);

      if (!rawText && !image && !sticker) continue;

      const text = image?.caption ?? rawText ?? '';
      const isGroup = jid.endsWith('@g.us');
      const mentionsBot = isGroup && options.mentionId.length > 0 && text.includes(`@${options.mentionId}`);
      if (isGroup && !mentionsBot) continue;

      void handleInboundMessage(options, sock, jid, senderName, text, image, sticker, quotedText, quotedImage, isWhitelisted, externalId ?? undefined).catch((err: Error) => {
        options.logger.warn(`WhatsApp message handling error: ${err.message}`);
      });
    }
  });

  return sock;
}

async function handleInboundMessage(
  options: WhatsAppChannelStartOptions,
  sock: SocketLike,
  jid: string,
  senderName: string,
  text: string,
  image: ExtractedImage | null,
  sticker: ExtractedSticker | null,
  quotedText: string | null,
  quotedImage: ExtractedQuotedImage | null,
  isWhitelistedSender: boolean,
  externalId?: string,
): Promise<void> {
  const images: ImageAttachment[] = [];
  if (image) {
    const attachment = await downloadImageBase64(image, options.logger);
    if (attachment) images.push(attachment);
  }
  if (quotedImage) {
    const attachment = await downloadQuotedImageBase64(jid, quotedImage, options.logger);
    if (attachment) images.push(attachment);
  }

  const stickers: StickerReference[] = [];
  if (sticker) {
    stickers.push(toStickerReference(jid, sticker, options.logger));
  }

  const channel = new WhatsAppChannel(sock);
  const groupName = jid.endsWith('@g.us') ? await resolveGroupName(sock, jid, options.logger) : undefined;
  await channel.handleMessage(options.gateway, jid, senderName, text, images, {
    isWhitelistedSender,
    groupName,
    stickers,
    quotedText: quotedText ?? undefined,
    externalId,
  });
}
