import { USER_REQUEST_SECTION } from './prompt';

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

Analyze this interaction and store the most useful memory from it.

### Memory types (choose one based on context):
- summary: general distillation of what happened (default when nothing else fits)
- fact: concrete factual information worth remembering (names, preferences, IDs, settings)
- lesson: insight, rule, or how-to learned from the interaction
- reminder: something the user should be reminded about later

### Rules:
- Capture the user's intent and the assistant's resolution.
- Preserve all IDs, names, codes, dates, and entities exactly as written.
- Compress complex data into single descriptors (e.g. "rainy", "sunny").
- Include who (which human) and where (which channel) when relevant.

### Output format:
Respond with **only** a valid JSON object. No markdown fences, no explanation.

{
  "type": "<summary|fact|lesson|reminder>",
  "content": "<1 sentence, max 3>"
}

### DATA TO SUMMARIZE
(Human = the user; Assistant = Koris. In the Human line, "I/me" = the human and "you/your" = Koris.)

Human: {v1}
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

${USER_REQUEST_SECTION}
`;