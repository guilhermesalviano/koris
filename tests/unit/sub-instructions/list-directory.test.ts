import { describe, it, expect } from 'vitest';
import { listDirectory } from '../../../src/sub-instructions/list-directory';
import * as path from 'path';

describe('List Directory', () => {
  describe('Current directory', () => {
    it('should list current directory with "."', () => {
      const result = listDirectory('.');
      expect(result).toContain('Directory listing');
      expect(result).toContain(process.cwd());
    });

    it('should list current directory with empty string', () => {
      const result = listDirectory('');
      expect(result).toContain('Directory listing');
      expect(result).toContain(process.cwd());
    });
  });

  describe('Valid directories', () => {
    it('should list src directory', () => {
      const result = listDirectory('src');
      expect(result).toContain('Directory listing');
      expect(result).toMatch(/📁|📄/); // Should contain file or folder emojis
    });

    it('should show files with sizes', () => {
      const result = listDirectory('.github');
      if (!result.includes('Empty directory')) {
        expect(result).toMatch(/\d+\s*[BKM]B/); // Should contain size info
      }
    });

    it('should distinguish folders from files', () => {
      const result = listDirectory('.');
      if (!result.includes('Empty directory')) {
        expect(result).toContain('📁'); // Folder emoji
        expect(result).toContain('📄'); // File emoji
      }
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent paths', () => {
      const result = listDirectory('nonexistent-directory-12345');
      expect(result).toContain('Path not found');
    });

    it('should handle files (not directories)', () => {
      const result = listDirectory('package.json');
      expect(result).toContain('Not a directory');
    });

    it('should handle permission errors gracefully', () => {
      // This test may vary by system permissions
      const result = listDirectory('/root');
      expect(result).toMatch(/Permission denied|Directory listing|Path not found/);
    });
  });

  describe('Markdown escaping', () => {
    it('should escape special characters in paths', () => {
      const result = listDirectory('.');
      // Check that dots and other special chars are escaped for Telegram
      if (result.includes('Directory listing')) {
        expect(result).toMatch(/\\\./); // Escaped dots
      }
    });

    it('should escape special characters in filenames', () => {
      const result = listDirectory('.');
      // If there are files with special chars, they should be escaped
      // At minimum, the path itself should be escaped
      expect(result).toMatch(/\\\./);
    });
  });

  describe('Path resolution', () => {
    it('should resolve relative paths', () => {
      const result = listDirectory('./src');
      expect(result).toContain('Directory listing');
    });

    it('should handle absolute paths', () => {
      const absolutePath = path.resolve('.');
      const result = listDirectory(absolutePath);
      expect(result).toContain('Directory listing');
      expect(result).toContain(absolutePath);
    });

    // working with just the current directory for now
    // it('should handle parent directory reference', () => {
    //   const result = listDirectory('..');
    //   expect(result).toContain('Directory listing');
    // });
  });

  describe('Empty directories', () => {
    it('should handle empty directory message', () => {
      // We can't guarantee an empty directory exists, so we test the format
      const result = listDirectory('.');
      expect(result).toMatch(/Directory listing|Empty directory/);
    });
  });

  describe('Output format', () => {
    it('should start with emoji and title', () => {
      const result = listDirectory('.');
      expect(result).toMatch(/^📁/);
      expect(result).toContain('Directory listing');
    });

    it('should separate folders and files', () => {
      const result = listDirectory('.');
      if (!result.includes('Empty directory')) {
        // Folders should come before files in the output
        const folderIndex = result.indexOf('📁');
        const fileIndex = result.indexOf('📄');
        if (folderIndex !== -1 && fileIndex !== -1) {
          expect(folderIndex).toBeLessThan(fileIndex);
        }
      }
    });

    it('should show folder names with trailing slash', () => {
      const result = listDirectory('.');
      if (result.includes('📁') && !result.includes('Empty directory')) {
        // Folder names should end with /
        const folderLine = result.split('\n').find(line => line.includes('📁'));
        if (folderLine) {
          expect(folderLine).toMatch(/\//);
        }
      }
    });
  });
});
