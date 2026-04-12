import { describe, it, expect } from 'vitest';
import { processUserMessage } from '../../../src/agent/processor';

describe('Message Processor', () => {
  describe('Command Handling', () => {
    it('should handle /start command', async () => {
      const result = await processUserMessage('/start', 'tui');
      expect(result).toContain('Welcome');
    });

    it('should handle /help command', async () => {
      const result = await processUserMessage('/help', 'tui');
      expect(result).toContain('Available Commands:');
    });

    it('should handle /status command', async () => {
      const result = await processUserMessage('/status', 'telegram');
      expect(result).toContain('Status');
    });

    it('should return empty response for /exit in TUI', async () => {
      const result = await processUserMessage('/exit', 'tui');
      expect(result).toContain('Goodbye!');
    });

    it('should format commands differently for Telegram vs TUI', async () => {
      const tuiResult = await processUserMessage('/help', 'tui');
      const telegramResult = await processUserMessage('/help', 'telegram');
      
      // TUI uses ANSI colors, Telegram uses Markdown
      expect(tuiResult).not.toEqual(telegramResult);
      expect(telegramResult).toContain('*');
    });
  });

  describe('Non-command messages', () => {
    it('should route plain messages to AI provider', async () => {
      const result = await processUserMessage('Hello world', 'tui');
      expect(result).toContain('received your message');
    });

    it('should route former instruction-like messages to AI provider', async () => {
      const result = await processUserMessage('read package.json', 'tui');
      expect(result).toContain('received your message');
      expect(result).toContain('read package.json');
    });

    it('should handle unknown instructions', async () => {
      const result = await processUserMessage('Hello world', 'tui');
      expect(result).toContain('received your message');
    });
  });

  describe('Telegram message routing', () => {
    it('should keep user prompt content in provider response', async () => {
      const result = await processUserMessage('search for key-for-tests', 'telegram');
      expect(result).toContain('search for key-for-tests');
    });
  });

  describe('AI fallback behavior', () => {
    it('should route write-style prompts to AI provider', async () => {
      const result = await processUserMessage('write newfile.ts', 'tui');
      expect(result).toContain('received your message');
      expect(result).toContain('write newfile.ts');
    });

    it('should route run-style prompts to AI provider', async () => {
      const result = await processUserMessage('run npm install', 'tui');
      expect(result).toContain('received your message');
      expect(result).toContain('run npm install');
    });
  });

  describe('Source Parameter', () => {
    it('should accept telegram as source', async () => {
      const result = await processUserMessage('/status', 'telegram');
      expect(result).toBeTruthy();
      expect(result).toContain('*'); // Telegram uses Markdown
    });

    it('should accept tui as source', async () => {
      const result = await processUserMessage('/status', 'tui');
      expect(result).toBeTruthy();
      expect(result).not.toContain('*'); // TUI doesn't use Markdown
    });
  });
});
