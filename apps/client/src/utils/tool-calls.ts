import { ToolCall } from '../types/tools';
import { ILogger } from '../infrastructure/logger';

/**
 * Extract and parse tool calls from AI provider response.
 * Handles both string and object argument formats from different providers.
 */
function extractToolCalls(response: string, logger?: ILogger): ToolCall[] {
  try {
    const parsed = JSON.parse(response);

    if (!parsed.tool_calls || !Array.isArray(parsed.tool_calls)) {
      return [];
    }

    return parsed.tool_calls
      .map((tc: any, index: number) => {
        try {
          return parseToolCall(tc, index, logger);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger?.warn('Failed to parse tool call', {
            index,
            error: errorMsg,
            toolCall: tc,
          });
          return null;
        }
      })
      .filter((tc: any): tc is ToolCall => tc !== null);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger?.warn('Failed to parse response as JSON', { error: errorMsg });
    return [];
  }
}

/**
 * Parse individual tool call, handling both string and object arguments
 */
function parseToolCall(tc: any, index: number, logger?: ILogger): ToolCall {
  const name = tc.function?.name || 'unknown';
  const rawArgs = tc.function?.arguments;

  // Parse arguments if they're a JSON string (Ollama format)
  let parsedArgs: Record<string, unknown>;

  if (typeof rawArgs === 'string') {
    try {
      parsedArgs = JSON.parse(rawArgs);
      logger?.debug('Parsed string arguments', { toolName: name, index });
    } catch (err) {
      logger?.warn('Failed to parse arguments string, using as-is', {
        toolName: name,
        index,
        arguments: rawArgs,
      });
      // Fallback: wrap unparseable string in object
      parsedArgs = { raw: rawArgs };
    }
  } else if (typeof rawArgs === 'object' && rawArgs !== null) {
    // Already an object (OpenAI/Anthropic format)
    parsedArgs = rawArgs as Record<string, unknown>;
  } else {
    // Handle null, undefined, or other types
    logger?.warn('Unexpected arguments type', {
      toolName: name,
      index,
      type: typeof rawArgs,
    });
    parsedArgs = {};
  }

  return {
    name,
    arguments: parsedArgs,
  };
}

export { extractToolCalls };