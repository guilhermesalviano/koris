import type { NegotiatorAction } from '../utils/negotiator-response';

export const ERRAND_ACTION_FOLLOWUPS: Readonly<Record<NegotiatorAction, string | null>> = {
  continue: null,
  escalate: 'I’m checking on this.',
  resolved: 'Thank you for your help!',
  failed: null,
};
