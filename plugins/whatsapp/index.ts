import { ADAPTERS, splitMessage } from '../contracts';
import { parseMentionTarget } from './jid';
import type {
  ChannelDefinition,
  IChannelHandlerFactory,
  ILogger,
  IMessageGateway,
  ImageAttachment,
  Plugin,
  PluginContext,
} from '../contracts';
import type { PluginRegistry } from '../registry';
import type { WAMessage } from '@whiskeysockets/baileys';

const WHATSAPP_MESSAGE_LIMIT = 4_000;
const TYPING_INTERVAL_MS = 5_000;
const GROUP_NAME_TTL_MS = 60 * 60 * 1_000;

let channelHandler: IChannelHandlerFactory;
let mentionId = '';
let whitelist: string[] = [];
let allowUntrusted = false;

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
  handleMessage(
    gateway: IMessageGateway,
    jid: string,
    name: string,
    text: string,
    images?: ImageAttachment[],
    options?: { isWhitelistedSender?: boolean; groupName?: string },
  ): Promise<void>;
  sendText(jid: string, text: string): Promise<void>;
}

interface SocketLike {
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
  sendPresenceUpdate(presence: 'composing' | 'paused', jid: string): Promise<unknown>;
  groupMetadata(jid: string): Promise<{ subject?: string }>;
  end(err: Error | undefined): void;
  ev: {
    on(event: string, handler: (data: unknown) => void): void;
  };
}

let activeSocket: SocketLike | null = null;
let lastWhitelistedJid: string | null = null;

const groupNameCache = new Map<string, { name: string; fetchedAt: number }>();

async function resolveGroupName(sock: SocketLike, jid: string, logger: ILogger): Promise<string | undefined> {
  const cached = groupNameCache.get(jid);
  if (cached && Date.now() - cached.fetchedAt < GROUP_NAME_TTL_MS) {
    return cached.name;
  }

  try {
    const metadata = await sock.groupMetadata(jid);
    if (!metadata.subject) {
      return undefined;
    }
    groupNameCache.set(jid, { name: metadata.subject, fetchedAt: Date.now() });
    return metadata.subject;
  } catch (err) {
    logger.warn(`Failed to fetch WhatsApp group metadata for ${jid}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

function getLastWhitelistedJid(): string | null {
  return lastWhitelistedJid;
}

function isWhitelistedSender(msg: WAMessage): boolean {
  const key = msg.key;
  if (!key) return false;

  const candidates = [
    key.participantAlt,
    key.remoteJidAlt,
    key.participant ?? undefined,
    key.remoteJid ?? undefined,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (whitelist.length === 0) {
    return false;
  }

  return candidates.some((candidate) =>
    whitelist.some((number) => candidate.includes(number)),
  );
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
      const { fromMe, remoteJid: jid } = key;

      if (fromMe) continue;

      const isWhitelisted = isWhitelistedSender(msg);

      if (isWhitelisted && jid) {
        lastWhitelistedJid = jid;
      }

      if (!jid || !senderName) continue;

      const rawText = extractText(msg);
      const image = extractImage(msg);
      if (!rawText && !image) continue;

      const text = image?.caption ?? rawText ?? '';
      const isGroup = jid.endsWith('@g.us');
      const mentionsBot = isGroup && options.mentionId.length > 0 && text.includes(`@${options.mentionId}`);
      if (isGroup && !mentionsBot) continue;

      void handleInboundMessage(options, sock, jid, senderName, text, image, isWhitelisted).catch((err: Error) => {
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
   isWhitelistedSender: boolean,
 ): Promise<void> {
   const images: ImageAttachment[] = [];
   if (image) {
     const attachment = await downloadImageBase64(image, options.logger);
     if (attachment) images.push(attachment);
   }

const channel = new WhatsAppChannel(sock);
   const groupName = jid.endsWith('@g.us') ? await resolveGroupName(sock, jid, options.logger) : undefined;
   await channel.handleMessage(options.gateway, jid, senderName, text, images, { isWhitelistedSender, groupName });
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

  async handleMessage(
    gateway: IMessageGateway,
    jid: string,
    name: string,
    text: string,
    images?: ImageAttachment[],
    options?: { isWhitelistedSender?: boolean; groupName?: string },
  ): Promise<void> {
    const isTrustedSender = options?.isWhitelistedSender ?? false;
    if (!isTrustedSender && !allowUntrusted) {
      return;
    }

    const handler = channelHandler.create({
      channel: 'whatsapp',
      gateway,
      mentionId,
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
        isGroup,
        mentionsBot: isGroup && mentionId.length > 0 && text.includes(`@${mentionId}`),
        isTrustedSender,
        mentionId,
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

export function create(context: PluginContext): Plugin {
  const cfg = context.config.channels.WHATSAPP;
  channelHandler = context.channelHandler;
  mentionId = cfg.MENTION_ID;
  whitelist = cfg.WHITELIST.split(',').map((num) => num.trim()).filter(Boolean);
  allowUntrusted = context.config.channels.ALLOW_UNTRUSTED;

  return createWhatsAppPlugin({
    enabled: cfg.ENABLED,
    authFolder: cfg.AUTH_FOLDER,
    mentionId,
  });
}