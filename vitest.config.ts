import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./core/tests/setup/vitest.setup.ts'],
    // build-resources/** and dist-desktop-out/** hold the staged server tree
    // (pnpm desktop:stage / desktop:package) — deps like Next ship their own
    // *.test.js which vitest would otherwise try to run.
    exclude: [
      '.stryker-tmp/**',
      '**/node_modules/**',
      'koris-hub/**',
      'build-resources/**',
      'dist-desktop-out/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.config.ts',
      ],
    },
    onConsoleLog(log: string, type: 'stdout' | 'stderr'): boolean | void {
      return false;  // NO console.log() statements will be printed!
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './core/src'),
    },
  },
});
