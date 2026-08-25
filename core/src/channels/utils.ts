import { stripInternalStreamMarkers } from '../utils/stream-markers';
import { splitMessage } from '../../../plugins/channels/contracts';

export { splitMessage };

export async function resolveResponse(response: unknown): Promise<string> {
  if (typeof response === 'string') {
    return stripInternalStreamMarkers(response);
  }

  if (isAsyncIterable(response)) {
    let out = '';
    for await (const chunk of response) {
      out += chunk;
    }
    return stripInternalStreamMarkers(out);
  }

  return String(response);
}

function isAsyncIterable(value: unknown): value is AsyncIterable<string> {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as { [Symbol.asyncIterator]?: unknown };
  return typeof maybe[Symbol.asyncIterator] === 'function';
}