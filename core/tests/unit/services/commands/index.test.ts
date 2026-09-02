import { describe, it, expect } from 'vitest';
import { getAvailableCommands, handleCommand, isCommand } from '../../../../src/services/commands';

describe('Command Handler', () => {
  describe('isCommand', () => {
    it('recognizes known commands and their aliases', () => {
      expect(isCommand('/help')).toBe(true);
      expect(isCommand('/status')).toBe(true);
      expect(isCommand('/reset')).toBe(true); // alias of /clear
      expect(isCommand('/USAGE 7')).toBe(true); // case- and arg-insensitive
    });

    it('does not recognize an unknown slash message — it flows to the agent', () => {
      expect(isCommand('/shrug')).toBe(false);
      expect(isCommand('/path/to/file.ts')).toBe(false);
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
    it('should handle /help command', () => {
      const result = handleCommand('/help', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.response).toBeTruthy();
    });

    it('should handle /status command', () => {
      const result = handleCommand('/status', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.response).toBeTruthy();
    });

    it('should handle /clear command', () => {
      const result = handleCommand('/clear', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.action).toBe('clear');
    });

    it('treats /reset as an alias of /clear', () => {
      const result = handleCommand('/reset', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.action).toBe('clear');
    });

    it('handles /whoami with the sender access level', () => {
      const trusted = handleCommand('/whoami', { source: 'tui', trusted: true, originId: 'user-9' });
      expect(trusted.handled).toBe(true);
      expect(trusted.response).toContain('trusted');
      expect(trusted.response).toContain('user-9');

      const standard = handleCommand('/whoami', { source: 'telegram', trusted: false });
      expect(standard.response?.toLowerCase()).toContain('standard');
    });

    it('handles /memory by delegating to the gateway via a memory action', () => {
      const result = handleCommand('/memory', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.action).toBe('memory');
    });

    it('gives per-command detail for /help <command>', () => {
      const result = handleCommand('/help compact', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.response).toContain('/compact');
      expect(result.response).toContain('summary');
    });

    it('reports an unknown argument to /help', () => {
      const result = handleCommand('/help nope', { source: 'tui' });
      expect(result.response).toContain('Unknown command: nope');
    });

    it('should handle /compact command', () => {
      const result = handleCommand('/compact', { source: 'tui' });
      expect(result.handled).toBe(true);
      expect(result.action).toBe('compact');
      expect(result.response).toBeTruthy();
    });

    it('refuses /allow for untrusted senders', () => {
      const result = handleCommand('/allow example.com', { source: 'tui', trusted: false });
      expect(result.handled).toBe(true);
      expect(result.response?.toLowerCase()).toContain('trusted');
    });

    it('shows /allow usage when trusted but no domain is given', () => {
      const result = handleCommand('/allow', { source: 'tui', trusted: true });
      expect(result.handled).toBe(true);
      expect(result.response).toContain('Usage: /allow');
    });

    it('answers /exit with guidance rather than a fake exit action', () => {
      const tui = handleCommand('/exit', { source: 'tui' });
      expect(tui.handled).toBe(true);
      expect(tui.action).toBe('none');
      expect(tui.response).toContain('Ctrl+C');

      const telegram = handleCommand('/exit', { source: 'telegram' });
      expect(telegram.action).toBe('none');
      expect(telegram.response).toBeTruthy();
    });

    it('should handle unknown commands', () => {
      const result = handleCommand('/unknown', { source: 'tui' });
      expect(result.handled).toBe(false);
      expect(result.response).toBeTruthy();
    });

    it('should format responses differently for TUI vs Telegram', () => {
      const tuiResult = handleCommand('/help', { source: 'tui' });
      const telegramResult = handleCommand('/help', { source: 'telegram' });

      expect(tuiResult.response).toBeTruthy();
      expect(telegramResult.response).toBeTruthy();
    });

    // Characterizes the `source === 'telegram'` branching called out in
    // FINDINGS.md §2.8: today Telegram alone gets Markdown-styled command
    // output, and every other channel (whatsapp, tui, web) gets the same
    // copy with `*` stripped. Locking in the exact split before Phase 2's
    // `ChannelCapabilities.markdown` replaces this identity check.
    it('keeps literal * markdown markers only for telegram', () => {
      const telegramHelp = handleCommand('/help', { source: 'telegram' });
      const whatsappHelp = handleCommand('/help', { source: 'whatsapp' });
      const tuiHelp = handleCommand('/help', { source: 'tui' });

      expect(telegramHelp.response).toContain('*Available Commands:*');
      expect(whatsappHelp.response).not.toContain('*');
      expect(tuiHelp.response).not.toContain('*');
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

    it('shares the core commands across interfaces', () => {
      const tuiCommands = getAvailableCommands('tui');
      const telegramCommands = getAvailableCommands('telegram');

      for (const cmd of ['/help', '/compact', '/clear', '/usage']) {
        expect(tuiCommands).toContain(cmd);
        expect(telegramCommands).toContain(cmd);
      }
    });

    it('scopes channel-specific commands to their channel', () => {
      expect(getAvailableCommands('tui')).toContain('/exit');
      expect(getAvailableCommands('telegram')).not.toContain('/exit');
    });

    it('includes aliases so completion resolves them', () => {
      expect(getAvailableCommands('tui')).toContain('/reset');
    });
  });

  describe('CommandResult Structure', () => {
    it('should return proper CommandResult structure', () => {
      const result = handleCommand('/help', { source: 'tui' });
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

      expect(exitResult.action).toBe('none');
      expect(clearResult.action).toBe('clear');
      expect(resetResult.action).toBe('clear');
      expect(helpResult.action).toBe('none');
    });
  });
});
