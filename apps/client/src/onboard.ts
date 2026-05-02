import { startTui, type TuiCommandResult, type TuiContext } from 'assistant-tui';

const SUPPORTED_CHANNELS = ['tui', 'web', 'telegram'] as const;
const ONBOARDING_COMMANDS = [
  { name: '/start', description: 'redraw the onboarding screen' },
  { name: '/help', description: 'show onboarding commands' },
  { name: '/status', description: 'show current onboarding progress' },
  { name: '/reset', description: 'restart the onboarding flow' },
  { name: '/clear', description: 'redraw the current step' },
  { name: '/exit', description: 'leave onboarding' },
];

export type OnboardingChannel = typeof SUPPORTED_CHANNELS[number];

export interface OnboardingAnswers {
  agentName: string;
  description: string;
  channels: OnboardingChannel[];
}

type OnboardingStep = 'agentName' | 'description' | 'channels' | 'complete';
type StepKey = Exclude<OnboardingStep, 'complete'>;
type TimelineState = 'complete' | 'active' | 'pending';
type OnboardingScreenMode = 'plain' | 'tui';

const ANSI = {
  reset: '\x1b[0m',
  black: '\x1b[30m',
  green: '\x1b[32m',
  dim: '\x1b[2m',
  bgWhite: '\x1b[47m',
} as const;

interface TimelineEntry {
  key: StepKey;
  label: string;
  description: string;
  prompt: string;
  example: string;
  value?: string;
  state: TimelineState;
}

interface ScreenSnapshot {
  answers: Partial<OnboardingAnswers>;
  notice?: string;
}

export function parseChannels(input: string): OnboardingChannel[] {
  const allowed = new Set<OnboardingChannel>(SUPPORTED_CHANNELS);
  const unique: OnboardingChannel[] = [];
  const invalid: string[] = [];

  for (const rawValue of input.split(',')) {
    const value = rawValue.trim().toLowerCase();
    if (!value) {
      continue;
    }

    if (!allowed.has(value as OnboardingChannel)) {
      invalid.push(value);
      continue;
    }

    const channel = value as OnboardingChannel;
    if (!unique.includes(channel)) {
      unique.push(channel);
    }
  }

  if (invalid.length > 0) {
    throw new Error(
      `Unsupported channel${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}. Use tui, web, or telegram.`,
    );
  }

  if (unique.length === 0) {
    throw new Error('Choose at least one channel: tui, web, or telegram.');
  }

  return unique;
}

export function buildLaunchCommand(channels: readonly OnboardingChannel[]): string {
  const flags: string[] = [];

  if (channels.includes('tui')) {
    flags.push('--tui');
  }

  if (channels.includes('web')) {
    flags.push('--web');
  }

  return flags.length > 0 ? `pnpm app -- ${flags.join(' ')}` : 'pnpm app';
}

export function buildOnboardingSummary(answers: OnboardingAnswers): string {
  const lines = [
    'Onboarding complete.',
    '',
    `Agent name: ${answers.agentName}`,
    `Description: ${answers.description}`,
    `Channels: ${answers.channels.join(', ')}`,
    '',
    `Launch command: ${buildLaunchCommand(answers.channels)}`,
    'Runtime note: --tui and --web are CLI flags. Telegram starts automatically when telegram.BOT_TOKEN is configured.',
  ];

  if (answers.channels.includes('telegram')) {
    lines.push('Telegram setup: add telegram.BOT_TOKEN to settings.json or TELEGRAM_BOT_TOKEN before launching.');
  }

  lines.push('Persistence note: this onboarding flow does not write settings.json yet.');

  return lines.join('\n');
}

export function buildOnboardingScreen(
  snapshot: ScreenSnapshot,
  maxWidth = 72,
  mode: OnboardingScreenMode = 'plain',
): string {
  const width = Math.max(40, maxWidth);
  const lines: string[] = [
    'Koris Agent onboarding',
    'A step-by-step TUI setup flow with a persistent left rail.',
    '',
  ];
  const entries = getTimelineEntries(snapshot.answers);

  for (const [index, entry] of entries.entries()) {
    lines.push('│');
    lines.push(formatTimelineHeader(entry, index, mode));
    pushWrapped(lines, '│    ', entry.description, width);

    if (entry.value) {
      pushWrapped(lines, '│    current: ', entry.value, width);
    }

    if (entry.state === 'active') {
      pushWrapped(lines, '│    prompt: ', entry.prompt, width);
      pushWrapped(lines, '│    example: ', entry.example, width);
    }
  }

  lines.push('│');

  if (snapshot.notice) {
    pushWrapped(lines, '├─ note: ', snapshot.notice, width);
  }

  if (isComplete(snapshot.answers)) {
    const answers = snapshot.answers as OnboardingAnswers;
    pushWrapped(lines, '├─ launch: ', buildLaunchCommand(answers.channels), width);
    pushWrapped(
      lines,
      '├─ runtime: ',
      '--tui and --web are CLI flags. Telegram starts automatically when telegram.BOT_TOKEN is configured.',
      width,
    );

    if (answers.channels.includes('telegram')) {
      pushWrapped(
        lines,
        '├─ telegram: ',
        'Add telegram.BOT_TOKEN to settings.json or TELEGRAM_BOT_TOKEN before launching.',
        width,
      );
    }

    pushWrapped(lines, '╰─ persistence: ', 'This wizard does not write settings.json yet.', width);
  } else {
    pushWrapped(lines, '╰─ commands: ', '/status /reset /clear /exit', width);
  }

  return lines.join('\n');
}

export function buildOnboardingHelp(maxWidth = 72): string {
  const width = Math.max(40, maxWidth);
  const lines = ['Onboarding commands', '│'];

  pushWrapped(lines, '├─ /start: ', 'redraw the onboarding screen', width);
  pushWrapped(lines, '├─ /help: ', 'show the onboarding command list', width);
  pushWrapped(lines, '├─ /status: ', 'show the current step and captured values', width);
  pushWrapped(lines, '├─ /reset: ', 'clear the draft and restart from step 1', width);
  pushWrapped(lines, '├─ /clear: ', 'redraw the current step screen', width);
  pushWrapped(lines, '╰─ /exit: ', 'leave onboarding', width);

  return lines.join('\n');
}

export class Onboard {
  private answers: Partial<OnboardingAnswers> = {};
  private notice = 'Follow the active step and press Enter after each answer.';

  async run(): Promise<void> {
    startTui({
      title: 'koris-agent onboarding',
      fixedInput: true,
      spinner: false,
      answerDoneSound: false,
      assistantPrefix: '◆',
      inputCursorMark: '>',
      placeholder: 'type your answer and press Enter',
      commands: ONBOARDING_COMMANDS,
      footerText: () => this.getFooterText(),
      renderWelcome: (ctx) => this.renderWelcome(ctx),
      onCommand: async (command, ctx) => this.handleCommand(command, ctx),
      onInput: async (input, ctx) => this.handleInput(input, ctx),
    });
  }

  private handleCommand(command: string, ctx: TuiContext): TuiCommandResult {
    const normalized = command.trim().toLowerCase().split(/\s+/, 1)[0];

    switch (normalized) {
      case '/start':
      case '/clear':
        this.notice = 'Screen refreshed.';
        return { handled: true, action: 'clear' };

      case '/help':
        return {
          handled: true,
          action: 'none',
          response: buildOnboardingHelp(this.getMaxContentWidth(ctx)),
        };

      case '/status':
        return {
          handled: true,
          action: 'none',
          response: buildOnboardingScreen(
            { answers: this.answers, notice: this.notice },
            this.getMaxContentWidth(ctx),
            'tui',
          ),
        };

      case '/reset':
        this.answers = {};
        this.notice = 'Draft cleared. Back to step 1.';
        return { handled: true, action: 'clear' };

      case '/exit':
      case '/quit':
      case '/bye':
        return { handled: true, action: 'exit', response: 'Leaving onboarding.' };

      default:
        return {
          handled: true,
          action: 'none',
          response: `Unknown command: ${command}\nType /help for available commands.`,
        };
    }
  }

  private handleInput(input: string, ctx: TuiContext): void {
    switch (this.getCurrentStep()) {
      case 'agentName': {
        const agentName = normalizeText(input);
        if (!agentName) {
          throw new Error('Agent name cannot be empty.');
        }

        this.answers.agentName = agentName;
        this.notice = `Captured agent name: ${agentName}`;
        break;
      }

      case 'description': {
        const description = normalizeText(input);
        if (!description) {
          throw new Error('Description cannot be empty.');
        }

        this.answers.description = description;
        this.notice = 'Captured the agent description.';
        break;
      }

      case 'channels': {
        const channels = parseChannels(input);
        this.answers.channels = channels;
        this.notice = `Onboarding complete for channels: ${channels.join(', ')}.`;
        break;
      }

      case 'complete':
        this.notice = 'Onboarding is already complete. Use /reset to start over or /exit to leave.';
        break;
    }

    ctx.redraw();
  }

  private renderWelcome(ctx: TuiContext): void {
    const { colors, println } = ctx;
    const screen = buildOnboardingScreen(
      { answers: this.answers, notice: this.notice },
      this.getMaxContentWidth(ctx),
      'tui',
    );

    const [title, subtitle, ...rest] = screen.split('\n');
    println(`${colors.bright}${title}${colors.reset}`);
    println(`${colors.dim}${subtitle}${colors.reset}`);

    for (const line of rest) {
      println(line);
    }

    println();
    println(`${colors.dim}Type /help for onboarding commands.${colors.reset}`);
    println();
  }

  private getCurrentStep(): OnboardingStep {
    if (!this.answers.agentName) {
      return 'agentName';
    }

    if (!this.answers.description) {
      return 'description';
    }

    if (!this.answers.channels) {
      return 'channels';
    }

    return 'complete';
  }

  private getFooterText(): string {
    if (this.getCurrentStep() === 'complete') {
      return 'onboarding complete  |  /status /reset /exit';
    }

    return `step ${this.getCompletedStepCount() + 1}/3  |  /status /reset /exit`;
  }

  private getCompletedStepCount(): number {
    let count = 0;

    if (this.answers.agentName) {
      count += 1;
    }

    if (this.answers.description) {
      count += 1;
    }

    if (this.answers.channels) {
      count += 1;
    }

    return count;
  }

  private getMaxContentWidth(ctx: TuiContext): number {
    return Math.max(48, ctx.terminalWidth - 6);
  }
}

function getTimelineEntries(answers: Partial<OnboardingAnswers>): TimelineEntry[] {
  const currentStep = getCurrentStepFromAnswers(answers);

  return [
    {
      key: 'agentName',
      label: 'Agent name',
      description: 'Choose the short name that identifies this agent in your workflow.',
      prompt: 'What should this agent be called?',
      example: 'example: Kori reviewer',
      value: answers.agentName,
      state: getTimelineState('agentName', currentStep),
    },
    {
      key: 'description',
      label: 'Description',
      description: 'Describe the job this agent should perform in one sentence.',
      prompt: 'What should this agent help you do?',
      example: 'example: Review pull requests and summarize risky changes.',
      value: answers.description,
      state: getTimelineState('description', currentStep),
    },
    {
      key: 'channels',
      label: 'Channels',
      description: 'Pick where this agent should run so launch flags are clear from day one.',
      prompt: 'Which channels should it use?',
      example: 'example: tui, web',
      value: answers.channels?.join(', '),
      state: getTimelineState('channels', currentStep),
    },
  ];
}

function getTimelineState(step: StepKey, currentStep: OnboardingStep): TimelineState {
  if (currentStep === 'complete') {
    return 'complete';
  }

  const order: StepKey[] = ['agentName', 'description', 'channels'];
  const stepIndex = order.indexOf(step);
  const currentIndex = order.indexOf(currentStep);

  if (stepIndex < currentIndex) {
    return 'complete';
  }

  if (stepIndex === currentIndex) {
    return 'active';
  }

  return 'pending';
}

function getCurrentStepFromAnswers(answers: Partial<OnboardingAnswers>): OnboardingStep {
  if (!answers.agentName) {
    return 'agentName';
  }

  if (!answers.description) {
    return 'description';
  }

  if (!answers.channels) {
    return 'channels';
  }

  return 'complete';
}

function isComplete(answers: Partial<OnboardingAnswers>): answers is OnboardingAnswers {
  return Boolean(answers.agentName && answers.description && answers.channels);
}

function timelineIcon(state: TimelineState): string {
  switch (state) {
    case 'complete':
      return '●';
    case 'active':
      return '◉';
    case 'pending':
      return '○';
  }
}

function timelineTag(state: TimelineState): string {
  switch (state) {
    case 'complete':
      return '  done';
    case 'active':
      return '';
    case 'pending':
      return '';
  }
}

function formatTimelineHeader(
  entry: TimelineEntry,
  index: number,
  mode: OnboardingScreenMode,
): string {
  const content = `${timelineIcon(entry.state)} ${index + 1}. ${entry.label}${timelineTag(entry.state)}`;
  if (mode !== 'tui') {
    return `├─ ${content}`;
  }

  switch (entry.state) {
    case 'complete':
      return `├─ ${ANSI.green}${content}${ANSI.reset}`;
    case 'active':
      return `├─ ${ANSI.bgWhite}${ANSI.black} ${content} ${ANSI.reset}`;
    case 'pending':
      return `├─ ${ANSI.dim}${content}${ANSI.reset}`;
  }
}

function pushWrapped(lines: string[], prefix: string, text: string, maxWidth: number): void {
  const availableWidth = Math.max(16, maxWidth - prefix.length);
  const wrapped = wrapPlainText(text, availableWidth);

  for (const [index, line] of wrapped.entries()) {
    const currentPrefix = index === 0 ? prefix : ' '.repeat(prefix.length);
    lines.push(`${currentPrefix}${line}`);
  }
}

function wrapPlainText(text: string, maxWidth: number): string[] {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [''];
  }

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    let remainder = word;
    while (remainder.length > maxWidth) {
      lines.push(remainder.slice(0, maxWidth));
      remainder = remainder.slice(maxWidth);
    }
    current = remainder;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

const onboard = new Onboard();

if (require.main === module) {
  onboard.run().catch((error) => {
    console.error('An error occurred during onboarding:', error);
    process.exit(1);
  });
}
