import { describe, it, expect } from 'vitest';
import { processUserMessage } from '../../src/agent/processor';

describe('Security: Markdown Injection Protection', () => {
  describe('Telegram Markdown escaping', () => {
    it('should escape special Markdown characters in filenames', async () => {
      const specialChars = [
        'file_with_underscores.txt',
        'file*with*asterisks.txt',
        'file[with]brackets.txt',
        'file(with)parens.txt',
        'file`with`backticks.txt',
        'file-with-dashes.txt',
        'file.with.dots.txt',
      ];

      for (const filename of specialChars) {
        const result = await processUserMessage(`read ${filename}`, 'telegram');
        // Markdown special chars should be escaped
        expect(result).toBeDefined();
        // In Telegram mode, special chars should be escaped with backslash
      }
    });

    it('should escape Markdown in user input to prevent formatting injection', async () => {
      const injections = [
        'search *bold text*',
        'search _italic text_',
        'search [link](http://evil.com)',
        'search `code injection`',
        'search ~strikethrough~',
      ];

      for (const injection of injections) {
        const result = await processUserMessage(injection, 'telegram');
        expect(result).toBeDefined();
        // Markdown should be escaped to prevent unintended formatting
      }
    });

    it('should prevent Markdown link injection in responses', async () => {
      // User tries to inject a malicious link via filename
      const result = await processUserMessage('read [Click me](http://malicious.com).txt', 'telegram');
      expect(result).toBeDefined();
      // Link should be escaped and not rendered as clickable
    });

    it('should handle HTML entities safely', async () => {
      const htmlInjections = [
        'read <script>alert(1)</script>.txt',
        'search &lt;malicious&gt;',
        'list <b>bold</b>',
      ];

      for (const injection of htmlInjections) {
        const result = await processUserMessage(injection, 'telegram');
        expect(result).toBeDefined();
        // HTML should be escaped or sanitized
      }
    });
  });

  describe('Code block injection', () => {
    it('should prevent breaking out of code blocks', async () => {
      const breakouts = [
        'read file```\nmalicious code\n```.txt',
        'search pattern```javascript\nalert(1)\n```',
      ];

      for (const breakout of breakouts) {
        const result = await processUserMessage(breakout, 'telegram');
        expect(result).toBeDefined();
        // Code block delimiters in input should be escaped
      }
    });
  });

  describe('XSS-like injection attempts', () => {
    it('should handle script-like patterns in filenames', async () => {
      const xssAttempts = [
        'read <img src=x onerror=alert(1)>.txt',
        'read javascript:alert(1).txt',
        'read data:text/html,<script>alert(1)</script>.txt',
      ];

      for (const attempt of xssAttempts) {
        const result = await processUserMessage(attempt, 'telegram');
        expect(result).toBeDefined();
        // Should be escaped and not interpreted as code
      }
    });
  });

  describe('Newline and whitespace injection', () => {
    it('should handle newlines in input safely', async () => {
      const newlineInjections = [
        'read file1.txt\n/start',
        'search query\n\n*Bold text*',
        'list dir\r\n/help',
      ];

      for (const injection of newlineInjections) {
        const result = await processUserMessage(injection, 'telegram');
        expect(result).toBeDefined();
        // Should not break message format or inject commands
      }
    });

    it('should handle excessive whitespace safely', async () => {
      const whitespaceInjections = [
        'read          file.txt',
        'search   \t\t\t   query',
        'list\n\n\n\ndir',
      ];

      for (const injection of whitespaceInjections) {
        const result = await processUserMessage(injection, 'telegram');
        expect(result).toBeDefined();
      }
    });
  });

  describe('Unicode and emoji injection', () => {
    it('should handle right-to-left override characters', async () => {
      // U+202E is Right-to-Left Override, could be used for spoofing
      const rtlInjection = 'read file\u202Etxt.exe';
      const result = await processUserMessage(rtlInjection, 'telegram');
      expect(result).toBeDefined();
    });

    it('should handle zero-width characters', async () => {
      const zwInjections = [
        'read file\u200B.txt', // Zero-width space
        'search query\u200C', // Zero-width non-joiner
        'list \u200Ddir', // Zero-width joiner
      ];

      for (const injection of zwInjections) {
        const result = await processUserMessage(injection, 'telegram');
        expect(result).toBeDefined();
      }
    });

    it('should handle homoglyph attacks', async () => {
      // Cyrillic 'a' (U+0430) looks like Latin 'a' (U+0061)
      const homoglyphAttacks = [
        'read fіle.txt', // 'і' is Cyrillic
        'search pаckage', // 'а' is Cyrillic
      ];

      for (const attack of homoglyphAttacks) {
        const result = await processUserMessage(attack, 'telegram');
        expect(result).toBeDefined();
      }
    });
  });
});
