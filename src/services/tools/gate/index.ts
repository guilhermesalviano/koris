import { config } from '../../../config';

export function getAllowedDomains(): string[] {
  return config.ALLOWED_DOMAINS;
}

/** Extract the lowercase hostname from a URL or bare domain, or null when unparseable. */
export function extractHostname(input: string): string | null {
  try {
    const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input) ? input : `https://${input}`;
    const hostname = new URL(normalized).hostname.toLowerCase();
    const validHostname = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
    return hostname && validHostname.test(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

/**
 * Returns an error message when the URL's hostname is not in the allowed_domains
 * allowlist, or null when the request is permitted.
 */
export function gateErrorForUrl(input: string): string | null {
  const hostname = extractHostname(input);
  if (!hostname) {
    return `Domain gate: unable to resolve a hostname from "${input}".`;
  }

  const allowed = getAllowedDomains();
  if (allowed.length === 0) {
    return 'Domain gate: no allowed_domains configured in settings.json — curl requests are blocked. Add "allowed_domains" to settings.json to enable curl requests.';
  }

  if (!allowed.includes(hostname)) {
    return `Domain gate: "${hostname}" is not in allowed_domains. Add it to settings.json to allow this request. Allowed domains: ${allowed.join(', ')}.`;
  }

  return null;
}
