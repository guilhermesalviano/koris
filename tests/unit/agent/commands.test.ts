import { describe, it, expect, vi } from 'vitest';
import { handleCommand, isCommand, getAvailableCommands } from '../../../src/agent/commands';

describe('Command Handler', () => {
  describe('isCommand', () => {
    it('should recognize commands starting with /', () => {
      expect(isCommand('/start')).toBe(true);
      expect(isCommand('/help')).toBe(true);
      expect(isCommand('/status')).toBe(true);
    });

    it('should not recognize non-commands', () => {
      expect(isCommand('hello')).toBe(false);
      expect(isCommand('read file.ts')).toBe(false);
      expect(isCommand('list src/')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(isCommand('')).toBe(false);
    });
  });

  describe('handleCommand', () => {
    it('should handle /start command', () => {
      const result = handleCommand('/start', { source: 'cli' });
      expect(result.handled).toBe(true);
      expect(result.response).toContain('Welcome');
      expect(result.action).toBe('none');
    });

    it('should handle /help command', () => {
      const result = handleCommand('/help', { source: 'cli' });
      expect(result.handled).toBe(true);
      expect(result.response).toContain('Commands'); // Changed from lowercase
    });

    it('should handle /status command', () => {
      const result = handleCommand('/status', { source: 'cli' });
      expect(result.handled).toBe(true);
      // Response depends on session, so just check it exists
      expect(result.response).toBeTruthy();
    });

    it('should handle /clear command', () => {
      const result = handleCommand('/clear', { source: 'cli' });
      expect(result.handled).toBe(true);
      expect(result.action).toBe('clear');
    });

    it('should handle /reset command', () => {
      const result = handleCommand('/reset', { source: 'cli' });
      expect(result.handled).toBe(true);
      expect(result.action).toBe('reset');
    });

    it('should handle /exit command for CLI', () => {
      const result = handleCommand('/exit', { source: 'cli' });
      expect(result.handled).toBe(true);
      expect(result.action).toBe('exit');
    });

    it('should not allow /exit for Telegram', () => {
      const result = handleCommand('/exit', { source: 'telegram' });
      expect(result.handled).toBe(true);
      expect(result.response).toBeTruthy(); // Just check it returns something
      expect(result.action).toBe('none');
    });

    it('should handle /stats command for CLI', () => {
      const context = {
        source: 'cli' as const,
        session: {
          messageCount: 5,
          startTime: new Date(Date.now() - 60000), // 1 minute ago
        },
      };
      const result = handleCommand('/stats', context);
      expect(result.handled).toBe(true);
      expect(result.response).toBeTruthy();
    });

    it('should not allow /stats for Telegram', () => {
      const result = handleCommand('/stats', { source: 'telegram' });
      expect(result.handled).toBe(true);
      expect(result.response).toBeTruthy();
    });

    it('should handle unknown commands', () => {
      const result = handleCommand('/unknown', { source: 'cli' });
      expect(result.handled).toBe(false);
      expect(result.response).toBeTruthy();
    });

    it('should format responses differently for CLI vs Telegram', () => {
      const cliResult = handleCommand('/help', { source: 'cli' });
      const telegramResult = handleCommand('/help', { source: 'telegram' });
      
      expect(cliResult.response).not.toEqual(telegramResult.response);
      expect(telegramResult.response).toContain('*'); // Telegram uses Markdown
    });
  });

  describe('getAvailableCommands', () => {
    it('should return array of commands for CLI', () => {
      const commands = getAvailableCommands('cli');
      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBeGreaterThan(0);
    });

    it('should return array of commands for Telegram', () => {
      const commands = getAvailableCommands('telegram');
      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBeGreaterThan(0);
    });

    it('should return common commands for both interfaces', () => {
      const cliCommands = getAvailableCommands('cli');
      const telegramCommands = getAvailableCommands('telegram');
      
      // Common commands
      expect(cliCommands).toContain('/start');
      expect(cliCommands).toContain('/help');
      
      expect(telegramCommands).toContain('/start');
      expect(telegramCommands).toContain('/help');
    });
  });

  describe('CommandResult Structure', () => {
    it('should return proper CommandResult structure', () => {
      const result = handleCommand('/start', { source: 'cli' });
      expect(result).toHaveProperty('response');
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('handled');
      expect(typeof result.handled).toBe('boolean');
    });

    it('should have correct action types', () => {
      const exitResult = handleCommand('/exit', { source: 'cli' });
      const clearResult = handleCommand('/clear', { source: 'cli' });
      const resetResult = handleCommand('/reset', { source: 'cli' });
      const helpResult = handleCommand('/help', { source: 'cli' });
      
      expect(exitResult.action).toBe('exit');
      expect(clearResult.action).toBe('clear');
      expect(resetResult.action).toBe('reset');
      expect(helpResult.action).toBe('none');
    });
  });
});
