import { defineSubAgentKey } from '../contracts';
import type { Negotiator } from './sub-agent';

export type NegotiatorApi = Pick<Negotiator, 'composeOpener' | 'composeResume' | 'run'>;

export const NEGOTIATOR = defineSubAgentKey<NegotiatorApi>({
  id: 'negotiator',
  name: 'Negotiator',
  description: 'Runs errands with your contacts on your behalf.',
  parentId: 'orchestrator',
  messageable: false,
  listed: true,
  role: 'worker',
});
