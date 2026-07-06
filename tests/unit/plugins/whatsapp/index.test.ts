import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESPONSE_ANCHOR, THINK_END, THINK_START } from '../../../../src/constants/thinking';
import { handleMessage, sendText, WhatsAppChannel } from '../../../../plugins/whatsapp';

const MENTION_ID = '162157312364643';

const mockSock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  end: vi.fn(),
  ev: { on: vi.fn() },
}));

vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: vi.fn(() => mockSock),
  useMultiFileAuthState: vi.fn().mockResolvedValue({ state: {}, saveCreds: vi.fn() }),
  DisconnectReason: { loggedOut: 401, connectionClosed: 428, connectionLost: 408 },
}));

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
  });

  describe('WhatsAppChannel.handleMessage', () => {
    it('strips think output before sending the WhatsApp reply', async () => {
      const agent = { handle: vi.fn().mockResolvedValue(createResponseStream()) };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'jid@s.whatsapp.net', 'hello');

      expect(mockSock.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockSock.sendMessage).toHaveBeenCalledWith('jid@s.whatsapp.net', { text: 'Visible reply' });
    });

    it('handles plain string responses', async () => {
      const agent = { handle: vi.fn().mockResolvedValue('Hello there') };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'jid@s.whatsapp.net', 'hi');

      expect(mockSock.sendMessage).toHaveBeenCalledWith('jid@s.whatsapp.net', { text: 'Hello there' });
    });

    it('sends an error message when the agent throws', async () => {
      const agent = { handle: vi.fn().mockRejectedValue(new Error('agent error')) };

      const channel = new WhatsAppChannel(mockSock as never);
      await channel.handleMessage(agent, 'jid@s.whatsapp.net', 'hi');

      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        'jid@s.whatsapp.net',
        expect.objectContaining({ text: expect.stringContaining('❌') }),
      );
    });

    it('responds to group message starting with the mention', async () => {
      const agent = { handle: vi.fn().mockResolvedValue('pong') };
      const senderName = 'TestUser';
      const text = `@${MENTION_ID} what time is it?`;

      const channel = new WhatsAppChannel(mockSock as never, MENTION_ID);
      await channel.handleMessage(agent, 'group123@g.us', senderName, text);

      expect(agent.handle).toHaveBeenCalledWith(`Message from ${senderName} on WhatsApp: ${text}`);
      expect(mockSock.sendMessage).toHaveBeenCalled();
    });

    it('ignores group message that does not start with the mention', async () => {
      const agent = { handle: vi.fn() };
      const senderName = 'TestUser';
      const text = 'anyone know the weather today?';

      const channel = new WhatsAppChannel(mockSock as never, MENTION_ID);
      await channel.handleMessage(agent, 'group123@g.us', senderName, text);

      expect(agent.handle).not.toHaveBeenCalled();
      expect(mockSock.sendMessage).not.toHaveBeenCalled();
    });

    it('ignores group message where mention appears mid-text', async () => {
      const agent = { handle: vi.fn() };

      const channel = new WhatsAppChannel(mockSock as never, MENTION_ID);
      await channel.handleMessage(agent, 'group123@g.us', `hey @${MENTION_ID} help`);

      expect(agent.handle).not.toHaveBeenCalled();
    });

    it('ignores group messages when mentionId is not configured', async () => {
      const agent = { handle: vi.fn() };

      const channel = new WhatsAppChannel(mockSock as never, '');
      await channel.handleMessage(agent, 'group123@g.us', `@${MENTION_ID} hello`);

      expect(agent.handle).not.toHaveBeenCalled();
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
