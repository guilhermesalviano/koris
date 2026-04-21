
/**
 * Build prompt for skill learning and execution
 * Instructs AI to: 1) understand the skill, 2) map user request to skill instructions, 3) execute commands
 */
export function buildSkillLearningPrompt(
  skillName: string,
  skillContent: string,
): string {
  return `
You have just learned how to use "${skillName}" skill. Here is the skill documentation:
${skillContent}
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
  - Do NOT add any extra arguments, shell pipes, jq, grep, awk, sed, or transformations unless explicitly shown in the skill documentation
5. After executing the curl request, analyze the response and provide a clear answer to the user
Remember: Use the curl_request tool to execute any HTTP/API calls shown in the skill.
---`;
}

/**
 * Build prompt with tool execution results for next AI iteration
 */
export function buildToolResultPrompt(
  originalUserRequest: string,
  toolResults: string
): string {
  return `
Analyze the tool execution results below to answer the user's request. 
Extract the relevant information from the results and provide a clear, direct answer. Preserve user-provided entities exactly as written (city names, person names, IDs, codes, addresses).

<previous_context>
${originalUserRequest}
</previous_context>

<tool_results>
${toolResults}
</tool_results>
`;
}

export function buildSkillPrompt(
  userRequest: string,
  skillDocumentation: string
): string {
  return `
    Answer the user request using ONLY the skills detailed in the provided documentation. Do not use external knowledge.

    <user_request>
    ${userRequest}
    </user_request>

    <skills_documentation>
    ${skillDocumentation}
    </skills_documentation>
  `;
}

/**
 * Build prompt for final response after skill execution
 * This is the FINAL iteration - AI should provide a complete answer based on skill results
 */
export function buildSkillResponsePrompt(
  // userRequest: string,
  skillExecutionResults: string
): string {
  return `The skill has been executed successfully. Here are the results:
${skillExecutionResults}
Based on these results, provide an answer to the user.
---`;
}
// Do NOT call any more tools. Just provide the final answer using the data from the skill execution.
// USER'S ORIGINAL REQUEST: "${userRequest}"