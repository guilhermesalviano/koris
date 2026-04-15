
/**
 * Build prompt for skill learning and execution
 * Instructs AI to: 1) understand the skill, 2) map user request to skill instructions, 3) execute commands
 */
export function buildSkillLearningPrompt(
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
export function buildToolResultPrompt(
  previousResponse: string,
  toolResults: string
): string {
  return `Previous response:\n${previousResponse}\n\nTool execution results:\n${toolResults}`;
}

/**
 * Build prompt for final response after skill execution
 * This is the FINAL iteration - AI should provide a complete answer based on skill results
 */
export function buildSkillResponsePrompt(
  userRequest: string,
  skillExecutionResults: string
): string {
  return `The skill has been executed successfully. Here are the results:

${skillExecutionResults}

---

USER'S ORIGINAL REQUEST: "${userRequest}"

Based on these results, provide a clear, complete answer to the user. Do NOT call any more tools. Just provide the final answer using the data from the skill execution.`;
}