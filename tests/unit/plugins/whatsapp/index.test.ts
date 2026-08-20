import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESPONSE_ANCHOR, THINK_END, THINK_START } from '../../../../src/constants/thinking';
import { ChannelHandlerFactory } from '../../../../src/channels';
import { create, handleMessage, sendText, WhatsAppChannel } from '../../../../plugins/whatsapp';
import type { PluginContext } from '../../../../plugins/contracts';

const MENTION_ID = '162157312364643';

const mockSock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  sendPresenceUpdate: vi.fn(),
  end: vi.fn(),
  ev: { on: vi.fn() },
}));

vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: vi.fn(() => mockSock),
  useMultiFileAuthState: vi.fn().mockResolvedValue({ state: {}, saveCreds: vi.fn() }),
  DisconnectReason: { loggedOut: 401, connectionClosed: 428, connectionLost: 408 },
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
        { text: `${senderName} says: what time is it?` },
        'group123@g.us',
        { channel: 'whatsapp', toolsEnabled: false, learnedSkillsEnabled: false },
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
        { text: `guilherme says: hey  help` },
        'group123@g.us',
        { channel: 'whatsapp', toolsEnabled: false, learnedSkillsEnabled: false },
      );
    });

    it('forwards group messages even when mentionId is not configured', async () => {
      const agent = { handle: vi.fn().mockResolvedValue('pong') };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'group123@g.us', 'guilherme', `@${MENTION_ID} hello`);

      expect(agent.handle).toHaveBeenCalledWith(
        { text: `guilherme says: hello` },
        'group123@g.us',
        { channel: 'whatsapp', toolsEnabled: false, learnedSkillsEnabled: false },
      );
    });

    it('enables tools and learned skills for whitelisted WhatsApp senders', async () => {
      const agent = { handle: vi.fn().mockResolvedValue('pong') };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'jid@s.whatsapp.net', 'guilherme', 'hello', undefined, {
        isWhitelistedSender: true,
      });

      expect(agent.handle).toHaveBeenCalledWith(
        { text: 'guilherme says: hello', images: undefined },
        'jid@s.whatsapp.net',
        { channel: 'whatsapp', toolsEnabled: true, learnedSkillsEnabled: true },
      );
    });

    it('ignores untrusted senders when allow_untrusted is off', async () => {
      create(makeContext({ allowUntrusted: false }));

      const agent = { handle: vi.fn().mockResolvedValue('pong') };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'jid@s.whatsapp.net', 'guilherme', 'hello');

      expect(agent.handle).not.toHaveBeenCalled();
      expect(mockSock.sendMessage).not.toHaveBeenCalled();
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

  describe('module-level exports', () => {
    it('handleMessage is exported and callable', () => {
      expect(typeof handleMessage).toBe('function');
    });

    it('sendText is exported and callable', () => {
      expect(typeof sendText).toBe('function');
    });
  });
});
