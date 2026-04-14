import { getAIProvider } from "../providers";
import { ILogger } from "../../infrastructure/logger";

// refatorar para o COMMANDS 
async function healthCheck(params: { logger: ILogger }): Promise<{ status: 'ok' | 'error'; timestamp: string; details?: string }> {
  const provider = getAIProvider(params);
  try {
    const health = await provider.healthCheck();
    return { status: health.ok === true ? 'ok' : 'error', timestamp: new Date().toISOString() };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { status: 'error', timestamp: new Date().toISOString(), details: detail };
  }
}

export { healthCheck };