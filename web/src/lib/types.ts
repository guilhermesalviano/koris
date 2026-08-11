export interface OverviewResponse {
  sessions: number;
  heartbeats: number;
  learnedSkills: number;
  skills: number;
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
