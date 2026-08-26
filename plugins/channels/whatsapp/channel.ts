import type { WAMessage } from '@whiskeysockets/baileys';
import { splitMessage } from '../contracts';
import type { ImageAttachment, IMessageGateway, StickerReference } from '../contracts';
import { parseMentionTarget } from './jid';
import { NOT_AUTHORIZED_MESSAGE, TYPING_INTERVAL_MS, WHATSAPP_MESSAGE_LIMIT } from './constants';
import { whatsappState } from './state';
import type { IWhatsAppChannel, SocketLike } from './types';

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
    options?: { isWhitelistedSender?: boolean; groupName?: string; stickers?: StickerReference[]; quotedText?: string; externalId?: string },
  ): Promise<void> {
    const isTrustedSender = options?.isWhitelistedSender ?? false;
    if (!isTrustedSender && !whatsappState.allowUntrusted) {
      await this.sendText(jid, NOT_AUTHORIZED_MESSAGE);
      return;
    }

    const handler = whatsappState.channelHandler.create({
      channel: 'whatsapp',
      gateway,
      mentionId: whatsappState.mentionId,
      reply: {
        sendText: (target: string, reply: string) => this.sendText(target, reply),
        sendError: async (target: string, message: string) => {
          const sock = await this.getSocket();
          await sock.sendMessage(parseMentionTarget(target), { text: message });
        },
      },
    });

    const isGroup = jid.endsWith('@g.us');
    await this.withTypingIndicator(jid, () =>
      handler.handle(jid, {
        text,
        senderName: name,
        images,
        stickers: options?.stickers,
        quotedText: options?.quotedText,
        externalId: options?.externalId,
        conversationId: jid,
        isGroup,
        mentionsBot: isGroup && whatsappState.mentionId.length > 0 && text.includes(`@${whatsappState.mentionId}`),
        isTrustedSender,
        mentionId: whatsappState.mentionId,
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
    const target = parseMentionTarget(jid);
    for (const chunk of splitMessage(text, WHATSAPP_MESSAGE_LIMIT)) {
      await sock.sendMessage(target, { text: chunk });
    }
  }

  async sendSticker(jid: string, sticker: StickerReference): Promise<void> {
    const sock = await this.getSocket();
    const target = parseMentionTarget(jid);
    const forwarded = { key: sticker.key, message: sticker.message } as WAMessage;
    await sock.sendMessage(target, { forward: forwarded });
  }

  private async getSocket(): Promise<SocketLike> {
    if (this.sock) return this.sock;
    if (whatsappState.activeSocket) return whatsappState.activeSocket;
    throw new Error('WhatsApp socket is not connected.');
  }
}
