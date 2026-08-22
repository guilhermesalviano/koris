import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface ChangelogEntry {
  version: string;
  date: string | null;
  summary: string | null;
}

const VERSION_HEADING = /^## \[(.+?)\](?: - (.+))?\s*$/;
const SECTION_HEADING = /^### (.+)\s*$/;

function resolveChangelogPath(): string | null {
  const candidates = [
    join(process.cwd(), 'CHANGELOG.md'),
    join(process.cwd(), '..', 'CHANGELOG.md'),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let inSection = false;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();

    const versionMatch = line.match(VERSION_HEADING);
    if (versionMatch) {
      current = { version: versionMatch[1], date: versionMatch[2] ?? null, summary: null };
      inSection = false;
      entries.push(current);
      continue;
    }

    if (!current) continue;

    if (SECTION_HEADING.test(line)) {
      inSection = true;
      continue;
    }

    if (line.trim() && !inSection && !current.summary) {
      current.summary = line.trim();
    }
  }

  return entries
    .filter((entry) => entry.summary)
    .sort((a, b) => {
      // Undated entries (e.g. "Unreleased") sort last — nothing to compare chronologically.
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
}

export function getChangelogEntries(): ChangelogEntry[] {
  const path = resolveChangelogPath();
  if (!path) return [];

  return parseChangelog(readFileSync(path, 'utf-8'));
}
