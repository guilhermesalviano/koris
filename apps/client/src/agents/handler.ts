import { handleCommand, isCommand } from './commands';
import { previewMessage, toSafeMessage } from './helpers';
import { messageProvider } from '../services/chat';
import { ILogger } from '../infrastructure/logger';
import { extractToolCalls } from '../utils/tool-calls';
import { Orchestrator } from '../orchestrator';
import { config } from '../config';

type ProcessedMessage = string;
type ProcessOptions = { signal?: AbortSignal; toolsEnabled?: boolean; onProgress?: (summary: string) => void };

const MAX_TOOL_ITERATIONS = 10; // Prevent infinite loops

/**
 * Process user messages and generate responses.
 * Commands are handled centrally. Non-commands are routed to the configured AI provider.
 */
async function handle(
  logger: ILogger,
  message: unknown,
  channel: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const safeMessage = toSafeMessage(message);

  logger.info(`Processing message from ${channel}: "${previewMessage(safeMessage)}"`);

  // Handle commands using centralized handler
  if (isCommand(safeMessage)) {
    const result = handleCommand(safeMessage, { source: channel });
    return result.response || '';
  }

  // Process AI messages with potential multi-round tool execution
  return await processAIMessage(logger, safeMessage, channel, options);
}

/**
 * Process AI messages with iterative tool call handling.
 * Continues executing tools until AI returns a final response without tool calls.
 * Sends progress summaries via onProgress callback.
 */
async function processAIMessage(
  logger: ILogger,
  userMessage: string,
  channel: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const orchestrator = new Orchestrator(logger);
  const signal = options?.signal || new AbortController().signal;
  const onProgress = options?.onProgress;
  
  let currentMessage = userMessage;
  let iteration = 0;

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration++;
    
    logger.info(`AI iteration ${iteration}`, { channel });
    
    // Send progress to user
    if (onProgress) {
      onProgress(`Processing (iteration ${iteration}/${MAX_TOOL_ITERATIONS})...`);
    }

    // Get AI response
    const aiResponse = await messageProvider(
      logger,
      currentMessage,
      channel,
      options
    );

    const responseText = typeof aiResponse === 'string' 
      ? aiResponse 
      : JSON.stringify(aiResponse);

    // Check for tool calls
    const toolCalls = extractToolCalls(responseText);

    if (toolCalls.length === 0) {
      // No more tool calls - return final response
      logger.info('AI returned final response (no tool calls)', { channel });
      if (onProgress) {
        onProgress('✅ Complete!');
      }
      return responseText;
    }

    // Execute tool calls
    logger.info(`Executing ${toolCalls.length} tool call(s)`, { channel, iteration });
    
    if (onProgress) {
      onProgress(`Executing ${toolCalls.length} tool(s): ${toolCalls.map(t => t.name).join(', ')}`);
    }
    
    const toolResults = await orchestrator.handleToolCalls(
      toolCalls,
      { model: config.AI.MODEL },
      signal
    );

    // Special handling for skill learning
    if (responseText.includes('get_skill')) {
      logger.info('Learning skill content', { channel });
      if (onProgress) {
        onProgress('Learning skill content...');
      }
      currentMessage = buildSkillLearningPrompt(toolResults);

      // Disable tools for learning iteration to force direct response
      options = { ...options, toolsEnabled: false };
    } else {
      // Build next prompt with tool results
      if (onProgress) {
        onProgress(`Processing tool results (${toolResults.length} chars)...`);
      }
      currentMessage = buildToolResultPrompt(responseText, toolResults);
    }
  }

  logger.warn('Max tool iterations reached', { 
    channel, 
    maxIterations: MAX_TOOL_ITERATIONS 
  });
  
  if (onProgress) {
    onProgress('⚠️ Max iterations reached');
  }
  
  return 'Maximum tool execution iterations reached. Please try rephrasing your request.';
}

/**
 * Build prompt for skill learning iteration
 */
function buildSkillLearningPrompt(
  skillContent: string
): string {
  return `**Extract how to use and execute**:\n${skillContent}\n If it is a curl execution, extract the url, method, headers and body and call respective tool to execute it.`;
}

/**
 * Build prompt with tool execution results for next AI iteration
 */
function buildToolResultPrompt(
  previousResponse: string,
  toolResults: string
): string {
  return `Previous response:\n${previousResponse}\n\nTool execution results:\n${toolResults}`;
}

export { handle };