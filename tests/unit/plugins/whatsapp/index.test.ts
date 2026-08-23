import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESPONSE_ANCHOR, THINK_END, THINK_START } from '../../../../src/constants/thinking';
import { NOT_AUTHORIZED_MESSAGE } from '../../../../src/constants';
import { ChannelHandlerFactory } from '../../../../src/channels';
import { create, handleMessage, sendText, WhatsAppChannel, WhatsAppChannelFactory } from '../../../../plugins/whatsapp';
import type { PluginContext } from '../../../../plugins/contracts';

const MENTION_ID = '162157312364643';

const mockSock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  sendPresenceUpdate: vi.fn(),
  groupMetadata: vi.fn(),
  end: vi.fn(),
  ev: { on: vi.fn() },
}));

const mockDownloadMediaMessage = vi.hoisted(() => vi.fn());

vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: vi.fn(() => mockSock),
  useMultiFileAuthState: vi.fn().mockResolvedValue({ state: {}, saveCreds: vi.fn() }),
  DisconnectReason: { loggedOut: 401, connectionClosed: 428, connectionLost: 408 },
  downloadMediaMessage: mockDownloadMediaMessage,
  DEF_MEDIA_HOST: 'mmg.whatsapp.net',
}));

function makeContext(overrides: { allowUntrusted?: boolean } = {}): PluginContext {
  return {
    config: {
      channels: {
        ALLOW_UNTRUSTED: overrides.allowUntrusted ?? true,
        TELEGRAM: { ENABLED: false, BOT_TOKEN: '', WHITELIST: '' },
        WHATSAPP: { ENABLED: true, AUTH_FOLDER: '', WHITELIST: '', MENTION_ID },
      },
    },
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    gateway: { handle: vi.fn() },
    channelHandler: ChannelHandlerFactory,
  };
}

async function* createResponseStream(): AsyncGenerator<string> {
  yield THINK_START;
  yield 'internal reasoning';
  yield THINK_END;
  yield RESPONSE_ANCHOR;
  yield 'Visible reply';
}

describe('channels/whatsapp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSock.sendMessage.mockResolvedValue(undefined);
    mockSock.sendPresenceUpdate.mockResolvedValue(undefined);
    mockSock.groupMetadata.mockResolvedValue({ subject: 'Family' });
    mockDownloadMediaMessage.mockReset();
    create(makeContext());
  });

  describe('WhatsAppChannel.handleMessage', () => {
    it('strips think output before sending the WhatsApp reply', async () => {
      const agent = { handle: vi.fn().mockResolvedValue(createResponseStream()) };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'jid@s.whatsapp.net', 'guilherme', 'hello');

      expect(mockSock.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockSock.sendMessage).toHaveBeenCalledWith('jid@s.whatsapp.net', { text: 'Visible reply' });
    });

    it('handles plain string responses', async () => {
      const agent = { handle: vi.fn().mockResolvedValue('Hello there') };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'jid@s.whatsapp.net', 'guilherme', 'hi');

      expect(mockSock.sendMessage).toHaveBeenCalledWith('jid@s.whatsapp.net', { text: 'Hello there' });
    });

    it('sends an error message when the agent throws', async () => {
      const agent = { handle: vi.fn().mockRejectedValue(new Error('agent error')) };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'jid@s.whatsapp.net', 'guilherme', 'hi');

      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        'jid@s.whatsapp.net',
        expect.objectContaining({ text: expect.stringContaining('❌') }),
      );
    });

    it('responds to group message starting with the mention', async () => {
      const agent = { handle: vi.fn().mockResolvedValue('pong') };
      const senderName = 'TestUser';
      const text = `@${MENTION_ID} what time is it?`;

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'group123@g.us', senderName, text);

      expect(agent.handle).toHaveBeenCalledWith(
        { text: '[Context] Chat: group (untrusted sender). Sender: TestUser. Message: what time is it?' },
        'group123@g.us',
        { channel: 'whatsapp', toolsEnabled: false, learnedSkillsEnabled: false, stickersEnabled: true },
      );
      expect(mockSock.sendMessage).toHaveBeenCalled();
    });

    it('ignores group message that does not mention the bot', async () => {
      const agent = { handle: vi.fn().mockResolvedValue('pong') };
      const senderName = 'TestUser';
      const text = 'anyone know the weather today?';

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'group123@g.us', senderName, text);

      expect(agent.handle).not.toHaveBeenCalled();
      expect(mockSock.sendMessage).not.toHaveBeenCalled();
    });

    it('strips the mention before forwarding group messages', async () => {
      const agent = { handle: vi.fn().mockResolvedValue('pong') };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'group123@g.us', 'guilherme', `hey @${MENTION_ID} help`);

      expect(agent.handle).toHaveBeenCalledWith(
        { text: '[Context] Chat: group (untrusted sender). Sender: guilherme. Message: hey  help' },
        'group123@g.us',
        { channel: 'whatsapp', toolsEnabled: false, learnedSkillsEnabled: false, stickersEnabled: true },
      );
    });

    it('forwards group messages even when mentionId is not configured', async () => {
      const agent = { handle: vi.fn().mockResolvedValue('pong') };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'group123@g.us', 'guilherme', `@${MENTION_ID} hello`);

      expect(agent.handle).toHaveBeenCalledWith(
        { text: '[Context] Chat: group (untrusted sender). Sender: guilherme. Message: hello' },
        'group123@g.us',
        { channel: 'whatsapp', toolsEnabled: false, learnedSkillsEnabled: false, stickersEnabled: true },
      );
    });

    it('enables tools and learned skills for whitelisted WhatsApp senders', async () => {
      const agent = { handle: vi.fn().mockResolvedValue('pong') };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'jid@s.whatsapp.net', 'guilherme', 'hello', undefined, {
        isWhitelistedSender: true,
      });

      expect(agent.handle).toHaveBeenCalledWith(
        { text: '[Context] Chat: direct. Sender: guilherme. Message: hello', images: undefined },
        'jid@s.whatsapp.net',
        { channel: 'whatsapp', toolsEnabled: true, learnedSkillsEnabled: true, stickersEnabled: true },
      );
    });

    it('prefixes group messages with the group name', async () => {
      const agent = { handle: vi.fn().mockResolvedValue('pong') };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'group123@g.us', 'guilherme', `@${MENTION_ID} hello`, undefined, {
        groupName: 'Family',
      });

      expect(agent.handle).toHaveBeenCalledWith(
        { text: '[Context] Chat: "Family" (group) (untrusted sender). Sender: guilherme. Message: hello' },
        'group123@g.us',
        expect.any(Object),
      );
    });

    it('denies untrusted senders with the not-authorized message when allow_untrusted is off', async () => {
      create(makeContext({ allowUntrusted: false }));

      const agent = { handle: vi.fn().mockResolvedValue('pong') };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'jid@s.whatsapp.net', 'guilherme', 'hello');

      expect(agent.handle).not.toHaveBeenCalled();
      expect(mockSock.sendMessage).toHaveBeenCalledWith('jid@s.whatsapp.net', { text: NOT_AUTHORIZED_MESSAGE });
    });

    it('shows a typing indicator while processing a private message', async () => {
      let resolveAgent: (value: string) => void = () => {};
      const pending = new Promise<string>((resolve) => { resolveAgent = resolve; });
      const agent = { handle: vi.fn().mockReturnValue(pending) };

      const channel = new WhatsAppChannel(mockSock as never);
      const handled = channel.handleMessage(agent, 'jid@s.whatsapp.net', 'guilherme', 'hello');

      await Promise.resolve();
      expect(mockSock.sendPresenceUpdate).toHaveBeenCalledWith('composing', 'jid@s.whatsapp.net');

      resolveAgent('pong');
      await handled;

      expect(mockSock.sendPresenceUpdate).toHaveBeenCalledWith('paused', 'jid@s.whatsapp.net');
    });

    it('re-sends the composing indicator every 5s until the response completes', async () => {
      vi.useFakeTimers();
      try {
        let resolveAgent: (value: string) => void = () => {};
        const pending = new Promise<string>((resolve) => { resolveAgent = resolve; });
        const agent = { handle: vi.fn().mockReturnValue(pending) };

        const channel = new WhatsAppChannel(mockSock as never);
        const handled = channel.handleMessage(agent, 'jid@s.whatsapp.net', 'guilherme', 'hello');

        await Promise.resolve();
        expect(mockSock.sendPresenceUpdate).toHaveBeenCalledTimes(1);
        expect(mockSock.sendPresenceUpdate).toHaveBeenCalledWith('composing', 'jid@s.whatsapp.net');

        await vi.advanceTimersByTimeAsync(5_000);
        expect(mockSock.sendPresenceUpdate).toHaveBeenCalledTimes(2);

        resolveAgent('pong');
        await handled;

        expect(mockSock.sendPresenceUpdate).toHaveBeenCalledWith('paused', 'jid@s.whatsapp.net');
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows a typing indicator while processing a group message', async () => {
      let resolveAgent: (value: string) => void = () => {};
      const pending = new Promise<string>((resolve) => { resolveAgent = resolve; });
      const agent = { handle: vi.fn().mockReturnValue(pending) };

      const channel = new WhatsAppChannel(mockSock as never);
      const handled = channel.handleMessage(agent, 'group123@g.us', 'TestUser', `@${MENTION_ID} hello`);

      await Promise.resolve();
      expect(mockSock.sendPresenceUpdate).toHaveBeenCalledWith('composing', 'group123@g.us');

      resolveAgent('pong');
      await handled;

      expect(mockSock.sendPresenceUpdate).toHaveBeenCalledWith('paused', 'group123@g.us');
    });
  });

  describe('WhatsAppChannel.sendText', () => {
    it('splits long messages into chunks', async () => {
      const longText = 'a'.repeat(5_000);
      const channel = new WhatsAppChannel(mockSock as never);
      await channel.sendText('jid@s.whatsapp.net', longText);

      expect(mockSock.sendMessage.mock.calls.length).toBeGreaterThan(1);
    });

    it('sends a short message as a single chunk', async () => {
      const channel = new WhatsAppChannel(mockSock as never);
      await channel.sendText('jid@s.whatsapp.net', 'short message');

      expect(mockSock.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockSock.sendMessage).toHaveBeenCalledWith('jid@s.whatsapp.net', { text: 'short message' });
    });
  });

  describe('WhatsAppChannel.sendSticker', () => {
    it('forwards the sticker by its stored message reference', async () => {
      const channel = new WhatsAppChannel(mockSock as never);
      const reference = {
        key: { remoteJid: 'jid@s.whatsapp.net', id: 'STANZA_1', participant: 'jid@s.whatsapp.net', fromMe: false },
        message: { stickerMessage: { mimetype: 'image/webp' } },
        mimeType: 'image/webp',
      };

      await channel.sendSticker('jid@s.whatsapp.net', reference);

      expect(mockSock.sendMessage).toHaveBeenCalledWith('jid@s.whatsapp.net', {
        forward: { key: reference.key, message: reference.message },
      });
    });
  });

  describe('module-level exports', () => {
    it('handleMessage is exported and callable', () => {
      expect(typeof handleMessage).toBe('function');
    });

    it('sendText is exported and callable', () => {
      expect(typeof sendText).toBe('function');
    });
  });

  describe('inbound sticker capture via quoted message', () => {
    function makeLogger() {
      return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
    }

    async function startSocket(gateway: { handle: ReturnType<typeof vi.fn> }) {
      await WhatsAppChannelFactory.start({
        authFolder: '',
        mentionId: MENTION_ID,
        gateway: gateway as never,
        logger: makeLogger(),
      });
    }

    function getUpsertHandler(): (payload: { messages: unknown[]; type: string }) => void {
      const call = mockSock.ev.on.mock.calls.find(([event]) => event === 'messages.upsert');
      if (!call) throw new Error('messages.upsert handler was not registered');
      return call[1] as (payload: { messages: unknown[]; type: string }) => void;
    }

    function quotedStickerReply(overrides: {
      text?: string;
      stanzaId?: string;
      participant?: string;
      quotedMessage?: Record<string, unknown>;
    } = {}) {
      return {
        key: { remoteJid: 'jid@s.whatsapp.net', fromMe: false, id: 'MSG1' },
        pushName: 'guilherme',
        message: {
          extendedTextMessage: {
            text: overrides.text ?? 'use this one when I am happy',
            contextInfo: {
              stanzaId: overrides.stanzaId ?? 'QUOTED_STANZA_1',
              participant: overrides.participant ?? 'jid@s.whatsapp.net',
              quotedMessage: overrides.quotedMessage ?? { stickerMessage: { mimetype: 'image/webp' } },
            },
          },
        },
      };
    }

    it('captures the quoted sticker as a reference and forwards it alongside the reply text', async () => {
      const gateway = { handle: vi.fn().mockResolvedValue('pong') };
      await startSocket(gateway);

      getUpsertHandler()({ messages: [quotedStickerReply()], type: 'notify' });

      await vi.waitFor(() => expect(gateway.handle).toHaveBeenCalled());

      expect(mockDownloadMediaMessage).not.toHaveBeenCalled();
      expect(gateway.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('use this one when I am happy'),
          stickers: [{
            key: { remoteJid: 'jid@s.whatsapp.net', id: 'QUOTED_STANZA_1', participant: 'jid@s.whatsapp.net', fromMe: false },
            message: { stickerMessage: { mimetype: 'image/webp' } },
            mimeType: 'image/webp',
          }],
        }),
        'jid@s.whatsapp.net',
        expect.anything(),
      );
    });

    it('defaults the mimetype to image/webp when the quoted sticker omits it', async () => {
      const gateway = { handle: vi.fn().mockResolvedValue('pong') };
      await startSocket(gateway);

      getUpsertHandler()({ messages: [quotedStickerReply({ quotedMessage: { stickerMessage: {} } })], type: 'notify' });

      await vi.waitFor(() => expect(gateway.handle).toHaveBeenCalled());

      expect(gateway.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          stickers: [expect.objectContaining({ mimeType: 'image/webp' })],
        }),
        'jid@s.whatsapp.net',
        expect.anything(),
      );
    });

    it('ignores a bare sticker message that is not a quoted reply', async () => {
      const gateway = { handle: vi.fn().mockResolvedValue('pong') };
      await startSocket(gateway);

      const bareSticker = {
        key: { remoteJid: 'jid@s.whatsapp.net', fromMe: false, id: 'MSG2' },
        pushName: 'guilherme',
        message: { stickerMessage: { mimetype: 'image/webp' } },
      };

      getUpsertHandler()({ messages: [bareSticker], type: 'notify' });
      await Promise.resolve();
      await Promise.resolve();

      expect(mockDownloadMediaMessage).not.toHaveBeenCalled();
      expect(gateway.handle).not.toHaveBeenCalled();
    });

    it('processes a reply quoting a non-sticker message without extracting stickers', async () => {
      const gateway = { handle: vi.fn().mockResolvedValue('pong') };
      await startSocket(gateway);

      const replyToText = quotedStickerReply({ quotedMessage: { conversation: 'the original message' } });

      getUpsertHandler()({ messages: [replyToText], type: 'notify' });

      await vi.waitFor(() => expect(gateway.handle).toHaveBeenCalled());

      expect(mockDownloadMediaMessage).not.toHaveBeenCalled();
      expect(gateway.handle).toHaveBeenCalledWith(
        expect.objectContaining({ stickers: [] }),
        'jid@s.whatsapp.net',
        expect.anything(),
      );
    });

    it('captures a quoted sticker from a real LID-addressed group payload', async () => {
      const gateway = { handle: vi.fn().mockResolvedValue('pong') };
      const stickerContent = {
        url: 'https://a.whatsapp.net',
        fileSha256: 'hW56IFOLKUCVkqBR1PPhZXYk/CrbBJLv88dE6g8wsC8=',
        fileEncSha256: 'G7CkFIQYJAHSxQBcj9uZ0cxSXjF8F7kArQHUBAHFxao=',
        mediaKey: 'jl+jVLvmQUh+sCv4CGIXQ2zeQ9dzgUjbveOc8oS8iLg=',
        mimetype: 'image/webp',
        height: 125,
        width: 125,
        directPath: '/v/t62.15575-24/539699406_1385791266991592_2331193282108613296_n.enc?ccb=11-4',
        fileLength: '64290',
        mediaKeyTimestamp: '1760412473222',
        stickerSentTs: '1787428453800',
      };
      const groupJid = '120363407821582446@g.us';
      const realMessage = {
        key: {
          remoteJid: groupJid,
          fromMe: false,
          id: '3EB0922A731BE6FFB35738',
          participant: '141789856067723@lid',
          participantAlt: '5511948449969@s.whatsapp.net',
          addressingMode: 'lid',
        },
        messageTimestamp: 1787428471,
        pushName: 'Guilherme',
        broadcast: false,
        message: {
          extendedTextMessage: {
            text: `@${MENTION_ID} use quando quiser rir de alguem`,
            contextInfo: {
              stanzaId: '3EB07B337C97D0F61128B4',
              participant: '141789856067723@lid',
              quotedMessage: { stickerMessage: stickerContent },
              mentionedJid: [`${MENTION_ID}@lid`],
              disappearingMode: { initiator: 'CHANGED_IN_CHAT', trigger: 'CHAT_SETTING', initiatedByMe: false },
            },
            inviteLinkGroupTypeV2: 'DEFAULT',
          },
          messageContextInfo: {
            messageSecret: 'qpGdQODX0g5k2bwoskNHK/dfpIcQhya/sH/VYSPGfTo=',
            limitSharingV2: { sharingLimited: false, trigger: 'UNKNOWN', limitSharingSettingTimestamp: '0', initiatedByMe: false },
          },
        },
      };
      await startSocket(gateway);

      getUpsertHandler()({ messages: [realMessage], type: 'notify' });

      await vi.waitFor(() => expect(gateway.handle).toHaveBeenCalled());

      expect(mockDownloadMediaMessage).not.toHaveBeenCalled();
      expect(gateway.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('use quando quiser rir de alguem'),
          stickers: [{
            key: { remoteJid: groupJid, id: '3EB07B337C97D0F61128B4', participant: '141789856067723@lid', fromMe: false },
            message: { stickerMessage: stickerContent },
            mimeType: 'image/webp',
          }],
        }),
        groupJid,
        expect.anything(),
      );
    });
  });

  describe('inbound quoted text/image capture', () => {
    function makeLogger() {
      return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
    }

    async function startSocket(gateway: { handle: ReturnType<typeof vi.fn> }) {
      await WhatsAppChannelFactory.start({
        authFolder: '',
        mentionId: MENTION_ID,
        gateway: gateway as never,
        logger: makeLogger(),
      });
    }

    function getUpsertHandler(): (payload: { messages: unknown[]; type: string }) => void {
      const call = mockSock.ev.on.mock.calls.find(([event]) => event === 'messages.upsert');
      if (!call) throw new Error('messages.upsert handler was not registered');
      return call[1] as (payload: { messages: unknown[]; type: string }) => void;
    }

    function quotedReply(overrides: {
      text?: string;
      stanzaId?: string;
      participant?: string;
      quotedMessage?: Record<string, unknown>;
    } = {}) {
      return {
        key: { remoteJid: 'jid@s.whatsapp.net', fromMe: false, id: 'MSG1' },
        pushName: 'guilherme',
        message: {
          extendedTextMessage: {
            text: overrides.text ?? 'what does this mean?',
            contextInfo: {
              stanzaId: overrides.stanzaId ?? 'QUOTED_STANZA_1',
              participant: overrides.participant ?? 'jid@s.whatsapp.net',
              quotedMessage: overrides.quotedMessage ?? { conversation: 'the original message' },
            },
          },
        },
      };
    }

    it('captures quoted plain text and folds it into the prompt', async () => {
      const gateway = { handle: vi.fn().mockResolvedValue('pong') };
      await startSocket(gateway);

      getUpsertHandler()({
        messages: [quotedReply({ quotedMessage: { conversation: 'the original message' } })],
        type: 'notify',
      });

      await vi.waitFor(() => expect(gateway.handle).toHaveBeenCalled());

      expect(gateway.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Quoting: "the original message"'),
        }),
        'jid@s.whatsapp.net',
        expect.anything(),
      );
    });

    it('captures quoted text when the quoted message was itself an extended text message', async () => {
      const gateway = { handle: vi.fn().mockResolvedValue('pong') };
      await startSocket(gateway);

      getUpsertHandler()({
        messages: [quotedReply({ quotedMessage: { extendedTextMessage: { text: 'quoted extended text' } } })],
        type: 'notify',
      });

      await vi.waitFor(() => expect(gateway.handle).toHaveBeenCalled());

      expect(gateway.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Quoting: "quoted extended text"'),
        }),
        'jid@s.whatsapp.net',
        expect.anything(),
      );
    });

    it('downloads a quoted image and tags it as quoted', async () => {
      const gateway = { handle: vi.fn().mockResolvedValue('pong') };
      mockDownloadMediaMessage.mockResolvedValue(Buffer.from('img-bytes'));
      await startSocket(gateway);

      getUpsertHandler()({
        messages: [quotedReply({ quotedMessage: { imageMessage: { mimetype: 'image/jpeg' } } })],
        type: 'notify',
      });

      await vi.waitFor(() => expect(gateway.handle).toHaveBeenCalled());

      expect(mockDownloadMediaMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          key: { remoteJid: 'jid@s.whatsapp.net', id: 'QUOTED_STANZA_1', participant: 'jid@s.whatsapp.net', fromMe: false },
          message: { imageMessage: { mimetype: 'image/jpeg' } },
        }),
        'buffer',
        {},
      );
      expect(gateway.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          images: [{ data: Buffer.from('img-bytes').toString('base64'), mimeType: 'image/jpeg', source: 'quoted' }],
        }),
        'jid@s.whatsapp.net',
        expect.anything(),
      );
    });

    it('does not extract quoted text when the reply does not quote anything', async () => {
      const gateway = { handle: vi.fn().mockResolvedValue('pong') };
      await startSocket(gateway);

      const plainMessage = {
        key: { remoteJid: 'jid@s.whatsapp.net', fromMe: false, id: 'MSG2' },
        pushName: 'guilherme',
        message: { conversation: 'just a normal message' },
      };

      getUpsertHandler()({ messages: [plainMessage], type: 'notify' });

      await vi.waitFor(() => expect(gateway.handle).toHaveBeenCalled());

      expect(gateway.handle).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.not.stringContaining('Quoting') }),
        'jid@s.whatsapp.net',
        expect.anything(),
      );
    });
  });
});
