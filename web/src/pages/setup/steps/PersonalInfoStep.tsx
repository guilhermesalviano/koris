import { useState } from 'react';
import type { SettingsFormApi } from '../../../lib/use-settings-form';

const inputClass = 'rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent';
const buttonClass = 'rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm font-medium hover:border-accent';

interface Entry {
  id: number;
  key: string;
  value: string;
}

let nextId = 0;

function toEntries(map: Record<string, string>): Entry[] {
  const entries = Object.entries(map).map(([key, value]) => ({ id: nextId++, key, value }));
  // Seed a "name" row by default (matching settings.example.json's
  // personal_information shape) so the field is ready to fill in rather
  // than requiring the user to add it manually.
  return entries.length > 0 ? entries : [{ id: nextId++, key: 'name', value: '' }];
}

export function PersonalInfoStep({ api }: { api: SettingsFormApi }) {
  // Rows are kept as a locally-owned, id-stable list rather than derived fresh
  // from `personal_information` on every render — deriving from the object
  // directly breaks when two rows share a (possibly still-blank) key, since
  // Object.fromEntries silently collapses duplicate keys.
  const [entries, setEntries] = useState<Entry[]>(() => toEntries(api.form.personal_information));

  function sync(next: Entry[]) {
    setEntries(next);
    const map: Record<string, string> = {};
    for (const entry of next) {
      if (entry.key.trim() && entry.value.trim()) map[entry.key] = entry.value;
    }
    api.update((prev) => ({ ...prev, personal_information: map }));
  }

  function updateEntry(id: number, field: 'key' | 'value', value: string) {
    sync(entries.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)));
  }

  function removeEntry(id: number) {
    sync(entries.filter((entry) => entry.id !== id));
  }

  function addEntry() {
    sync([...entries, { id: nextId++, key: '', value: '' }]);
  }

  return (
    <div>
      <p className="mb-3 font-mono text-[11px] text-txt-3">
        Optional context the assistant can use about you (name, location, preferences...).
      </p>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="flex gap-2">
            <input
              value={entry.key}
              onChange={(e) => updateEntry(entry.id, 'key', e.target.value)}
              placeholder="key"
              className={`${inputClass} w-1/3`}
            />
            <input
              value={entry.value}
              onChange={(e) => updateEntry(entry.id, 'value', e.target.value)}
              placeholder={entry.key.trim().toLowerCase() === 'name' ? 'e.g. John Doe' : 'value'}
              className={`${inputClass} flex-1`}
            />
            <button type="button" onClick={() => removeEntry(entry.id)} className={buttonClass}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addEntry} className={`${buttonClass} mt-3`}>
        Add field
      </button>
    </div>
  );
}
