export interface Skill {
  name: string;
  description: string;
  content?: string;
  read_when?: string[] | null;
  metadata?: Record<string, any> | null;
  path: string;
}