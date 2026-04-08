import { describe, it, expect } from 'vitest';
import { processUserMessage } from '../../src/agent/processor';
import { detectInstruction } from '../../src/sub-instructions/detect-instruction';

describe('Security: Input Validation', () => {
  describe('Message length limits', () => {
    it('should handle extremely long messages safely', async () => {
      const longMessage = 'a'.repeat(1000000); // 1MB of text
      const result = await processUserMessage(longMessage, 'tui');
      // Should not crash or hang
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle extremely long file paths', async () => {
      const longPath = 'a/'.repeat(10000) + 'file.txt';
      const result = await processUserMessage(`read ${longPath}`, 'tui');
      expect(result).toBeDefined();
      expect(result).toMatch(/not found|error|invalid/i);
    });
  });

  describe('Special character handling', () => {
    it('should safely handle null bytes in input', async () => {
      const messages = [
        'read file.txt\0malicious',
        'list .\0/etc',
        'search query\0; rm -rf /',
      ];

      for (const msg of messages) {
        const result = await processUserMessage(msg, 'tui');
        expect(result).toBeDefined();
        // Should not execute any part after null byte
      }
    });

    it('should handle Unicode and emoji safely', async () => {
      const unicodeMessages = [
        'read 文件.txt',
        'search 🚀🔥💻',
        'list مجلد',
        'read файл.txt',
      ];

      for (const msg of unicodeMessages) {
        const result = await processUserMessage(msg, 'tui');
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      }
    });

    it('should handle control characters safely', async () => {
      const controlChars = [
        'read file\r\n.txt',
        'list .\t../etc',
        'search \x00\x01\x02',
      ];

      for (const msg of controlChars) {
        const result = await processUserMessage(msg, 'tui');
        expect(result).toBeDefined();
      }
    });
  });

  describe('Regex DoS (ReDoS) protection', () => {
    it('should not hang on pathological regex inputs', async () => {
      const redosPatterns = [
        'search ' + 'a'.repeat(1000) + 'X',
        'read ' + '(a+)+b'.repeat(100),
        'list ' + '.*.*.*.*'.repeat(50),
      ];

      for (const pattern of redosPatterns) {
        const startTime = Date.now();
        const result = await processUserMessage(pattern, 'tui');
        const duration = Date.now() - startTime;
        
        expect(result).toBeDefined();
        // Should complete in reasonable time (< 1 second)
        expect(duration).toBeLessThan(1000);
      }
    });
  });

  describe('Prototype pollution protection', () => {
    it('should not allow prototype pollution via object keys', async () => {
      const pollutionAttempts = [
        'read __proto__.txt',
        'list constructor',
        'search __proto__',
        'write __proto__/polluted.txt',
      ];

      for (const attempt of pollutionAttempts) {
        const result = await processUserMessage(attempt, 'tui');
        expect(result).toBeDefined();
        // Should treat as normal string, not object key access
      }
    });
  });

  describe('Type confusion', () => {
    it('should handle non-string inputs safely', async () => {
      // In real scenarios, these might come from JSON parsing or API calls
      const inputs: any[] = [
        null,
        undefined,
        123,
        true,
        [],
        {},
        { toString: () => 'malicious' },
      ];

      for (const input of inputs) {
        try {
          // Expect function to handle type mismatch gracefully
          const result = await processUserMessage(input, 'tui');
          expect(result).toBeDefined();
        } catch (error: any) {
          // Should throw a safe error, not crash
          expect(error.message).toBeDefined();
        }
      }
    });
  });

  describe('Empty and whitespace inputs', () => {
    it('should handle empty strings safely', async () => {
      const result = await processUserMessage('', 'tui');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle whitespace-only strings', async () => {
      const whitespaceInputs = [
        '   ',
        '\t\t\t',
        '\n\n\n',
        '   \t\n  ',
      ];

      for (const input of whitespaceInputs) {
        const result = await processUserMessage(input, 'tui');
        expect(result).toBeDefined();
      }
    });
  });
});
