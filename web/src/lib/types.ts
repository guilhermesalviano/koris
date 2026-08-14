export interface OverviewResponse {
  sessions: number;
  heartbeats: number;
  learnedSkills: number;
  skills: number;
  auditErrors: number;
  provider: string;
  model: string;
  environment: string;
  health: { status: string; details?: unknown };
}

export interface SessionSummary {
  id: string;
  source: string;
  startedAt?: string;
  endedAt?: string;
  messageCount: number;
  preview?: string | null;
  metadata: Record<string, unknown>;
}

export interface SessionsResponse {
  total: number;
  limit: number;
  offset: number;
  items: SessionSummary[];
}

export interface MessageItem {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface MemoryItem {
  id: string;
  sessionId?: string;
  source?: string;
  type: string;
  content: string;
  importance?: number;
  tags?: string;
  createdAt: string;
}

export interface SessionDetailResponse {
  session: SessionSummary;
  messages: MessageItem[];
  memories: MemoryItem[];
}

export interface MemoriesResponse {
  items: MemoryItem[];
}

export interface HeartbeatItem {
  id: string;
  beat: string;
  type: string;
  cron_expression: string;
  last_run?: string | null;
  created_at: string;
}

export interface HeartbeatsResponse {
  items: HeartbeatItem[];
}

export interface Skill {
  name: string;
  description: string;
  read_when?: string | null;
}

export interface LearnedSkill {
  id: string;
  skill_name: string;
  skill_content: string;
  learned_at: string;
}

export interface SkillsResponse {
  available: Skill[];
  learned: LearnedSkill[];
}

export interface ActiveRun {
  id: string;
  sessionId: string;
  question: string;
  startedAt: string;
  channel: string;
}

export interface ActiveRunsResponse {
  items: ActiveRun[];
}

export interface QueueTaskInfo {
  label: string;
  priority: number;
  eligible: boolean;
}

export interface SubAgentQueueState {
  names: string[];
  queued: number;
  active: number;
  concurrency: number;
}

export interface QueueResponse {
  parallel: boolean;
  subagentsParallel: boolean;
  backgroundGraceMs: number;
  subAgents: SubAgentQueueState[];
  running: QueueTaskInfo[];
  queued: QueueTaskInfo[];
}

export interface AuditItem {
  id: string;
  runId?: string;
  sessionId?: string;
  channel?: string;
  kind: 'llm' | 'tool';
  role: 'manager' | 'worker';
  agentName?: string;
  provider?: string;
  model?: string;
  prompt?: string;
  promptPreview?: string | null;
  promptLength?: number;
  response?: string;
  responsePreview?: string | null;
  responseLength?: number;
  finishReason?: string;
  toolCalls?: number;
  toolName?: string;
  toolArgs?: string;
  success?: boolean;
  durationMs: number;
  status: 'success' | 'error';
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface AuditResponse {
  total: number;
  limit: number;
  offset: number;
  items: AuditItem[];
}

export interface UsageStats {
  calls: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
}

export interface UsageReport {
  days: number | null;
  total: UsageStats;
  byAgent: Record<string, UsageStats>;
  byChannel: Record<string, UsageStats>;
  byTool: Record<string, UsageStats>;
  bySkill: Record<string, UsageStats>;
}
