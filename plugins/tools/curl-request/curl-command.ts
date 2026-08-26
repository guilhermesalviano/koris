/**
 * Build an exact, copy-pasteable curl command string for logging purposes.
 * The output mirrors what the software actually sends over HTTP so requests
 * can be reproduced manually.
 *
 * Unlike the pre-plugin version of this tool (`core/src/utils/curl.ts`), this
 * does not redact known system-prompt constants out of the logged body —
 * that redaction existed to keep logs readable when a skill echoed a whole
 * prompt constant back through curl_request, and doing it here would require
 * importing core's prompt constants, which plugins don't do. Log volume for
 * that edge case is the accepted tradeoff.
 */
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

export function toCurlCommand(options: CurlCommandOptions): string {
  const { url, method = 'GET', headers, data, extra = [] } = options;
  const parts: string[] = ['curl', '-s', ...extra];

  const upperMethod = method.toUpperCase();
  if (upperMethod !== 'GET') parts.push('-X', upperMethod);

  for (const [key, value] of Object.entries(headers ?? {})) {
    parts.push('-H', shellQuote(`${key}: ${value}`));
  }

  if (data != null && data !== '') {
    parts.push('-d', shellQuote(data));
  }

  parts.push(url);
  return parts.join(' ');
}
