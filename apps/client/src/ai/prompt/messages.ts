import { Skill } from "../../types/skills";
import { loadSystemInfoPrompt } from "./system-info";
import { buildAITools } from "./tools";

const BASE_SYSTEM_PROMPT =
  'You are a Personal Assistant. Be direct.';

interface MessagesParams {
  message: string;
  channel: 'telegram' | 'tui';
  skills?: Skill[];
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
      ...(params.skills && params.skills.length > 0) ?
        [{ role: 'system' as const, content: `Skills:\n${params.skills.map(s => `${s.name}: ${s.description}`).join('\n')}` }] :
        [],
      { role: 'user' as const, content: params.message },
    ],
    tools: buildAITools(),
  };
}

export { buildMessages };