import { describe, it, expect } from 'vitest';
import { readFile } from '../../src/sub-instructions/read-file';
import { listDirectory } from '../../src/sub-instructions/list-directory';

describe('Security: Path Traversal Protection', () => {
  describe('readFile', () => {
    it('should not allow reading files outside project directory with ../', () => {
      const result = readFile('../../../etc/passwd');
      // Should either deny access or fail safely
      expect(result).toMatch(/not found|permission denied|error/i);
    });

    it('should not allow reading files with absolute paths to sensitive locations', () => {
      const result = readFile('/etc/passwd');
      // Should either deny access or fail safely
      expect(result).toMatch(/not found|permission denied|error/i);
    });

    it('should not allow reading files with encoded path traversal', () => {
      const result = readFile('..%2F..%2F..%2Fetc%2Fpasswd');
      // Should either deny access or fail safely
      expect(result).toMatch(/not found|permission denied|error/i);
    });

    it('should not allow reading files with null bytes', () => {
      const result = readFile('package.json\0.txt');
      // Should fail safely
      expect(result).toMatch(/not found|error/i);
    });

    it('should safely handle symbolic link traversal attempts', () => {
      // If symlinks exist that point outside the project
      const result = readFile('../../suspicious-link');
      expect(result).toMatch(/not found|permission denied|error/i);
    });
  });

  describe('listDirectory', () => {
    it('should not allow listing directories outside project with ../', () => {
      const result = listDirectory('../../../etc');
      // Should either deny access or fail safely
      expect(result).toMatch(/not found|permission denied|error/i);
    });

    it('should not allow listing absolute paths to sensitive locations', () => {
      const result = listDirectory('/etc');
      // Should either deny access or fail safely
      expect(result).toMatch(/not found|permission denied|error/i);
    });

    it('should not allow directory listing with encoded traversal', () => {
      const result = listDirectory('..%2F..%2Fetc');
      expect(result).toMatch(/not found|permission denied|error/i);
    });

    it('should safely handle symbolic link directory traversal', () => {
      const result = listDirectory('../../root');
      expect(result).toMatch(/not found|permission denied|error/i);
    });
  });

  describe('Path normalization', () => {
    it('should normalize paths before validation', () => {
      // Test that paths are normalized to prevent bypasses
      const result = readFile('./src/../../../etc/passwd');
      expect(result).toMatch(/not found|permission denied|error/i);
    });

    it('should handle multiple slashes correctly', () => {
      const result = readFile('src////config///../../../etc/passwd');
      expect(result).toMatch(/not found|permission denied|error/i);
    });

    it('should reject Windows-style absolute paths on Unix', () => {
      const result = readFile('C:\\Windows\\System32\\config\\SAM');
      expect(result).toMatch(/not found|error/i);
    });
  });
});
