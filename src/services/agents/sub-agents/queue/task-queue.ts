export interface TaskQueueSnapshot {
  queued: number;
  active: number;
  concurrency: number;
  queuedLabels: string[];
  activeLabels: string[];
}

interface TaskQueueEntry {
  fn: () => Promise<void>;
  label: string;
}

export class TaskQueue {
  private queue: TaskQueueEntry[] = [];
  private active: TaskQueueEntry[] = [];

  constructor(private concurrency: number) {}

  add(task: () => Promise<void>, label = 'task'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn: () =>
          Promise.resolve()
            .then(task)
            .then(resolve, reject),
        label,
      });
      this.pump();
    });
  }

  private pump(): void {
    while (this.active.length < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.active.push(task);
      task.fn().finally(() => {
        this.active = this.active.filter((entry) => entry !== task);
        this.pump();
      });
    }
  }

  snapshot(): TaskQueueSnapshot {
    return {
      queued: this.queue.length,
      active: this.active.length,
      concurrency: this.concurrency,
      queuedLabels: this.queue.map((entry) => entry.label),
      activeLabels: this.active.map((entry) => entry.label),
    };
  }
}

export const sharedSubAgentQueue = new TaskQueue(1);
