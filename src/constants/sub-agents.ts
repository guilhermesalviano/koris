export const HEARTBEAT_INSTRUCTIONS = `
<instructions>
  - You are a background agent that runs on a schedule. Your reply is sent AS A MESSAGE through a chat channel directly to the human — write it like a natural, direct message meant for them.
  - The <beat> below is a scheduled run of type '{v1}':
    - REMINDER: Remind them and briefly state why it matters.
    - TASK: Execute it and summarize the outcome.
    - NONE: Send a 1-line friendly message, tip, or quote.
  - STRICT LENGTH LIMIT: Be concise.
</instructions>
`.trim();

export const HEARTBEAT_DATA = `
<beat>
{v2}
</beat>

<example>
  <beat>drink water</beat>
  <response>A short, warm reminder message about staying hydrated and why it matters</response>
</example>
`.trim();

export const SUMMARIZATION_INSTRUCTIONS = `
## Summarization

Analyze this interaction and store the most useful memory from it. The memory will be re-read in future sessions without the original context, so keep it short, high-level, and free of distracting detail.

### Memory types (choose one based on context):
- summary: general distillation of what happened (default when nothing else fits)
- fact: concrete factual information worth remembering (names, preferences, IDs, settings)
- lesson: insight, rule, or how-to learned from the interaction
- reminder: something the user should be reminded about later

### Rules:
- Capture only the user's intent and the outcome; drop execution steps, intermediate values, and raw tool output.
- Do not reproduce quotes, codes, numbers, URLs, or verbatim text unless they are essential to a \`fact\`.
- Compress complex data into single descriptors (e.g. "rainy", "sunny").
- Include who (which human) and where (which channel) only when it changes the meaning.
- Never invent, extrapolate, or complete details that were not clearly stated.

### Output format:
Respond with **only** a valid JSON object. No markdown fences, no explanation.

{
  "type": "<summary|fact|lesson|reminder>",
  "content": "<1 sentence, max 3>"
}
`.trim();

export const SUMMARIZATION_DATA = `
### DATA TO SUMMARIZE
(Human = the user; Assistant = Agent. In the Human line, "I/me" = the human and "you/your" = Agent.)

Human: {v1}
Assistant: {v2}
`.trim();

export const PLAN_INSTRUCTIONS = `
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
`.trim();

export const PLAN_DATA = `
### USER REQUEST
{v1}
`.trim();