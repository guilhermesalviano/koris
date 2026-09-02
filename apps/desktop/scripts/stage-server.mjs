// Produces the production server tree that gets bundled into the packaged
// desktop app (see electron-builder.yml `extraResources`):
//
//   build-resources/server-node_modules/   prod deps incl. built better-sqlite3
//   build-resources/server-package.json    the prod manifest
//
// Run before `electron-builder`. Safe to re-run; it wipes its own staging dir.

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'build-resources');
const staging = join(out, '.staging-server');

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const prodPkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  type: pkg.type,
  dependencies: pkg.dependencies ?? {},
  // --ignore-workspace drops pnpm-workspace.yaml, so restate which native
  // packages are allowed to run install scripts.
  pnpm: { onlyBuiltDependencies: ['better-sqlite3'] },
};

writeFileSync(join(staging, 'package.json'), `${JSON.stringify(prodPkg, null, 2)}\n`);
cpSync(join(root, 'pnpm-lock.yaml'), join(staging, 'pnpm-lock.yaml'));

execSync(
  'pnpm install --prod --ignore-workspace --no-frozen-lockfile --config.confirmModulesPurge=false',
  { cwd: staging, stdio: 'inherit' },
);

rmSync(join(out, 'server-node_modules'), { recursive: true, force: true });
cpSync(join(staging, 'node_modules'), join(out, 'server-node_modules'), {
  recursive: true,
  dereference: true,
});
cpSync(join(staging, 'package.json'), join(out, 'server-package.json'));

console.log('\nstaged prod server deps -> build-resources/server-node_modules');
