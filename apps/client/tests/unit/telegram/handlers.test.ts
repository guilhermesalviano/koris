import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage, sendCode, sendWithApproval } from '../../../src/telegram/handlers';
import * as processor from '../../../src/agent/processor';
import * as botModule from '../../../src/telegram/bot';

// Mock the processor and bot
vi.mock('../../../src/agent/processor', () => ({
  processUserMessage: vi.fn(),
}));

vi.mock('../../../src/telegram/bot', () => ({
  getBot: vi.fn(),
}));

describe('Telegram Handlers', () => {
  const mockMsg = {
    chat: { id: 123456 },
    text: 'test message',
    from: { id: 1, username: 'testuser', first_name: 'Test', is_bot: false },
  };

  const mockBot = {
    sendMessage: vi.fn().mockResolvedValue({}),
    sendChatAction: vi.fn().mockResolvedValue({}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(botModule.getBot).mockReturnValue(mockBot as any);
  });

  describe('handleMessage', () => {
    it('should process user messages', async () => {
      vi.mocked(processor.processUserMessage).mockResolvedValue('Test response');
      
      await handleMessage(mockMsg as any);
      
      expect(processor.processUserMessage).toHaveBeenCalledWith('test message', 'telegram');
      expect(mockBot.sendMessage).toHaveBeenCalledWith(123456, 'Test response', {
        parse_mode: 'Markdown',
      });
    });

    it('should handle undefined text', async () => {
      const noTextMsg = { ...mockMsg };
      delete (noTextMsg as any).text;
      
      await handleMessage(noTextMsg as any);
      
      expect(processor.processUserMessage).not.toHaveBeenCalled();
    });

    it('should handle commands', async () => {
      vi.mocked(processor.processUserMessage).mockResolvedValue('Command response');
      const commandMsg = { ...mockMsg, text: '/help' };
      
      await handleMessage(commandMsg as any);
      
      expect(processor.processUserMessage).toHaveBeenCalledWith('/help', 'telegram');
      expect(mockBot.sendMessage).toHaveBeenCalled();
    });

    it('should handle instructions', async () => {
      vi.mocked(processor.processUserMessage).mockResolvedValue('Instruction response');
      const instructionMsg = { ...mockMsg, text: 'read package.json' };
      
      await handleMessage(instructionMsg as any);
      
      expect(processor.processUserMessage).toHaveBeenCalledWith('read package.json', 'telegram');
      expect(mockBot.sendMessage).toHaveBeenCalled();
    });

    it('should use Markdown parse mode', async () => {
      vi.mocked(processor.processUserMessage).mockResolvedValue('Response with *markdown*');
      
      await handleMessage(mockMsg as any);
      
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(String),
        { parse_mode: 'Markdown' }
      );
    });

    it('should send typing indicator', async () => {
      vi.mocked(processor.processUserMessage).mockResolvedValue('Test');
      
      await handleMessage(mockMsg as any);
      
      expect(mockBot.sendChatAction).toHaveBeenCalledWith(123456, 'typing');
    });

    it('should extract chat ID correctly', async () => {
      vi.mocked(processor.processUserMessage).mockResolvedValue('Test');
      const customChatMsg = { ...mockMsg, chat: { id: 999999 } };
      
      await handleMessage(customChatMsg as any);
      
      expect(mockBot.sendMessage).toHaveBeenCalledWith(999999, expect.any(String), expect.any(Object));
    });
  });

  describe('sendCode', () => {
    it('should send code with formatting', async () => {
      await sendCode(123456, 'console.log("test")', 'javascript');
      
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        '```javascript\nconsole.log("test")\n```',
        { parse_mode: 'Markdown' }
      );
    });

    it('should send code without language', async () => {
      await sendCode(123456, 'plain text');
      
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        '```\nplain text\n```',
        { parse_mode: 'Markdown' }
      );
    });
  });

  describe('sendWithApproval', () => {
    it('should send message with approval buttons', async () => {
      await sendWithApproval(123456, 'Approve this?', 'action_123');
      
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456,
        'Approve this?',
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: '✅ Approve' }),
                expect.objectContaining({ text: '❌ Reject' }),
              ]),
            ]),
          }),
        })
      );
    });
  });
});
