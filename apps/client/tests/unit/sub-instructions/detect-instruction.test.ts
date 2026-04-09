import { describe, it, expect } from 'vitest';
import { detectInstruction } from '../../../src/sub-instructions/detect-instruction';

describe('Instruction Detection', () => {
  describe('read_file detection', () => {
    it('should detect "read" keyword', () => {
      const result = detectInstruction('read package.json');
      expect(result?.type).toBe('read_file');
      expect(result?.params).toBe('package.json');
    });

    it('should detect "show" keyword', () => {
      const result = detectInstruction('show me src/index.ts');
      expect(result?.type).toBe('read_file');
      expect(result?.params).toBe('src/index.ts');
    });

    it('should detect "cat" keyword', () => {
      const result = detectInstruction('cat README.md');
      expect(result?.type).toBe('read_file');
      expect(result?.params).toBe('README.md');
    });

    it('should handle quoted filenames', () => {
      const result = detectInstruction('read "my file.txt"');
      expect(result?.type).toBe('read_file');
    });

    it('should be case insensitive', () => {
      const result = detectInstruction('READ package.json');
      expect(result?.type).toBe('read_file');
    });
  });

  describe('write_file detection', () => {
    it('should detect "write" keyword', () => {
      const result = detectInstruction('write test.txt');
      expect(result?.type).toBe('write_file');
      expect(result?.params).toBe('test.txt');
    });

    it('should detect "create file" phrase', () => {
      const result = detectInstruction('create file config.json');
      expect(result?.type).toBe('write_file');
      expect(result?.params).toBe('config.json');
    });

    it('should detect "save" keyword', () => {
      const result = detectInstruction('save output.log');
      expect(result?.type).toBe('write_file');
      expect(result?.params).toBe('output.log');
    });
  });

  describe('list_dir detection', () => {
    it('should detect "list" keyword', () => {
      const result = detectInstruction('list src/');
      expect(result?.type).toBe('list_dir');
      expect(result?.params).toBe('src/');
    });

    it('should detect "ls" keyword', () => {
      const result = detectInstruction('ls .');
      expect(result?.type).toBe('list_dir');
      expect(result?.params).toBe('.');
    });

    it('should detect "directory" keyword', () => {
      const result = detectInstruction('show directory dist');
      expect(result?.type).toBe('list_dir');
      expect(result?.params).toBe('dist');
    });

    it('should handle current directory', () => {
      const result = detectInstruction('list .');
      expect(result?.type).toBe('list_dir');
      expect(result?.params).toBe('.');
    });
  });

  describe('execute_command detection', () => {
    it('should detect "run" keyword', () => {
      const result = detectInstruction('run npm install');
      expect(result?.type).toBe('execute_command');
      expect(result?.params).toBe('npm install');
    });

    it('should detect "execute" keyword', () => {
      const result = detectInstruction('execute npm test');
      expect(result?.type).toBe('execute_command');
      expect(result?.params).toBe('npm test');
    });

    it('should detect "execute command" phrase', () => {
      const result = detectInstruction('execute command git status');
      expect(result?.type).toBe('execute_command');
      expect(result?.params).toBe('git status');
    });

    it('should handle complex commands', () => {
      const result = detectInstruction('run npm run build && npm test');
      expect(result?.type).toBe('execute_command');
      expect(result?.params).toContain('npm run build');
    });
  });

  describe('search detection', () => {
    it('should detect "search" keyword', () => {
      const result = detectInstruction('search for config');
      expect(result?.type).toBe('search');
      expect(result?.params).toBe('config');
    });

    it('should detect "find" keyword', () => {
      const result = detectInstruction('find authentication');
      expect(result?.type).toBe('search');
      expect(result?.params).toBe('authentication');
    });

    it('should handle "search for" phrase', () => {
      const result = detectInstruction('search for database connection');
      expect(result?.type).toBe('search');
      expect(result?.params).toBe('database connection');
    });
  });

  describe('unknown instructions', () => {
    it('should return null for unrecognized patterns', () => {
      const result = detectInstruction('hello world');
      expect(result).toBeNull();
    });

    it('should return null for empty strings', () => {
      const result = detectInstruction('');
      expect(result).toBeNull();
    });

    it('should return null for commands (starting with /)', () => {
      const result = detectInstruction('/help');
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle multiple spaces', () => {
      const result = detectInstruction('read    package.json');
      expect(result?.type).toBe('read_file');
    });

    it('should handle paths with spaces', () => {
      const result = detectInstruction('list my folder/subfolder');
      expect(result?.type).toBe('list_dir');
    });

    it('should handle special characters in filenames', () => {
      const result = detectInstruction('read test_file-v2.0.json');
      expect(result?.type).toBe('read_file');
      expect(result?.params).toContain('test_file-v2.0.json');
    });
  });
});
