import type { WAMessage } from '@whiskeysockets/baileys';
import { splitMessage } from '../contracts';
import type { ImageAttachment, IMessageGateway, StickerReference } from '../contracts';
import { resolveWhatsAppJid } from './jid';
import { isBotMentioned, stripBotMention } from './mention';
import { NOT_AUTHORIZED_MESSAGE, TYPING_INTERVAL_MS, WHATSAPP_MESSAGE_LIMIT } from './constants';
import { whatsappState } from './state';
import type { IWhatsAppChannel, SocketLike, WhatsAppInboundOptions } from './types';

export class WhatsAppChannel implements IWhatsAppChannel {
  constructor(
    private readonly sock?: SocketLike
  ) {}

  async handleMessage(
    gateway: IMessageGateway,
    jid: string,
    name: string,
    text: string,
    images?: ImageAttachment[],
    options?: WhatsAppInboundOptions,
  ): Promise<void> {
    const isTrustedSender = options?.isWhitelistedSender ?? false;
    if (!isTrustedSender && !whatsappState.allowUntrusted) {
      await this.sendText(jid, NOT_AUTHORIZED_MESSAGE);
      return;
    }

    const botIds = [whatsappState.botNumber, whatsappState.botLid];

    const handler = whatsappState.channelHandler.create({
      channel: 'whatsapp',
      gateway,
      mentionId: whatsappState.botNumber,
      reply: {
        sendText: (target: string, reply: string) => this.sendText(target, reply),
        sendError: async (target: string, message: string) => {
          const sock = await this.getSocket();
          await sock.sendMessage(await resolveWhatsAppJid(target, sock), { text: message });
        },
      },
    });

    const isGroup = jid.endsWith('@g.us');
    // socket.ts runs the authoritative check (mentionedJid + text) and passes it
    // through; fall back to a text-only check for callers that don't (index.ts).
    const mentionsBot = isGroup && (options?.mentionsBot ?? isBotMentioned(text, [], botIds));
    const cleanedText = stripBotMention(text, botIds);
    await this.withTypingIndicator(jid, () =>
      handler.handle(jid, {
        text: cleanedText,
        senderName: name,
        images,
        stickers: options?.stickers,
        quotedText: options?.quotedText,
        externalId: options?.externalId,
        conversationId: jid,
        isGroup,
        mentionsBot,
        isTrustedSender,
        mentionId: whatsappState.botNumber,
        groupName: options?.groupName,
      }),
    );
  }

  private async withTypingIndicator<T>(jid: string, work: () => Promise<T>): Promise<T> {

    const sendTyping = async (): Promise<void> => {
      try {
        const sock = await this.getSocket();
        await sock.sendPresenceUpdate('composing', jid);
      } catch {}
    };

    await sendTyping();
    const timer = setInterval(() => {
      void sendTyping();
    }, TYPING_INTERVAL_MS);

    try {
      return await work();
    } finally {
      clearInterval(timer);
      try {
        const sock = await this.getSocket();
        await sock.sendPresenceUpdate('paused', jid);
      } catch {}
    }
  }

  async sendText(jid: string, text: string): Promise<void> {
    const sock = await this.getSocket();
    const target = await resolveWhatsAppJid(jid, sock);
    for (const chunk of splitMessage(text, WHATSAPP_MESSAGE_LIMIT)) {
      await sock.sendMessage(target, { text: chunk });
    }
  }

  async sendSticker(jid: string, sticker: StickerReference): Promise<void> {
    const sock = await this.getSocket();
    const target = await resolveWhatsAppJid(jid, sock);
    const forwarded = { key: sticker.key, message: sticker.message } as WAMessage;
    await sock.sendMessage(target, { forward: forwarded });
  }

  private async getSocket(): Promise<SocketLike> {
    if (this.sock) return this.sock;
    if (whatsappState.activeSocket) return whatsappState.activeSocket;
    throw new Error('WhatsApp socket is not connected.');
  }
}
