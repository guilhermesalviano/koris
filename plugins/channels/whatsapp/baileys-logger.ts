import type { ILogger } from '../contracts';

function formatBaileysLog(msg: unknown): string {
  if (typeof msg === 'string') return msg;
  try {
    const serialized = JSON.stringify(msg);
    return serialized ?? String(msg);
  } catch {
    return String(msg);
  }
}

export function createBaileysLogger(logger: ILogger) {
  return {
    level: 'silent' as const,
    trace: () => {},
    debug: () => {},
    info: (msg: unknown) => logger.debug(`[baileys] ${formatBaileysLog(msg)}`),
    warn: (msg: unknown) => logger.warn(`[baileys] ${formatBaileysLog(msg)}`),
    error: (msg: unknown) => logger.error(`[baileys] ${formatBaileysLog(msg)}`),
    fatal: (msg: unknown) => logger.error(`[baileys] fatal: ${formatBaileysLog(msg)}`),
    child: () => createBaileysLogger(logger),
  };
}
