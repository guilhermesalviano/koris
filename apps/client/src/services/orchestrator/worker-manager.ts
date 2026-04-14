import { ILogger } from "../../infrastructure/logger";

interface WorkerTask<T> {
  id: string;
  execute: () => Promise<T>;
  priority?: number;
}

class WorkerManager<T> {
  // private queue: WorkerTask<T>[] = [];
  private running = 0;

  constructor(
    private maxWorkers: number,
    private logger: ILogger,
  ) {}

  async execute(tasks: WorkerTask<T>[], signal?: AbortSignal): Promise<T[]> {
    const results: T[] = [];
    const errors: Error[] = [];

    const sortedTasks = [...tasks].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );

    return new Promise((resolve, reject) => {
      let completed = 0;

      const runNext = () => {
        if (signal?.aborted) {
          reject(new Error('Aborted'));
          return;
        }

        while (this.running < this.maxWorkers && sortedTasks.length > 0) {
          const task = sortedTasks.shift()!;
          this.running++;

          this.logger.debug('Starting worker task', { 
            taskId: task.id,
            running: this.running,
            queued: sortedTasks.length 
          });

          task.execute()
            .then((result) => {
              results.push(result);
              completed++;
              this.running--;
              
              this.logger.debug('Worker task completed', {
                taskId: task.id,
                completed,
                total: tasks.length
              });

              if (completed === tasks.length) {
                resolve(results);
              } else {
                runNext();
              }
            })
            .catch((error) => {
              errors.push(error);
              completed++;
              this.running--;
              
              this.logger.error('Worker task failed', {
                taskId: task.id,
                error: error.message
              });

              if (completed === tasks.length) {
                resolve(results); // or reject based on your error strategy
              } else {
                runNext();
              }
            });
        }
      };

      runNext();
    });
  }
}

export { WorkerManager };