import { handleCommand, isCommand } from './commands';
import { previewMessage, toSafeMessage } from './helpers';
import { messageProvider } from './chat/message-provider';
import { ILogger } from '../../infrastructure/logger';
import { extractToolCalls } from '../../utils/tool-calls';
import { ToolsOrchestrator } from '../tools-orchestrator';
import { config } from '../../config';

type ProcessedMessage = string;
type ProcessOptions = { signal?: AbortSignal; toolsEnabled?: boolean; onProgress?: (summary: string) => void };

const MAX_TOOL_ITERATIONS = 10;

/**
 * Process user messages and generate responses.
 * Commands are handled centrally. Non-commands are routed to the configured AI provider.
 */
async function handle(
  logger: ILogger,
  message: unknown,
  channel: string,
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
 * Optimizes skill execution: doesn't loop after successful skill execution.
 */
async function processAIMessage(
  logger: ILogger,
  userMessage: string,
  channel: string,
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const toolsOrchestrator = new ToolsOrchestrator(logger);
  const signal = options?.signal || new AbortController().signal;
  const onProgress = options?.onProgress;
  
  let currentMessage = userMessage;
  let processStatus = 'initializing'; // Track processing status for better logging and progress updates
  let iteration = 0;
  let isSkillExecution = false; // Track if we're in skill execution mode

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration++;
    
    logger.info(`AI iteration ${iteration}`, { channel });
    
    // Send progress to user
    if (onProgress) {
      onProgress(`${processStatus || 'Processing'} (iteration ${iteration}/${MAX_TOOL_ITERATIONS})...`);
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

    const toolCalls = extractToolCalls(responseText);

    if (toolCalls.length === 0) {
      logger.info('AI returned final response (no tool calls)', { channel });
      return responseText;
    }

    // Execute tool calls
    logger.info(`Executing tool call(s)`, { channel, iteration });
    
    if (onProgress) {
      onProgress(`Executing tool(s): ${toolCalls.map(t => t.name).join(', ')}`);
    }
    
    const toolResults = await toolsOrchestrator.handle(
      toolCalls,
      { model: config.AI.MODEL },
      signal
    );

    // Special handling for skill learning
    if (toolCalls.some(t => t.name === 'get_skill')) {
      logger.info('Learning skill content', { channel });
      processStatus = 'Learning skill content';
      currentMessage = buildSkillLearningPrompt(toolResults, userMessage);

      // Keep tools enabled and mark that we're in skill execution mode
      options = { ...options, toolsEnabled: true };
      isSkillExecution = true;
    } 
    // If we're in skill execution and just executed a tool (curl_request, etc.)
    else if (isSkillExecution && toolCalls.some(t => ['curl_request', 'execute_command'].includes(t.name))) {
      logger.info('Skill execution complete, returning result', { channel });
      processStatus = 'Skill executed. Extracting response...';
      
      // Build a message asking AI to provide final answer based on skill execution
      currentMessage = buildSkillResponsePrompt(userMessage, toolResults);
    }
    else {
      // if no AI iteration needed, return tool results directly
      logger.info('Continuing AI processing with tool results', { channel });
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
 * Build prompt for skill learning and execution
 * Instructs AI to: 1) understand the skill, 2) map user request to skill instructions, 3) execute commands
 */
function buildSkillLearningPrompt(
  skillContent: string,
  originalUserRequest: string
): string {
  return `You have just learned a skill. Here is the skill documentation:

${skillContent}

---

ORIGINAL USER REQUEST: "${originalUserRequest}"

NOW DO THIS:
1. Read the skill documentation above carefully
2. Understand what this skill does and how to use it
3. Map the user's request to the appropriate skill instructions
4. For API/curl requests in the skill:
   - Extract the complete URL (with query parameters if needed)
   - Extract the HTTP method (GET, POST, PUT, DELETE, etc.)
   - Extract any headers or authentication required
   - Extract the request body if present
   - Call the curl_request tool with these parameters
5. After executing the curl request, analyze the response and provide a clear answer to the user

Remember: Use the curl_request tool to execute any HTTP/API calls shown in the skill.`;
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

/**
 * Build prompt for final response after skill execution
 * This is the FINAL iteration - AI should provide a complete answer based on skill results
 */
function buildSkillResponsePrompt(
  userRequest: string,
  skillExecutionResults: string
): string {
  return `The skill has been executed successfully. Here are the results:

${skillExecutionResults}

---

USER'S ORIGINAL REQUEST: "${userRequest}"

Based on these results, provide a clear, complete answer to the user. Do NOT call any more tools. Just provide the final answer using the data from the skill execution.`;
}

export { handle };