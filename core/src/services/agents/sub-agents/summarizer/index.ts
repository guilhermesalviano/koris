import { config } from '../../../../config';
import { AuditServiceFactory } from '../../../audit/audit-service';
import { defineSubAgent } from '../contracts';
import { SUMMARIZER } from './key';
import { Summarizer } from './sub-agent';

export const summarizerSubAgent = defineSubAgent(SUMMARIZER, ({ logger, completion, queue }) => {
  const summarizer = new Summarizer(logger, completion, AuditServiceFactory.create(logger), queue);
  return {
    api: { compact: (props) => summarizer.compact(props) },
    triggers: {
      onTurnComplete: async (turn) => {
        if (config.SESSION.SUMMARIZER_MODE !== 'auto') return;
        await summarizer.summarize(turn);
      },
    },
  };
});

export { SUMMARIZER };
export type { SummarizerApi } from './key';
