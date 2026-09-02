// Downloads a standalone Node.js runtime into build-resources/node/ so the
// packaged desktop app can run the koris server without a system Node.
// Bundling a real Node (rather than reusing Electron's via ELECTRON_RUN_AS_NODE)
// keeps `better-sqlite3` built for the same ABI as `pnpm app` and the tests.
//
//   linux  -> build-resources/node/bin/node
//   darwin -> build-resources/node/bin/node
//   win32  -> build-resources/node/node.exe
//
// Platform/arch default to the host; override with `--platform` / `--arch`.

import { execSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';

// Keep in sync with package.json "engines.node" (>= 24).
const VERSION = process.env.KORIS_BUNDLE_NODE_VERSION || 'v24.15.0';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const platform = argOf('platform', process.platform);
const arch = argOf('arch', process.arch);

const out = join(process.cwd(), 'build-resources', 'node');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const base = `https://nodejs.org/dist/${VERSION}`;

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status}`);
  }
  await pipeline(res.body, createWriteStream(dest));
}

if (platform === 'win32') {
  await download(`${base}/win-${arch}/node.exe`, join(out, 'node.exe'));
  console.log(`node ${VERSION} win-${arch} -> build-resources/node/node.exe`);
} else {
  const dir = platform === 'darwin' ? `darwin-${arch}` : `linux-${arch}`;
  const ext = 'tar.gz';
  const tarball = join(tmpdir(), `node-${VERSION}-${dir}.${ext}`);
  await download(`${base}/node-${VERSION}-${dir}.${ext}`, tarball);
  execSync(`tar -xzf "${tarball}" -C "${out}" --strip-components=1`, { stdio: 'inherit' });
  rmSync(tarball, { force: true });
  // The `node` binary is self-contained; drop the bundled npm/corepack/headers.
  for (const entry of readdirSync(out)) {
    if (entry !== 'bin') {
      rmSync(join(out, entry), { recursive: true, force: true });
    }
  }
  for (const entry of readdirSync(join(out, 'bin'))) {
    if (entry !== 'node') {
      rmSync(join(out, 'bin', entry), { recursive: true, force: true });
    }
  }
  console.log(`node ${VERSION} ${dir} -> build-resources/node/bin/node`);
}
