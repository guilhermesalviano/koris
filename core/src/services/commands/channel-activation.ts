import type { ChannelConfigField } from '../../../../scripts/hub-sync';

/**
 * `/channels activate` support: turn a channel's hub-declared `configFields`
 * into a prompt, parse `key=value` answers back out, and decide whether the
 * channel has enough configuration to be switched on.
 *
 * Nothing here names a specific channel — the fields come from koris-hub's
 * `content/marketplace/channels/<slug>.json`, so a new channel needs no change
 * to this file.
 */

export type ConfigValue = string | number | boolean;

export interface ParsedActivateArgs {
  /** `key=value` answers, coerced to the field's declared type. */
  values: Record<string, ConfigValue>;
  /** `--defaults`: activate with whatever is already configured. */
  useDefaults: boolean;
  /** Arguments that are neither a flag nor `key=value`, echoed back as errors. */
  invalid: string[];
  /** `key=value` pairs naming something the channel doesn't declare. */
  unknownKeys: string[];
}

function coerce(field: ChannelConfigField | undefined, raw: string): ConfigValue {
  if (field?.type === 'boolean') return raw === 'true' || raw === 'yes' || raw === '1';
  if (field?.type === 'number') {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? raw : parsed;
  }
  return raw;
}

/**
 * Parses the tail of `/channels activate <slug> …`. Values may be quoted so a
 * label or a spaced list survives the shell-style split the command layer does
 * — the quotes are stripped here, not by the caller.
 */
export function parseActivateArgs(args: string[], fields: ChannelConfigField[]): ParsedActivateArgs {
  const byName = new Map(fields.map((field) => [field.name, field]));
  const parsed: ParsedActivateArgs = { values: {}, useDefaults: false, invalid: [], unknownKeys: [] };

  for (const arg of args) {
    if (arg === '--defaults' || arg === '--yes' || arg === '-y') {
      parsed.useDefaults = true;
      continue;
    }

    const separator = arg.indexOf('=');
    if (separator <= 0) {
      parsed.invalid.push(arg);
      continue;
    }

    const key = arg.slice(0, separator);
    const raw = arg.slice(separator + 1).replace(/^["']|["']$/g, '');
    if (!byName.has(key)) {
      parsed.unknownKeys.push(key);
      continue;
    }

    parsed.values[key] = coerce(byName.get(key), raw);
  }

  return parsed;
}

/** A value the user has actually provided — `''` and `undefined` don't count. */
function isSet(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value === 'string' ? value.trim().length > 0 : true;
}

/**
 * Fields the channel declares `required` that are still unset after merging the
 * answers over the existing `config.yml`. A boolean is never "missing" — `false`
 * is a real answer.
 */
export function missingRequiredFields(
  fields: ChannelConfigField[],
  merged: Record<string, unknown>,
): ChannelConfigField[] {
  return fields.filter((field) => field.required && field.type !== 'boolean' && !isSet(merged[field.name]));
}

/** Never echo a secret back into a chat transcript. */
function displayValue(field: ChannelConfigField, value: unknown): string {
  if (!isSet(value)) return 'not set';
  if (field.type === 'password') return '••• (set)';
  return `"${String(value)}"`;
}

function fieldLine(field: ChannelConfigField, current: Record<string, unknown>): string {
  const marks = [field.required ? 'required' : 'optional', field.type];
  const detail = field.description ?? (field.placeholder ? `e.g. ${field.placeholder}` : undefined);
  return [
    `  ${field.name}  [${marks.join(', ')}] — currently ${displayValue(field, current[field.name])}`,
    `      ${field.label}${detail ? ` — ${detail}` : ''}`,
  ].join('\n');
}

function exampleFor(field: ChannelConfigField): string {
  if (field.type === 'boolean') return `${field.name}=true`;
  return `${field.name}=${field.placeholder ?? '<value>'}`;
}

/**
 * The "what does this channel need?" reply — shown when `/channels activate
 * <slug>` is run with no answers, and again (narrowed to what's missing) when a
 * required field is still unset.
 */
export function formatActivatePrompt(
  slug: string,
  fields: ChannelConfigField[],
  current: Record<string, unknown>,
  options: { missingOnly?: ChannelConfigField[] } = {},
): string {
  const missing = options.missingOnly;

  if (fields.length === 0) {
    return (
      `*Activate ${slug}*\n\n` +
      'This channel has no configuration variables.\n\n' +
      `Run \`/channels activate ${slug} --defaults\` to switch it on.`
    );
  }

  const shown = missing?.length ? missing : fields;
  const heading = missing?.length
    ? `*${slug}: ${missing.length} required variable${missing.length === 1 ? '' : 's'} still missing*`
    : `*Activate ${slug}* — set its variables, then run the command again`;

  const example = `/channels activate ${slug} ${shown.map(exampleFor).join(' ')}`;
  const lines = [heading, '', shown.map((field) => fieldLine(field, current)).join('\n'), '', 'Example:', `  ${example}`];

  if (!missing?.length && fields.every((field) => !field.required)) {
    lines.push('', `Nothing is strictly required — \`/channels activate ${slug} --defaults\` activates it as-is.`);
  }

  return lines.join('\n');
}
