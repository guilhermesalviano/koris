import type { ChannelDefinition } from '../../src/channels';
import { ADAPTERS } from '../../src/channels';
import type { ILogger } from '../../src/infrastructure/logger';
import type { Plugin, PluginRegistry } from '../registry';
import type { IMessageGateway } from '../../src/services/agents/message-gateway';
import type { ImageAttachment } from '../../src/types/messages';
import type { WAMessage } from '@whiskeysockets/baileys';
import { stripInternalStreamMarkers } from '../../src/utils/stream-markers';
import { config } from '../../src/config';

const whatsappConfig = config?.CHANNELS?.WHATSAPP;
const mentionId = whatsappConfig?.MENTION_ID;

const WHATSAPP_MESSAGE_LIMIT = 4_000;
const whitelist = whatsappConfig?.WHITELIST
  ? whatsappConfig.WHITELIST.split(',').map(num => num.trim()).filter(Boolean)
  : [];

interface WhatsAppChannelStartOptions {
  authFolder: string;
  mentionId: string;
  gateway: IMessageGateway;
  logger: ILogger;
}

interface WhatsAppPluginOptions {
  enabled: boolean;
  authFolder: string;
  mentionId: string;
}

interface IWhatsAppChannel {
  handleMessage(gateway: IMessageGateway, jid: string, name: string, text: string, images?: ImageAttachment[]): Promise<void>;
  sendText(jid: string, text: string): Promise<void>;
}

interface SocketLike {
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
  end(err: Error | undefined): void;
  ev: {
    on(event: string, handler: (data: unknown) => void): void;
  };
}

let activeSocket: SocketLike | null = null;
let lastWhitelistedJid: string | null = null;

function getLastWhitelistedJid(): string | null {
  return lastWhitelistedJid;
}

async function startBaileysSocket(options: WhatsAppChannelStartOptions): Promise<SocketLike> {
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
          .then((newSock) => { activeSocket = newSock; })
          .catch((err: Error) => options.logger.warn(`WhatsApp reconnect failed: ${err.message}`));
      } else {
        activeSocket = null;
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
      const { fromMe, remoteJid: jid, participantAlt, remoteJidAlt } = key;

      if (fromMe) continue;

      const isWhitelisted = whitelist.some(number =>
        participantAlt?.includes(number) || remoteJidAlt?.includes(number)
      );

      if (!isWhitelisted) {
        options.logger.debug(`[whatsapp] message ignored: not from whitelisted number`);
        continue;
      }

      if (jid) {
        lastWhitelistedJid = jid;
      }

      if (!jid || !senderName) continue;

      const rawText = extractText(msg);
      const image = extractImage(msg);
      if (!rawText && !image) continue;

      const text = image?.caption ?? rawText ?? '';
      if (!shouldProcess(jid, text)) continue;

      void handleInboundMessage(options, sock, jid, senderName, text, image).catch((err: Error) => {
        options.logger.warn(`WhatsApp message handling error: ${err.message}`);
      });
    }
  });

  return sock;
 }

 function extractText(msg: { message?: unknown }): string | null {
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

interface ExtractedImage {
  caption?: string;
  mimetype?: string;
  message: WAMessage;
}

function extractImage(msg: WAMessage): ExtractedImage | null {
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

 function shouldProcess(jid: string, text: string): boolean {
   if (jid.endsWith('@g.us')) {
     return mentionId.length > 0 && text.includes(`@${mentionId}`);
   }
   return true;
 }

 async function downloadImageBase64(image: ExtractedImage, logger: ILogger): Promise<ImageAttachment | null> {
   try {
     const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
     const buffer = await downloadMediaMessage(image.message, 'buffer', {}) as Buffer;
     return { data: buffer.toString('base64'), mimeType: image.mimetype };
   } catch (err) {
     logger.warn(`WhatsApp image download failed: ${err instanceof Error ? err.message : String(err)}`);
     return null;
   }
 }

 async function handleInboundMessage(
   options: WhatsAppChannelStartOptions,
   sock: SocketLike,
   jid: string,
   senderName: string,
   text: string,
   image: ExtractedImage | null,
 ): Promise<void> {
   const cleanedText = mentionId ? text.replace(`@${mentionId}`, '').trim() : text;
   const images: ImageAttachment[] = [];
   if (image) {
     const attachment = await downloadImageBase64(image, options.logger);
     if (attachment) images.push(attachment);
   }

   const channel = new WhatsAppChannel(sock);
   await channel.handleMessage(options.gateway, jid, senderName, cleanedText, images);
 }

 function formatBaileysLog(msg: unknown): string {
  if (typeof msg === 'string') return msg;
  try {
    const serialized = JSON.stringify(msg);
    return serialized ?? String(msg);
  } catch {
    return String(msg);
  }
}

function createBaileysLogger(logger: ILogger) {
  return {
    level: 'silent' as const,
    trace: () => {},
    debug: () => {},
    info: (msg: unknown) => logger.debug(`[baileys] ${formatBaileysLog(msg)}`),
    warn: (msg: unknown) => logger.warn(`[baileys] ${formatBaileysLog(msg)}`),
    error: (msg: unknown) => logger.error(`[baileys] ${formatBaileysLog(msg)}`),
    fatal: (msg: unknown) => logger.error(`[baileys] fatal: ${formatBaileysLog(msg)}`),
    child: () => createBaileysLogger(logger),
  };
}

class WhatsAppChannel implements IWhatsAppChannel {
  constructor(
    private readonly sock?: SocketLike
  ) {}

  async handleMessage(gateway: IMessageGateway, jid: string, name: string, text: string, images?: ImageAttachment[]): Promise<void> {
    try {
      // In testing... To remember old version: `Message from ${name}: ${text}`;
      const prompt = `${name} says: ${text}`;
      const response = await gateway.handle({ text: prompt, images }, jid, { channel: 'whatsapp' });
      const resolved = await this.resolveResponse(response);
      await this.sendText(jid, resolved);
    } catch (err) {
      const sock = await this.getSocket();
      const error = err instanceof Error ? err.message : 'Sorry, I ran into an unexpected problem. Could you try again?';
      await sock.sendMessage(jid, { text: `❌ ${error}` });
    }
  }

  async sendText(jid: string, text: string): Promise<void> {
    const sock = await this.getSocket();
    for (const chunk of splitMessage(text, WHATSAPP_MESSAGE_LIMIT)) {
      await sock.sendMessage(jid, { text: chunk });
    }
  }

  private async resolveResponse(response: unknown): Promise<string> {
    if (typeof response === 'string') {
      return stripInternalStreamMarkers(response);
    }

    if (this.isAsyncIterable(response)) {
      let out = '';
      for await (const chunk of response) {
        out += chunk;
      }
      return stripInternalStreamMarkers(out);
    }

    return String(response);
  }

  private isAsyncIterable(value: unknown): value is AsyncIterable<string> {
    if (!value || typeof value !== 'object') return false;
    const maybe = value as { [Symbol.asyncIterator]?: unknown };
    return typeof maybe[Symbol.asyncIterator] === 'function';
  }

  private async getSocket(): Promise<SocketLike> {
    if (this.sock) return this.sock;
    if (activeSocket) return activeSocket;
    throw new Error('WhatsApp socket is not connected.');
  }
}

class WhatsAppChannelFactory {
  static create(): IWhatsAppChannel {
    return new WhatsAppChannel();
  }

  static async start(
    options: WhatsAppChannelStartOptions,
  ): Promise<{ channel: IWhatsAppChannel; stop: () => void }> {
    const channel = new WhatsAppChannel(undefined);
    const sock = await startBaileysSocket(options);
    activeSocket = sock;

    return {
      channel,
      stop: () => {
        sock.end(undefined);
        activeSocket = null;
      },
    };
  }

  static async sendText(jid: string, text: string): Promise<void> {
    const channel = new WhatsAppChannel();
    await channel.sendText(jid, text);
  }
}

const whatsappChannel = WhatsAppChannelFactory.create();

async function handleMessage(gateway: IMessageGateway, jid: string, name: string, text: string, images?: ImageAttachment[]): Promise<void> {
  await whatsappChannel.handleMessage(gateway, jid, name, text, images);
}

async function sendText(jid: string, text: string): Promise<void> {
  await whatsappChannel.sendText(jid, text);
}

function createWhatsAppAdapter(options: WhatsAppPluginOptions): ChannelDefinition {
  return {
    name: 'whatsapp',
    enabled: () => options.enabled,
    start: (logger: ILogger, gateway: IMessageGateway) => {
      let stopFn: (() => void) | null = null;

      WhatsAppChannelFactory.start({ authFolder: options.authFolder, mentionId: options.mentionId, gateway, logger })
        .then(({ stop }) => { stopFn = stop; })
        .catch((err: Error) => logger.warn(`Failed to start WhatsApp: ${err.message}`));

      return () => { stopFn?.(); };
    },
    sendMessage: async (_logger: ILogger, target: string, message: string) => {
      await WhatsAppChannelFactory.sendText(target, message);
    },
  };
}

function createWhatsAppPlugin(options: WhatsAppPluginOptions): Plugin {
  return {
    name: 'whatsapp',
    setup(registry: PluginRegistry) {
      registry.extend(ADAPTERS, createWhatsAppAdapter(options));
    },
  };
}

export {
  createWhatsAppPlugin,
  getLastWhitelistedJid,
  handleMessage,
  IWhatsAppChannel,
  sendText,
  WhatsAppChannel,
  WhatsAppChannelFactory,
};

export function create(): Plugin {
  return createWhatsAppPlugin({
    enabled: config.CHANNELS.WHATSAPP.ENABLED,
    authFolder: config.CHANNELS.WHATSAPP.AUTH_FOLDER,
    mentionId: config.CHANNELS.WHATSAPP.MENTION_ID,
  });
}

function splitMessage(text: string, maxLength: number): string[] {
  if (!text) return [];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const splitIndex = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf(' '));
    const end = splitIndex > 0 ? splitIndex : maxLength;

    chunks.push(remaining.slice(0, end).trimEnd());
    remaining = remaining.slice(end).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
