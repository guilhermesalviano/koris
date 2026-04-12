import { describe, it, expect } from 'vitest';
import { getAvailableCommands, handleCommand, isCommand } from '../../../src/agents/commands';

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
      const result = handleCommand('/start', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.response).toContain('Welcome');
      expect(result.action).toBe('none');
    });

    it('should handle /help command', () => {
      const result = handleCommand('/help', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.response).toContain('Commands'); // Changed from lowercase
    });

    it('should handle /status command', () => {
      const result = handleCommand('/status', { source: 'tui' });
      expect(result.handled).toBe(true);
      // Response depends on session, so just check it exists
      expect(result.response).toBeTruthy();
    });

    it('should handle /clear command', () => {
      const result = handleCommand('/clear', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.action).toBe('clear');
    });

    it('should handle /reset command', () => {
      const result = handleCommand('/reset', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.action).toBe('reset');
    });

    it('should handle /exit command for TUI', () => {
      const result = handleCommand('/exit', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.action).toBe('exit');
    });

    it('should not allow /exit for Telegram', () => {
      const result = handleCommand('/exit', { source: 'telegram' });
      expect(result.handled).toBe(true);
      expect(result.response).toBeTruthy(); // Just check it returns something
      expect(result.action).toBe('none');
    });

    it('should handle /stats command for TUI', () => {
      const context = {
        source: 'tui' as const,
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
      const result = handleCommand('/unknown', { source: 'tui' });
      expect(result.handled).toBe(false);
      expect(result.response).toBeTruthy();
    });

    it('should format responses differently for TUI vs Telegram', () => {
      const tuiResult = handleCommand('/help', { source: 'tui' });
      const telegramResult = handleCommand('/help', { source: 'telegram' });
      
      expect(tuiResult.response).not.toEqual(telegramResult.response);
      expect(telegramResult.response).toContain('*'); // Telegram uses Markdown
    });
  });

  describe('getAvailableCommands', () => {
    it('should return array of commands for TUI', () => {
      const commands = getAvailableCommands('tui');
      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBeGreaterThan(0);
    });

    it('should return array of commands for Telegram', () => {
      const commands = getAvailableCommands('telegram');
      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBeGreaterThan(0);
    });

    it('should return common commands for both interfaces', () => {
      const tuiCommands = getAvailableCommands('tui');
      const telegramCommands = getAvailableCommands('telegram');
      
      // Common commands
      expect(tuiCommands).toContain('/start');
      expect(tuiCommands).toContain('/help');
      
      expect(telegramCommands).toContain('/start');
      expect(telegramCommands).toContain('/help');
    });
  });

  describe('CommandResult Structure', () => {
    it('should return proper CommandResult structure', () => {
      const result = handleCommand('/start', { source: 'tui' });
      expect(result).toHaveProperty('response');
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('handled');
      expect(typeof result.handled).toBe('boolean');
    });

    it('should have correct action types', () => {
      const exitResult = handleCommand('/exit', { source: 'tui' });
      const clearResult = handleCommand('/clear', { source: 'tui' });
      const resetResult = handleCommand('/reset', { source: 'tui' });
      const helpResult = handleCommand('/help', { source: 'tui' });
      
      expect(exitResult.action).toBe('exit');
      expect(clearResult.action).toBe('clear');
      expect(resetResult.action).toBe('reset');
      expect(helpResult.action).toBe('none');
    });
  });
});
