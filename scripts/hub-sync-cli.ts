import { listMissing, pullEntry } from './hub-sync';

function printUsage(): void {
  console.log(
    'Usage:\n' +
    '  pnpm hub:list\n' +
    '  pnpm hub:pull <slug> [<slug2> ...] [--force]\n' +
    '  pnpm hub:pull --all [--force]\n\n' +
    'Lists/pulls tools and skills from koris-hub ' +
    '(https://github.com/guilhermesalviano/koris-hub) that are not already present locally.',
  );
}

async function runList(): Promise<void> {
  const entries = await listMissing();
  if (entries.length === 0) {
    console.log('Nothing new — every tool/skill in koris-hub is already present locally.');
    return;
  }

  console.log(`${entries.length} available to pull:\n`);
  for (const entry of entries) {
    const summary = entry.summary ? ` — ${entry.summary}` : '';
    console.log(`  [${entry.family}] ${entry.slug}${summary}`);
  }
  console.log('\nRun `pnpm hub:pull <slug>` to pull one, or `pnpm hub:pull --all` for all of them.');
}

async function runPull(argv: string[]): Promise<void> {
  const force = argv.includes('--force');
  const all = argv.includes('--all');
  const slugs = argv.filter((arg) => arg !== '--force' && arg !== '--all');

  const targets = all ? (await listMissing()).map((entry) => entry.slug) : slugs;
  if (targets.length === 0) {
    if (all) {
      console.log('Nothing new to pull.');
    } else {
      console.error('Missing <slug>.\n');
      printUsage();
      process.exitCode = 1;
    }
    return;
  }

  for (const slug of targets) {
    try {
      const result = await pullEntry(slug, { force });
      console.log(`Pulled ${result.family} "${result.slug}":`);
      for (const file of result.createdFiles) console.log(`  ${file}`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  }

  console.log(
    '\nNote: new plugin folders stay untracked by git by default (see the tools/skills ' +
    'allowlist in .gitignore) — add a `!` rule there if you want to commit one.\n' +
    'Next: pnpm build && restart the app — the plugin loader only discovers plugins at startup.',
  );
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'list') {
    await runList();
  } else if (command === 'pull') {
    await runPull(rest);
  } else {
    printUsage();
    process.exitCode = command ? 1 : 0;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
