import type { WAMessage } from '@whiskeysockets/baileys';
import type { ILogger, IMessageGateway, ImageAttachment, StickerReference } from '../contracts';

export interface WhatsAppChannelStartOptions {
  authFolder: string;
  botNumber: string;
  gateway: IMessageGateway;
  logger: ILogger;
}

export interface WhatsAppPluginOptions {
  isEnabled: () => boolean;
  authFolder: string;
  botNumber: string;
}

export interface WhatsAppInboundOptions {
  isWhitelistedSender?: boolean;
  mentionsBot?: boolean;
  groupName?: string;
  stickers?: StickerReference[];
  quotedText?: string;
  externalId?: string;
}

export interface IWhatsAppChannel {
  handleMessage(
    gateway: IMessageGateway,
    jid: string,
    name: string,
    text: string,
    images?: ImageAttachment[],
    options?: WhatsAppInboundOptions,
  ): Promise<void>;
  sendText(jid: string, text: string): Promise<void>;
  sendSticker(jid: string, sticker: StickerReference): Promise<void>;
}

export interface GroupParticipantLite {
  id?: string | null;
  lid?: string | null;
  phoneNumber?: string | null;
  name?: string | null;
  notify?: string | null;
  verifiedName?: string | null;
}

export interface SocketLike {
  user?: { id?: string | null; lid?: string | null; phoneNumber?: string | null };
  signalRepository?: { lidMapping?: { getLIDForPN(pn: string): Promise<string | null> } };
  onWhatsApp?(...phoneNumbers: string[]): Promise<{ jid: string; exists: boolean }[] | undefined>;
  sendMessage(jid: string, content: { text: string } | { forward: WAMessage }): Promise<unknown>;
  sendPresenceUpdate(presence: 'composing' | 'paused', jid: string): Promise<unknown>;
  groupMetadata(jid: string): Promise<{ subject?: string; participants?: GroupParticipantLite[] }>;
  end(err: Error | undefined): void;
  ev: {
    on(event: string, handler: (data: unknown) => void): void;
    removeAllListeners(event: string): void;
  };
}

export interface ExtractedImage {
  caption?: string;
  mimetype?: string;
  message: WAMessage;
}

export interface ExtractedSticker {
  mimetype?: string;
  quotedMessage: unknown;
  stanzaId?: string;
  participant?: string;
}

export interface ExtractedQuotedImage {
  caption?: string;
  mimetype?: string;
  quotedMessage: Record<string, unknown>;
  stanzaId?: string;
  participant?: string;
}

export interface QuotedMessageInfo {
  quotedMessage: Record<string, unknown>;
  stanzaId?: string;
  participant?: string;
}
