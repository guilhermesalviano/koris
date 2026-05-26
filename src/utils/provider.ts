export function validateBaseUrl(baseUrl: string, allowRemote: boolean): string {
    let parsed: URL;

    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error(`Invalid AI base URL: ${baseUrl}`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Unsupported AI base URL protocol: ${parsed.protocol}`);
    }

    if (parsed.username || parsed.password) {
      throw new Error('AI base URL must not include credentials');
    }

    const host = parsed.hostname.toLowerCase();
    const normalizedHost = host.replace(/^\[(.*)\]$/, '$1');
    const isLocalHost = normalizedHost === 'localhost' || normalizedHost === '127.0.0.1' || normalizedHost === '::1';

    if (!allowRemote && !isLocalHost) {
      throw new Error(
        `Blocked remote AI base URL: ${parsed.origin}. ` +
        'Set AI_ALLOW_REMOTE_BASE_URL=true only if remote transmission is intended.'
      );
    }

    return parsed.origin;
}