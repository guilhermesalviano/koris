export class TaskQueue {
  private queue: Array<() => Promise<void>> = [];
  private active = 0;

  constructor(private concurrency: number) {}

  add(task: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push(() =>
        Promise.resolve()
          .then(task)
          .then(resolve, reject),
      );
      this.pump();
    });
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.active += 1;
      task().finally(() => {
        this.active -= 1;
        this.pump();
      });
    }
  }

  snapshot(): { queued: number; active: number; concurrency: number } {
    return { queued: this.queue.length, active: this.active, concurrency: this.concurrency };
  }
}

export const sharedSubAgentQueue = new TaskQueue(1);