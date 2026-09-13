import { apiRequest } from './api';

/** Errand actions the admin API exposes as `POST /errands/:id/<action>`. */
export type ErrandAction = 'approve' | 'cancel' | 'close' | 'confirm' | 'retry';

export function runErrandAction(errandId: string, action: ErrandAction): Promise<unknown> {
  return apiRequest(`/errands/${encodeURIComponent(errandId)}/${action}`, { method: 'POST' });
}

/** Answers an errand's pending question, or adds a requirement to a proposed result. */
export function answerErrand(errandId: string, answer: string): Promise<unknown> {
  return apiRequest(`/errands/${encodeURIComponent(errandId)}/reply`, { method: 'POST', body: JSON.stringify({ answer }) });
}
