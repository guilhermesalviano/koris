import { defineSubAgentKey } from '../contracts';
import type { CompactResult, CompactWorkerProps } from './sub-agent';

export interface SummarizerApi {
  compact(props: CompactWorkerProps): Promise<CompactResult>;
}

export const SUMMARIZER = defineSubAgentKey<SummarizerApi>({
  id: 'summarizer',
  name: 'Summarizer',
  description: 'Condenses conversations into memories.',
  parentId: 'orchestrator',
  messageable: false,
  listed: false,
  role: 'worker',
});
