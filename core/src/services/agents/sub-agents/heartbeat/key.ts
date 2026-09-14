import { defineSubAgentKey } from '../contracts';

export interface HeartbeatApi {
  reschedule(): void;
}

export const HEARTBEAT = defineSubAgentKey<HeartbeatApi>({
  id: 'heartbeat',
  name: 'Watcher (Heartbeat)',
  description: 'Runs scheduled beats in the background.',
  parentId: 'orchestrator',
  messageable: false,
  listed: true,
  role: 'worker',
});
