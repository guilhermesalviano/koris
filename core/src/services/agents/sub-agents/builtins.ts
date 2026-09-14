import type { SubAgentDefinition } from './contracts';
import { heartbeatSubAgent } from './heartbeat';
import { negotiatorSubAgent } from './negotiator';
import { summarizerSubAgent } from './summarizer';

export const BUILTIN_SUB_AGENTS: readonly SubAgentDefinition[] = [
  negotiatorSubAgent,
  heartbeatSubAgent,
  summarizerSubAgent,
];
