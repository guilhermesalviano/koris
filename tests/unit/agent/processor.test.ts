import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  describe('Instruction Detection', () => {
    it('should detect read_file instruction', async () => {
      const result = await processUserMessage('read package.json', 'tui');
      expect(result).toContain('package.json');
    });

    it('should detect list_dir instruction', async () => {
      const result = await processUserMessage('list src/', 'tui');
      expect(result).toContain('Directory');
    });

    it('should detect list_dir for current directory', async () => {
      const result = await processUserMessage('list .', 'tui');
      expect(result).toContain('Directory');
    });

    it('should detect write_file instruction', async () => {
      const result = await processUserMessage('write test.txt', 'tui');
      expect(result).toContain('create/update file');
    });

    it('should detect execute_command instruction', async () => {
      const result = await processUserMessage('run npm test', 'tui');
      expect(result).toContain('execute command');
    });

    it('should detect search instruction', async () => {
      const result = await processUserMessage('search for config', 'tui');
      expect(result).toContain('Searching');
    });

    it('should handle unknown instructions', async () => {
      const result = await processUserMessage('Hello world', 'tui');
      expect(result).toContain('received your message');
    });
  });

  describe('Markdown Escaping for Telegram', () => {
    // todo: check if needed later.
    // it('should escape special characters in file operations', async () => {
    //   const result = await processUserMessage('read test_file.json', 'telegram');
    //   // Should contain escaped underscores or dots
    //   expect(result).toMatch(/\\[_\\.]/);
    // });

    it('should escape periods in directory listing', async () => {
      const result = await processUserMessage('list .', 'telegram');
      // Should escape dots and other special chars
      expect(result).toMatch(/\\\./);
    });

    it('should escape special characters in search results', async () => {
      const result = await processUserMessage('search for key-for-tests', 'telegram');
      // Should escape hyphens
      expect(result).toMatch(/\\-/);
    });
  });

  describe('Mock Responses', () => {
    it('should return mock response for write_file', async () => {
      const result = await processUserMessage('write newfile.ts', 'tui');
      expect(result).toContain('mock response');
      expect(result).toContain('approval');
    });

    it('should return mock response for execute_command', async () => {
      const result = await processUserMessage('run npm install', 'tui');
      expect(result).toContain('mock response');
      expect(result).toContain('approval');
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
