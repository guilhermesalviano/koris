import { ToolCall } from "../orchestrator/worker/executor";

function extractToolCalls(response: string): ToolCall[] {
  try {
    // Try to parse as JSON tool calls
    const parsed = JSON.parse(response);
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls.map((tc: any) => ({
        name: tc.function?.name || 'unknown',
        arguments: tc.function?.arguments || {},
      }));
    }
  } catch { }
  return [];
}

export { extractToolCalls };