import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach } from 'vitest';
import { config } from '../../src/config';
import { applyTestConfigDefaults } from '../helpers/test-config';

// Anything a test doesn't mock that falls back to the default data root — the
// SQLite database (`memory/database.db`), `logs/` — lands in a throwaway
// directory instead of the developer's real app data.
const testDataDir = mkdtempSync(join(tmpdir(), 'koris-test-data-'));
Object.defineProperty(config, 'DATA_DIR', { value: testDataDir, configurable: true, writable: true });

beforeEach(() => {
  applyTestConfigDefaults();
});

afterAll(() => {
  rmSync(testDataDir, { recursive: true, force: true });
});
