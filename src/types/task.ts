export const TASK_TYPES = ['reminder', 'scheduled_task'] as const;
export type TaskType = typeof TASK_TYPES[number];