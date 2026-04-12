import { describe, it, expect } from 'vitest';
import { handle } from '../../../src/agent/handler';

describe('Message Processor', () => {
  describe('Command Handling', () => {
    it('should handle /start command', async () => {
      const result = await handle('/start', 'tui');
      expect(result).toContain('Welcome');
    });

    it('should handle /help command', async () => {
      const result = await handle('/help', 'tui');
      expect(result).toContain('Available Commands:');
    });

    it('should handle /status command', async () => {
      const result = await handle('/status', 'telegram');
      expect(result).toContain('Status');
    });

    it('should return empty response for /exit in TUI', async () => {
      const result = await handle('/exit', 'tui');
      expect(result).toContain('Goodbye!');
    });

    it('should format commands differently for Telegram vs TUI', async () => {
      const tuiResult = await handle('/help', 'tui');
      const telegramResult = await handle('/help', 'telegram');
      
      // TUI uses ANSI colors, Telegram uses Markdown
      expect(tuiResult).not.toEqual(telegramResult);
      expect(telegramResult).toContain('*');
    });
  });

  describe('Non-command messages', () => {
    it('should route plain messages to AI provider', async () => {
      const result = await handle('Hello world', 'tui');
      expect(result).toContain('received your message');
    });

    it('should route former instruction-like messages to AI provider', async () => {
      const result = await handle('read package.json', 'tui');
      expect(result).toContain('received your message');
      expect(result).toContain('read package.json');
    });

    it('should handle unknown instructions', async () => {
      const result = await handle('Hello world', 'tui');
      expect(result).toContain('received your message');
    });
  });

  describe('Telegram message routing', () => {
    it('should keep user prompt content in provider response', async () => {
      const result = await handle('search for key-for-tests', 'telegram');
      expect(result).toContain('search for key-for-tests');
    });
  });

  describe('AI fallback behavior', () => {
    it('should route write-style prompts to AI provider', async () => {
      const result = await handle('write newfile.ts', 'tui');
      expect(result).toContain('received your message');
      expect(result).toContain('write newfile.ts');
    });

    it('should route run-style prompts to AI provider', async () => {
      const result = await handle('run npm install', 'tui');
      expect(result).toContain('received your message');
      expect(result).toContain('run npm install');
    });
  });

  describe('Source Parameter', () => {
    it('should accept telegram as source', async () => {
      const result = await handle('/status', 'telegram');
      expect(result).toBeTruthy();
      expect(result).toContain('*'); // Telegram uses Markdown
    });

    it('should accept tui as source', async () => {
      const result = await handle('/status', 'tui');
      expect(result).toBeTruthy();
      expect(result).not.toContain('*'); // TUI doesn't use Markdown
    });
  });
});
