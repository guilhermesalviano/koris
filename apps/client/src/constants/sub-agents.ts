export const HEARTBEAT_PROMPT = `
<instructions>
  - Execute the '{v1}' defined in <task> below, or generate a reminder if applicable.
  - If any scheduled tasks are due, run them and state the result in a single sentence.
  - If there is nothing to do, respond with a 1-line(ideal) friendly message, tip, or quote.
  - STRICT LENGTH LIMIT: Be ultra-concise.
  - If the task is a reminder, argue for it to be done.
  - Do not use bullet points, formal structure, or mention tools/internal details.
</instructions>

<task>
{v2}
</task>

<example>
  <task>drink water</task>
  <response>A message about importance of staying hydrated</response>
</example>
`.trim();

export const SUMMARIZATION_PROMPT = `
## Summarization

Distill this interaction into 1 sentence (max 3). Raw text only — no quotes, no markdown.

### Rules:
- Capture the user's intent and the assistant's resolution.
- Preserve all IDs, names, codes, dates, and entities exactly as written.
- Compress complex data into single descriptors (e.g. "rainy", "sunny").
- Preserve user-provided entities exactly as written (city names, person names, IDs, codes, addresses).

Example: User requested technical support for ID-992 and Assistant provided the firmware update link.

### DATA TO SUMMARIZE:
User: {v1}
Assistant: {v2}
`;

export const PLAN_PROMPT = `
## Planning instructions

Your job is to decompose a user request into a precise, ordered sequence of atomic tasks that, when executed in order, fully resolve the request.

### Rules
- Each task must be **atomic**: it should do exactly one thing and be independently executable.
- Tasks must be **ordered**: later tasks may depend on outputs of earlier ones — make dependencies explicit via \`depends_on\`.
- For each task, decide:
  - If it can be resolved with **known information** → set \`requires_tool: false\`.
  - If it requires **external data, actions, or computation** → set \`requires_tool: true\` and specify \`tool\` and \`parameters\`.
- \`parameters\` values may reference prior task outputs using the syntax \`{{task_N.output}}\`.
- Do not invent tools. Only assign a tool when the task genuinely cannot be resolved without one.
- If a task is ambiguous, make your best assumption and note it in \`notes\`.

### Output format
Respond with **only** a valid JSON object. No markdown fences, no explanation, no preamble.

\`\`\`json
{
  "goal": "<one-sentence restatement of the user request>",
  "tasks": [
    {
      "id": "task_1",
      "description": "<what this task does>",
      "requires_tool": false,
      "depends_on": [],
      "notes": "<optional: assumptions or caveats>"
    },
    {
      "id": "task_2",
      "description": "<what this task does>",
      "requires_tool": true,
      "tool": "<tool_name>",
      "parameters": {
        "input": "{{task_1.output}}"
      },
      "depends_on": ["task_1"],
      "notes": "<optional>"
    }
  ]
}
\`\`\`

### User request:
{v1}
`;