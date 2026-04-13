import { Skill } from "../../types/skills";
import { loadSystemInfoPrompt } from "./system-info";
import { buildAITools } from "../../orchestrator/tools";

const BASE_SYSTEM_PROMPT =
  'You are a Personal Assistant. Be direct.';

interface MessagesParams {
  message: string;
  channel: 'telegram' | 'tui';
  skills?: Skill[];
  toolsEnabled?: boolean;
}

function buildMessages(params: MessagesParams) {
  return {
    messages: [
      {
        role: 'system' as const,
        content: BASE_SYSTEM_PROMPT,
      },
      {
        role: 'system' as const,
        content:  loadSystemInfoPrompt({ channel: params.channel }),
      },
      { role: 'user' as const, content: params.message },
    ],
    tools: params.toolsEnabled ? buildAITools(params.skills) : undefined,
  };
}

export { buildMessages };