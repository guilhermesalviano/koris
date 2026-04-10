#!/usr/bin/env node

import * as path from 'path';
import { spawn } from 'child_process';

type HookContext = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
};

type HookResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

type CompressionHook = {
  onStart?: (ctx: HookContext) => HookContext | void | Promise<HookContext | void>;
  onStdout?: (chunk: Buffer, ctx: HookContext) => Buffer | string | void | Promise<Buffer | string | void>;
  onStderr?: (chunk: Buffer, ctx: HookContext) => Buffer | string | void | Promise<Buffer | string | void>;
  onExit?: (result: HookResult, ctx: HookContext) => void | Promise<void>;
};

function usage(): string {
  return `sh-compression (CLI proxy)\n\nUsage:\n  sh-compression -- <command> [args...]\n  sh-compression <command> [args...]\n\nHooking:\n  SH_COMPRESSION_HOOK=/abs/path/to/hook.js sh-compression -- <command> ...\n\nEnvironment:\n  SH_COMPRESSION_HOOK     Path to a CommonJS module exporting hook functions\n  SH_COMPRESSION_QUIET    When set, suppress proxy banner (still forwards output)\n`;
}

function parseArgs(argv: string[]): { command?: string; args: string[] } {
  const args = argv.slice(2);
  if (args.length === 0) return { args: [] };
  if (args[0] === '-h' || args[0] === '--help') return { args: [] };

  const sep = args.indexOf('--');
  const sliced = sep === -1 ? args : args.slice(sep + 1);
  const command = sliced[0];
  return { command, args: sliced.slice(1) };
}

async function loadHook(): Promise<CompressionHook | null> {
  const hookPath = process.env.SH_COMPRESSION_HOOK;
  if (!hookPath) return null;

  const resolved = path.isAbsolute(hookPath) ? hookPath : path.resolve(process.cwd(), hookPath);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(resolved);
  const hook = (mod?.default ?? mod) as CompressionHook;

  if (!hook || typeof hook !== 'object') {
    throw new Error(`Invalid hook module: ${resolved}`);
  }

  return hook;
}

function toBuffer(out: Buffer | string): Buffer {
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (!parsed.command) {
    process.stdout.write(usage());
    process.exitCode = 1;
    return;
  }

  const hook = await loadHook();

  let ctx: HookContext = {
    command: parsed.command,
    args: parsed.args,
    cwd: process.cwd(),
    env: process.env,
  };

  if (hook?.onStart) {
    const maybe = await hook.onStart(ctx);
    if (maybe) ctx = maybe;
  }

  const quiet = !!process.env.SH_COMPRESSION_QUIET;
  if (!quiet) {
    // Minimal banner to make it obvious this is a proxy.
    process.stderr.write(`[sh-compression] proxy: ${ctx.command} ${ctx.args.join(' ')}\n`);
  }

  const child = spawn(ctx.command, ctx.args, {
    cwd: ctx.cwd,
    env: ctx.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
  });

  child.stdout.on('data', async (chunk: Buffer) => {
    try {
      const transformed = hook?.onStdout ? await hook.onStdout(chunk, ctx) : undefined;
      const out = transformed === undefined ? chunk : toBuffer(transformed);
      process.stdout.write(out);
    } catch (err) {
      process.stdout.write(chunk);
      process.stderr.write(`[sh-compression] stdout hook error: ${String(err)}\n`);
    }
  });

  child.stderr.on('data', async (chunk: Buffer) => {
    try {
      const transformed = hook?.onStderr ? await hook.onStderr(chunk, ctx) : undefined;
      const out = transformed === undefined ? chunk : toBuffer(transformed);
      process.stderr.write(out);
    } catch (err) {
      process.stderr.write(chunk);
      process.stderr.write(`[sh-compression] stderr hook error: ${String(err)}\n`);
    }
  });

  child.on('error', (err) => {
    process.stderr.write(`[sh-compression] failed to spawn: ${String(err)}\n`);
    process.exitCode = 127;
  });

  child.on('exit', async (code, signal) => {
    const result: HookResult = { exitCode: code, signal };
    if (hook?.onExit) {
      try {
        await hook.onExit(result, ctx);
      } catch (err) {
        process.stderr.write(`[sh-compression] exit hook error: ${String(err)}\n`);
      }
    }

    if (signal) {
      // Mirror typical shell behavior for signals (128 + signal number is common, but Node gives us the signal name).
      process.exitCode = 1;
      return;
    }

    process.exitCode = code ?? 1;
  });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main().catch((err) => {
  process.stderr.write(`[sh-compression] fatal: ${String(err)}\n`);
  process.exitCode = 1;
});
