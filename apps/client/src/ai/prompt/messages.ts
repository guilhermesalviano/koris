import { loadSystemInfoPrompt } from "./system-info";
import { buildAITools } from "./tools";

const BASE_SYSTEM_PROMPT =
  'You are a Personal Assistant. Be direct.';

function buildMessages(message: string, channel: 'telegram' | 'tui') {
  return {
    messages: [
      {
        role: 'system' as const,
        content: BASE_SYSTEM_PROMPT,
      },
      {
        role: 'system' as const,
        content: loadSystemInfoPrompt({ channel }),
      },
      { role: 'user' as const, content: message },
    ],
    tools: buildAITools(),
  };
}

export { buildMessages };