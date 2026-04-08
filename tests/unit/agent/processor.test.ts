import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processUserMessage } from '../../../src/agent/processor';

describe('Message Processor', () => {
  describe('Command Handling', () => {
    it('should handle /start command', async () => {
      const result = await processUserMessage('/start', 'cli');
      expect(result).toContain('Welcome');
    });

    it('should handle /help command', async () => {
      const result = await processUserMessage('/help', 'cli');
      expect(result).toContain('Available Commands:');
    });

    it('should handle /status command', async () => {
      const result = await processUserMessage('/status', 'telegram');
      expect(result).toContain('Status');
    });

    it('should return empty response for /exit in CLI', async () => {
      const result = await processUserMessage('/exit', 'cli');
      expect(result).toContain('Goodbye!');
    });

    it('should format commands differently for Telegram vs CLI', async () => {
      const cliResult = await processUserMessage('/help', 'cli');
      const telegramResult = await processUserMessage('/help', 'telegram');
      
      // CLI uses ANSI colors, Telegram uses Markdown
      expect(cliResult).not.toEqual(telegramResult);
      expect(telegramResult).toContain('*');
    });
  });

  describe('Instruction Detection', () => {
    it('should detect read_file instruction', async () => {
      const result = await processUserMessage('read package.json', 'cli');
      expect(result).toContain('package.json');
    });

    it('should detect list_dir instruction', async () => {
      const result = await processUserMessage('list src/', 'cli');
      expect(result).toContain('Directory');
    });

    it('should detect list_dir for current directory', async () => {
      const result = await processUserMessage('list .', 'cli');
      expect(result).toContain('Directory');
    });

    it('should detect write_file instruction', async () => {
      const result = await processUserMessage('write test.txt', 'cli');
      expect(result).toContain('create/update file');
    });

    it('should detect execute_command instruction', async () => {
      const result = await processUserMessage('run npm test', 'cli');
      expect(result).toContain('execute command');
    });

    it('should detect search instruction', async () => {
      const result = await processUserMessage('search for config', 'cli');
      expect(result).toContain('Searching');
    });

    it('should handle unknown instructions', async () => {
      const result = await processUserMessage('Hello world', 'cli');
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
      const result = await processUserMessage('write newfile.ts', 'cli');
      expect(result).toContain('mock response');
      expect(result).toContain('approval');
    });

    it('should return mock response for execute_command', async () => {
      const result = await processUserMessage('run npm install', 'cli');
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

    it('should accept cli as source', async () => {
      const result = await processUserMessage('/status', 'cli');
      expect(result).toBeTruthy();
      expect(result).not.toContain('*'); // CLI doesn't use Markdown
    });
  });
});
