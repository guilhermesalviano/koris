export interface OverviewResponse {
  sessions: number;
  openSessions: number;
  messages: number;
  memories: number;
  heartbeats: number;
  learnedSkills: number;
  learnedSkillsLimit: number;
  skills: number;
  auditErrors: number;
  provider: string;
  model: string;
  workerProvider: string;
  workerModel: string;
  environment: string;
  timezone: string;
  heartbeatEnabled: boolean;
  summarizerEnabled: boolean;
  aiParallel: boolean;
  aiSubagentsParallel: boolean;
  channels: { type: string; enabled: boolean }[];
  registeredChannels: { type: string; target: string; principal: boolean }[];
  lastHeartbeatRunAt?: string | null;
  health: { status: string; details?: unknown };
  activeRuns: ActiveRun[];
  queue: QueueResponse;
  usage: UsageStats;
  recentErrors: AuditItem[];
}

export interface SessionSummary {
  id: string;
  entryChannel: string;
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

export interface ImageAttachment {
  data: string;
  mimeType?: string;
}

export interface MessageItem {
  id: string;
  role: string;
  content: string;
  images?: ImageAttachment[];
  missingImages?: number;
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
  channel?: string | null;
  target?: string | null;
  last_run?: string | null;
  next_run?: string | null;
  created_at: string;
}

export interface HeartbeatsResponse {
  items: HeartbeatItem[];
}

export interface ChannelItem {
  id: string;
  channel: 'telegram' | 'whatsapp';
  target: string;
  isPrincipal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelsResponse {
  items: ChannelItem[];
}

export interface OutboundMessageItem {
  id: string;
  channel: 'telegram' | 'whatsapp';
  target: string;
  content: string;
  status: 'sent' | 'failed';
  errorMessage?: string | null;
  createdAt: string;
  sentAt?: string | null;
}

export interface OutboundResponse {
  items: OutboundMessageItem[];
}

export interface SkillItem {
  name: string;
  description: string;
  read_when?: string[] | null;
  content?: string | null;
  enabled: boolean;
  learned_at?: string | null;
}

export interface SkillsResponse {
  items: SkillItem[];
  limit: number;
}

export interface PluginItem {
  family: 'tools' | 'channels';
  name: string;
  enabled: boolean;
}

export interface PluginsResponse {
  items: PluginItem[];
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
  queuedLabels: string[];
  activeLabels: string[];
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
  type: 'llm' | 'tool';
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
  toolsEnabled?: boolean;
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
}
