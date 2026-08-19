export type ProcessedMessage = string;
export type ProcessOptions = {
  signal?: AbortSignal;
  toolsEnabled?: boolean;
  learnedSkillsEnabled?: boolean;
  onProgress?: (summary: string) => void;
  sessionId?: string;
  runId?: string;
  channel?: string;
};

export interface IAgent<TInput, TOutput> {
  run(input: TInput): Promise<TOutput>;
}

export interface ISubAgent<TInput = unknown> {
  handler(props: TInput): Promise<void>;
}
