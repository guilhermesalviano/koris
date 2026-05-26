export function sanitizeLogText(input: string): string {
  return input
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) {
    return undefined;
  }

  return sanitizeMetaValue(meta, new WeakSet<object>()) as Record<string, unknown>;
}

function sanitizeMetaValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return sanitizeLogText(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: sanitizeLogText(value.name),
      message: sanitizeLogText(value.message),
      stack: value.stack ? sanitizeLogText(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetaValue(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
    const sanitized: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value)) {
      sanitized[key] = sanitizeMetaValue(nested, seen);
    }

    seen.delete(value);
    return sanitized;
  }

  return sanitizeLogText(String(value));
}