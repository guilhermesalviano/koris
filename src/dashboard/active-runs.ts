export interface ActiveRun {
  id: string;
  sessionId: string;
  question: string;
  startedAt: string;
  channel: string;
}

class ActiveRunRegistry {
  private readonly runs = new Map<string, ActiveRun>();

  start(run: ActiveRun): void {
    this.runs.set(run.id, run);
  }

  finish(id: string): void {
    this.runs.delete(id);
  }

  list(): ActiveRun[] {
    return Array.from(this.runs.values()).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
}

const activeRunsRegistry = new ActiveRunRegistry();

export { activeRunsRegistry };
