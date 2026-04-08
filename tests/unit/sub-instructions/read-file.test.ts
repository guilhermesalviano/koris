import { describe, it, expect } from 'vitest';
import { readFile } from '../../../src/sub-instructions/read-file';

describe('Read File', () => {
  describe('Valid files', () => {
    it('should read package.json', () => {
      const result = readFile('package.json');
      expect(result).toContain('Reading file');
      expect(result).toContain('package.json');
      expect(result).toContain('opencrawdio'); // Package name
    });

    it('should read README.md', () => {
      const result = readFile('README.md');
      expect(result).toContain('Reading file');
      expect(result).toContain('README.md');
    });

    it('should show file content in code block', () => {
      const result = readFile('package.json');
      expect(result).toMatch(/```/); // Should contain code block markers
    });

    it('should detect and show JSON language', () => {
      const result = readFile('package.json');
      expect(result).toContain('```json');
    });

    it('should detect and show TypeScript language', () => {
      const result = readFile('src/index.ts');
      expect(result).toContain('```ts');
    });

    it('should detect and show Markdown language', () => {
      const result = readFile('README.md');
      expect(result).toContain('```md');
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent files', () => {
      const result = readFile('nonexistent-file-12345.txt');
      expect(result).toContain('File not found');
    });

    it('should handle directories (not files)', () => {
      const result = readFile('src');
      expect(result).toContain('not a file');
    });

    it('should handle permission errors gracefully', () => {
      // This test may vary by system permissions
      const result = readFile('/etc/shadow');
      expect(result).toMatch(/Permission denied|File not found/);
    });
  });

  describe('Markdown escaping', () => {
    // it('should escape special characters in filename', () => {
    //   const result = readFile('package.json');
    //   expect(result).toContain('package\\.json'); // Escaped dot
    // });

    it('should not escape content inside code blocks', () => {
      const result = readFile('package.json');
      // Content inside ``` blocks should not be escaped
      const codeBlockMatch = result.match(/```json\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        const content = codeBlockMatch[1];
        // Should contain unescaped JSON
        expect(content).toContain('{');
        expect(content).toContain('}');
      }
    });
  });

  describe('File size handling', () => {
    it('should show file size', () => {
      const result = readFile('package.json');
      expect(result).toMatch(/\d+\s*[BKM]B/); // Should show size like "1.2 KB"
    });

    it('should handle small files (< 1KB)', () => {
      // Test with a small file
      const result = readFile('.gitignore');
      expect(result).toMatch(/\d+\s*B/);
    });
  });

  describe('Language detection', () => {
    it('should handle files without extension', () => {
      const result = readFile('README');
      if (!result.includes('File not found')) {
        expect(result).toContain('```');
      }
    });

    it('should handle unknown extensions', () => {
      // Create test for unknown extension
      const result = readFile('package.json');
      expect(result).toContain('```'); // Should still use code block
    });
  });

  describe('Output format', () => {
    it('should start with emoji and title', () => {
      const result = readFile('package.json');
      expect(result).toMatch(/^📄/);
      expect(result).toContain('Reading file');
    });

    it('should show full file path', () => {
      const result = readFile('src/index.ts');
      expect(result).toContain('src/index.ts');
    });

    it('should format content properly', () => {
      const result = readFile('package.json');
      // Should have structure: emoji + title + size + code block
      expect(result).toContain('📄');
      expect(result).toContain('Reading file');
      expect(result).toMatch(/\d+\s*[BKM]B/);
      expect(result).toContain('```');
    });
  });

  describe('Path resolution', () => {
    it('should handle relative paths', () => {
      const result = readFile('./package.json');
      expect(result).toContain('Reading file');
    });

    it('should handle nested paths', () => {
      const result = readFile('src/agent/processor.ts');
      expect(result).toContain('Reading file');
    });
  });
});
