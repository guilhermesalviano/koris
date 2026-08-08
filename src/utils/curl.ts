/**
 * Build an exact, copy-pasteable curl command string for logging purposes.
 * The output mirrors what the software actually sends over HTTP so requests
 * can be reproduced manually. Known prompt constants are redacted to their
 * variable name so logs stay readable and don't duplicate constant text.
 */
import {
  FIRST_PROMPT_HELPER,
  HEARTBEAT_PROMPT,
  PLAN_PROMPT,
  SKILL_LEARNING_PROMPT,
  SKILL_READY_PROMPT,
  SUMMARIZATION_PROMPT,
  SYSTEM_PROMPT,
  TOOLS_RESULT_PROMPT,
} from '../constants';

export interface CurlCommandOptions {
  url: string;
  method?: string;
  headers?: Record<string, string> | null;
  /** Raw request body. Rendered with -d so it can be pasted as-is. */
  data?: string | null;
  /** Extra curl flags, e.g. ['-k', '-L']. */
  extra?: string[];
}

function shellQuote(value: string): string {
  if (!value) return "''";
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Static, unique portion of a prompt constant, up to its first {vN} placeholder. */
function staticPrefix(text: string): string {
  const match = text.search(/\{v\d+\}/);
  return match === -1 ? text : text.slice(0, match);
}

interface PromptRedaction {
  label: string;
  /** JSON-escaped needle used to locate the constant inside a serialized body. */
  needle: string;
}

function buildRedaction(label: string, text: string): PromptRedaction {
  const prefix = staticPrefix(text);
  const needle = JSON.stringify(prefix).slice(1, -1);
  const needleOk = needle.length >= 25;
  return {
    label,
    needle: needleOk ? needle : JSON.stringify(text).slice(1, -1),
  };
}

const PROMPT_REDACTIONS: PromptRedaction[] = [
  buildRedaction('<SYSTEM_PROMPT>', SYSTEM_PROMPT),
  buildRedaction('<FIRST_PROMPT_HELPER>', FIRST_PROMPT_HELPER),
  buildRedaction('<TOOLS_RESULT_PROMPT>', TOOLS_RESULT_PROMPT),
  buildRedaction('<SUMMARIZATION_PROMPT>', SUMMARIZATION_PROMPT),
  buildRedaction('<PLAN_PROMPT>', PLAN_PROMPT),
  buildRedaction('<SKILL_LEARNING_PROMPT>', SKILL_LEARNING_PROMPT),
  buildRedaction('<SKILL_READY_PROMPT>', SKILL_READY_PROMPT),
  buildRedaction('<HEARTBEAT_PROMPT>', HEARTBEAT_PROMPT),
];

/**
 * Replace known prompt-constant text inside a serialized JSON body with the
 * constant's variable name, e.g. "<SYSTEM_PROMPT>".
 */
export function redactPromptConstants(input: string): string {
  let result = input;
  for (const { label, needle } of PROMPT_REDACTIONS) {
    if (needle && result.includes(needle)) {
      result = result.split(needle).join(label);
    }
  }
  return result;
}

export function toCurlCommand(options: CurlCommandOptions): string {
  const { url, method = 'GET', headers, data, extra = [] } = options;
  const parts: string[] = ['curl', '-s', ...extra];

  const upperMethod = method.toUpperCase();
  if (upperMethod !== 'GET') parts.push('-X', upperMethod);

  for (const [key, value] of Object.entries(headers ?? {})) {
    parts.push('-H', shellQuote(`${key}: ${value}`));
  }

  if (data != null && data !== '') {
    parts.push('-d', shellQuote(redactPromptConstants(data)));
  }

  parts.push(url);
  return parts.join(' ');
}
