import { BeatRunRepositoryFactory } from '../../../../repositories/beat-run';
import { HeartbeatRepositoryFactory } from '../../../../repositories/heartbeat';
import { HeartbeatRunRepositoryFactory } from '../../../../repositories/heartbeat-run';
import { ImageRepositoryFactory } from '../../../../repositories/image';
import { AgnosticExecutionToolFactory } from '../../../tools';
import { ToolsQueue } from '../../../tools-queue';
import { ToolCallPipelineFactory } from '../../tool-call-pipeline';
import { defineSubAgent } from '../contracts';
import { SubAgentRegistrySingleton } from '../registry';
import { HEARTBEAT } from './key';
import { HeartbeatRunner } from './runner';
import { Heartbeat } from './sub-agent';

export const heartbeatSubAgent = defineSubAgent(HEARTBEAT, (services) => {
  const { logger, db, completion, queue } = services;
  const runner = new HeartbeatRunner(
    logger,
    HeartbeatRepositoryFactory.create(db),
    HeartbeatRunRepositoryFactory.create(db),
    () => new Heartbeat(
      logger,
      services.createPromptRepository(),
      HeartbeatRepositoryFactory.create(db),
      new ToolsQueue(logger, AgnosticExecutionToolFactory.create()),
      completion,
      ToolCallPipelineFactory.create(logger),
      ImageRepositoryFactory.create(db),
      BeatRunRepositoryFactory.create(db),
      queue,
    ),
    HEARTBEAT.id,
  );

  return {
    api: { reschedule: () => runner.reschedule() },
    triggers: { schedule: runner },
  };
});

export function rescheduleHeartbeat(): void {
  const registry = SubAgentRegistrySingleton.getExistingInstance();
  if (registry?.has(HEARTBEAT.id)) registry.get(HEARTBEAT).reschedule();
}

export { HEARTBEAT };
export type { HeartbeatApi } from './key';
