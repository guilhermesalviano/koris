import type { ILogger, ImageAttachment, StickerReference } from '../contracts';
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
import { extractMentionedJids, isBotMentioned, jidToNumber } from './mention';
import { isWhitelistedSender } from './sender';
import { whatsappState } from './state';
import type { ExtractedImage, ExtractedQuotedImage, ExtractedSticker, SocketLike, WhatsAppChannelStartOptions } from './types';

function firstJidMatching(suffix: string, ...jids: (string | null | undefined)[]): string {
  for (const jid of jids) {
    if (jid && jid.includes(suffix)) {
      const digits = jidToNumber(jid);
      if (digits) return digits;
    }
  }
  return '';
}

/**
 * Learns the bot's own identities from a Baileys `Contact` (live `sock.user` or
 * stored `creds.me`): its phone number (`@s.whatsapp.net`) and its LID (`@lid`).
 * A mention in a LID-addressed group names the bot by LID, never by phone
 * number, so both are needed. An explicit `bot_number` from config is never
 * overwritten; the LID has no config and is always adopted once seen.
 */
function adoptBotIdentity(
  source: { id?: string | null; lid?: string | null; phoneNumber?: string | null } | undefined,
  logger: ILogger,
): void {
  if (!source) return;

  if (!whatsappState.botNumber) {
    const pn = firstJidMatching('@s.whatsapp.net', source.phoneNumber, source.id);
    if (pn) {
      whatsappState.botNumber = pn;
      logger.info(`WhatsApp bot number auto-detected: ${pn}`);
    }
  }

  if (!whatsappState.botLid) {
    const lid = firstJidMatching('@lid', source.lid, source.id);
    if (lid) {
      whatsappState.botLid = lid;
      logger.info(`WhatsApp bot LID auto-detected: ${lid}`);
    }
  }
}

export async function startBaileysSocket(options: WhatsAppChannelStartOptions): Promise<SocketLike> {
  const { makeWASocket, useMultiFileAuthState, DisconnectReason } = await import('@whiskeysockets/baileys');
  const qrcode = await import('qrcode-terminal');
  const { state, saveCreds } = await useMultiFileAuthState(options.authFolder);

  // Seed the bot's identities from stored creds; `connection === 'open'` below
  // refreshes them from the live socket (which is where the LID usually lands).
  adoptBotIdentity(state.creds?.me, options.logger);

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
      adoptBotIdentity(sock.user, options.logger);
      // Backfill the LID from the signal store when the account object didn't carry one.
      if (!whatsappState.botLid && whatsappState.botNumber) {
        const pending = sock.signalRepository?.lidMapping?.getLIDForPN(`${whatsappState.botNumber}@s.whatsapp.net`);
        if (pending) {
          void pending
            .then((lid) => {
              if (lid && !whatsappState.botLid) {
                whatsappState.botLid = jidToNumber(lid);
                options.logger.info(`WhatsApp bot LID resolved via mapping: ${whatsappState.botLid}`);
              }
            })
            .catch(() => {});
        }
      }
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
      const botIds = [whatsappState.botNumber, whatsappState.botLid];
      const mentionsBot = isGroup && isBotMentioned(text, extractMentionedJids(msg), botIds);
      if (isGroup && !mentionsBot) continue;

      void handleInboundMessage(options, sock, jid, senderName, text, image, sticker, quotedText, quotedImage, isWhitelisted, mentionsBot, externalId ?? undefined).catch((err: Error) => {
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
  mentionsBot: boolean,
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
    mentionsBot,
    groupName,
    stickers,
    quotedText: quotedText ?? undefined,
    externalId,
  });
}
