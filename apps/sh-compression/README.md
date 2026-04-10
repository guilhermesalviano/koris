# sh-compression

Shared mini-module used by `apps/client`.

This package centralizes the “sub-instruction” helpers used by the mock agent:

- `detectInstruction(message)` — lightweight instruction detection (read/write/list/execute/search)
- `readFile(path)` — safe, read-only file preview (Markdown formatted)
- `listDirectory(path)` — safe directory listing (Markdown formatted)
- `search(query)` — codebase search (mock, uses `grep`)

## Development

From repo root:

```bash
pnpm build
pnpm lint
pnpm test
```

## Usage (workspace)

```ts
import { detectInstruction, readFile, listDirectory, search } from 'sh-compression';
```

## CLI proxy (production)

After installing this package (workspace or published), you can use it as a command proxy:

```bash
sh-compression -- git status
sh-compression node -v
```

### Hooks

Provide a hook module (CommonJS) via `SH_COMPRESSION_HOOK`.

```bash
SH_COMPRESSION_HOOK=/abs/path/to/hook.js sh-compression -- pnpm test
```

Hook module example:

```js
// hook.js
module.exports = {
  onStdout(chunk) {
    // Example: truncate very long output
    const s = chunk.toString('utf8');
    return s.length > 10_000 ? s.slice(0, 10_000) + "\n…(truncated)\n" : chunk;
  },
};
```

Environment:

- `SH_COMPRESSION_HOOK`: path to hook module
- `SH_COMPRESSION_QUIET`: if set, suppresses proxy banner

