import { startTui, type TuiCommandResult, type TuiContext, type TuiKeypress } from 'assistant-tui';

const ONBOARDING_COMMANDS = [
  { name: '/start', description: 'redraw the onboarding screen' },
  { name: '/help', description: 'show onboarding commands' },
  { name: '/status', description: 'show current onboarding progress' },
  { name: '/reset', description: 'restart the onboarding flow' },
  { name: '/clear', description: 'redraw the current step' },
  { name: '/exit', description: 'leave onboarding' },
];

const SUPPORTED_CHANNELS = ['telegram', 'discord'] as const;
const SUPPORTED_PROVIDERS = ['ollama', 'openai', 'anthropic', 'deepseek'] as const;
const BOOLEAN_OPTIONS = ['true', 'false'] as const;
const PERSONAL_DETAIL_STEP_KEYS = new Set<StepKey>([
  'personalName',
  'personalGender',
  'personalBirthday',
  'personalLocation',
  'personalOccupation',
]);

type OnboardingScreenMode = 'plain' | 'tui';
type TimelineState = 'complete' | 'active' | 'pending';
type PersonalInfoKey = 'name' | 'gender' | 'birthday' | 'location' | 'occupation';

export type OnboardingChannel = typeof SUPPORTED_CHANNELS[number];
export type OnboardingProvider = typeof SUPPORTED_PROVIDERS[number];
export type OnboardingStep =
  | 'channels'
  | 'telegramToken'
  | 'provider'
  | 'providerUrl'
  | 'providerApiToken'
  | 'personalInformation'
  | 'personalName'
  | 'personalGender'
  | 'personalBirthday'
  | 'personalLocation'
  | 'personalOccupation'
  | 'complete';

type StepKey = Exclude<OnboardingStep, 'complete'>;

export interface OnboardingAnswers {
  channels: OnboardingChannel[];
  telegramToken?: string;
  provider: OnboardingProvider;
  providerUrl?: string;
  providerApiToken?: string;
  personalInfo?: {
    enabled?: boolean;
    name?: string;
    gender?: string;
    birthday?: string;
    location?: string;
    occupation?: string;
  };
}

interface ScreenSnapshot {
  answers: Partial<OnboardingAnswers>;
  skippedSteps?: readonly StepKey[];
  selectedOption?: string;
  selectedOptions?: readonly string[];
  inputValue?: string;
  notice?: string;
}

interface StepDefinition {
  key: StepKey;
  label: string;
  description: string;
  placeholder?: string;
  options?: readonly string[];
  optional?: boolean;
  getValue(answers: Partial<OnboardingAnswers>, skippedSteps: ReadonlySet<StepKey>): string | undefined;
}

interface TimelineEntry extends StepDefinition {
  state: TimelineState;
  value?: string;
}

const ANSI = {
  reset: '\x1b[0m',
  black: '\x1b[30m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bgWhite: '\x1b[47m',
} as const;

const STEP_DEFINITIONS: readonly StepDefinition[] = [
  {
    key: 'channels',
    label: 'Channel',
    description: 'Choose one or more runtime channels for this agent.',
    options: SUPPORTED_CHANNELS,
    getValue: (answers, skippedSteps) =>
      skippedSteps.has('channels') ? 'skipped' : answers.channels?.join(', '),
  },
  {
    key: 'telegramToken',
    label: 'Telegram bot token',
    description: 'Set TELEGRAM_BOT_TOKEN for the Telegram channel.',
    placeholder: '123456:telegram-bot-token',
    getValue: (answers, skippedSteps) => {
      if (skippedSteps.has('telegramToken')) return 'skipped';
      return answers.telegramToken ? 'configured' : undefined;
    },
  },
  {
    key: 'provider',
    label: 'Provider',
    description: 'Choose which AI provider this agent should use.',
    options: SUPPORTED_PROVIDERS,
    getValue: (answers, skippedSteps) =>
      skippedSteps.has('provider') ? 'skipped' : answers.provider,
  },
  {
    key: 'providerApiToken',
    label: 'API token',
    description: 'Set an API token, press Enter, or type skip to leave it empty.',
    placeholder: '',
    optional: true,
    getValue: (answers, skippedSteps) => {
      if (skippedSteps.has('providerApiToken')) return 'empty';
      if (!hasAnswer(answers, 'providerApiToken')) return undefined;
      return 'configured';
    },
  },
  {
    key: 'providerUrl',
    label: 'Provider URL',
    description: 'Set the provider base URL or type skip to keep the default.',
    placeholder: 'http://localhost:11434',
    optional: true,
    getValue: (answers, skippedSteps) => {
      if (skippedSteps.has('providerUrl')) return 'default';
      return answers.providerUrl;
    },
  },
  {
    key: 'personalInformation',
    label: 'Your Information',
    description: 'Choose whether the agent should store your personal context fields.',
    options: BOOLEAN_OPTIONS,
    getValue: (answers, skippedSteps) => getPersonalInformationEnabledValue(answers, skippedSteps),
  },
  {
    key: 'personalName',
    label: 'Your name',
    description: 'Store the human name used in agent context.',
    placeholder: 'Joe doe',
    optional: true,
    getValue: (answers, skippedSteps) => getPersonalInfoValue('name', answers, skippedSteps),
  },
  {
    key: 'personalGender',
    label: 'Gender',
    description: 'Store the gender field used by the prompt context.',
    placeholder: 'male',
    optional: true,
    getValue: (answers, skippedSteps) => getPersonalInfoValue('gender', answers, skippedSteps),
  },
  {
    key: 'personalBirthday',
    label: 'Birthday',
    description: 'Store the birthday used in personal context.',
    placeholder: '1985-03-01',
    optional: true,
    getValue: (answers, skippedSteps) => getPersonalInfoValue('birthday', answers, skippedSteps),
  },
  {
    key: 'personalLocation',
    label: 'Location',
    description: 'Store the location used in personal context.',
    placeholder: 'New York, United States',
    optional: true,
    getValue: (answers, skippedSteps) => getPersonalInfoValue('location', answers, skippedSteps),
  },
  {
    key: 'personalOccupation',
    label: 'Occupation',
    description: 'Store the occupation used in personal context.',
    placeholder: 'Software Engineer',
    optional: true,
    getValue: (answers, skippedSteps) => getPersonalInfoValue('occupation', answers, skippedSteps),
  },
];

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
      `Unsupported channel${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}. Use ${formatOptionsLabel(SUPPORTED_CHANNELS)}.`,
    );
  }

  if (unique.length === 0) {
    throw new Error(`Choose a supported channel: ${formatOptionsLabel(SUPPORTED_CHANNELS)}.`);
  }

  return unique;
}

export function buildLaunchCommand(channels: readonly OnboardingChannel[]): string {
  const flags = channels.map((channel) => `--${channel}`);
  return flags.length > 0 ? `pnpm app -- ${flags.join(' ')}` : 'pnpm app';
}

export function buildOnboardingSummary(answers: OnboardingAnswers): string {
  const lines = [
    'Onboarding complete.',
    '',
    `Channels: ${answers.channels.join(', ')}`,
    ...(usesTelegramChannel(answers) ? ['Telegram token: configured'] : []),
    `Provider: ${answers.provider}`,
    `Provider URL: ${answers.providerUrl || 'default'}`,
    `Provider API token: configured`,
  ];

  const personalLines = [
    ['Personal name', answers.personalInfo?.name],
    ['Gender', answers.personalInfo?.gender],
    ['Birthday', answers.personalInfo?.birthday],
    ['Location', answers.personalInfo?.location],
    ['Occupation', answers.personalInfo?.occupation],
  ] as const;

  for (const [label, value] of personalLines) {
    if (value) {
      lines.push(`${label}: ${value}`);
    }
  }

  // lines.push(
  //   '',
  //   `Launch command: ${buildLaunchCommand(answers.channels)}`,
  //   'Runtime note: selected channels are launched through CLI flags.',
  //   'Persistence note: this onboarding flow does not write settings.json yet.',
  // );

  return lines.join('\n');
}

export function buildOnboardingScreen(
  snapshot: ScreenSnapshot,
  maxWidth = 72,
  mode: OnboardingScreenMode = 'plain',
): string {
  const width = Math.max(40, maxWidth);
  const skippedSteps = new Set(snapshot.skippedSteps ?? []);
  const lines: string[] = [
    'Koris Agent onboarding',
    'A step-by-step TUI setup flow with a persistent left rail.',
    '',
  ];
  const entries = getTimelineEntries(snapshot.answers, skippedSteps).filter((entry) => entry.state !== 'pending');

  for (const [index, entry] of entries.entries()) {
    lines.push('│');
    lines.push(formatTimelineHeader(entry, index, mode));

    if (entry.state === 'active') {
      // pushWrapped(lines, '│    prompt: ', entry.prompt, width);
      if (entry.options && entry.options.length > 0) {
        lines.push('│    options:');
        renderPickableOptions(
          lines,
          entry.key,
          entry.options,
          snapshot.selectedOption,
          snapshot.selectedOptions,
          width,
          mode,
        );
        pushWrapped(lines, '│    pick: ', getPickInstruction(entry.key), width);
      } else {
        pushWrapped(lines, '│    input: ', formatInlineInput(snapshot.inputValue, entry.placeholder, mode), width);
      }
    }
  }

  lines.push('│');

  // if (snapshot.notice) {
  //   pushWrapped(lines, '├─ note: ', snapshot.notice, width);
  // }

  if (isComplete(snapshot.answers, skippedSteps)) {
    const answers = snapshot.answers as OnboardingAnswers;
    const summary = buildOnboardingSummary(answers).split('\n');

    for (const [index, line] of summary.entries()) {
      if (!line) {
        lines.push('│');
        continue;
      }

      const prefix = index === summary.length - 1 ? '╰─ ' : '├─ ';
      pushWrapped(lines, prefix, line, width);
    }
  } 
  // else {
  //   pushWrapped(lines, '╰─ commands: ', '/status /reset /clear /exit', width);
  // }

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
  pushWrapped(lines, '├─ supported_channels: ', formatOptionsLabel(SUPPORTED_CHANNELS), width);
  pushWrapped(lines, '├─ supported_providers: ', formatOptionsLabel(SUPPORTED_PROVIDERS), width);
  pushWrapped(lines, '╰─ /exit: ', 'leave onboarding', width);

  return lines.join('\n');
}

export class Onboard {
  private answers: Partial<OnboardingAnswers> = {};
  private skippedSteps = new Set<StepKey>();
  private selectedChannels = new Set<OnboardingChannel>();
  private pickerStep?: StepKey;
  private pickerIndex = 0;
  private notice = 'Follow the active step and press Enter after each answer. Type skip for optional fields.';

  async run(): Promise<void> {
    startTui({
      title: 'koris-agent onboarding',
      fixedInput: true,
      inputMode: 'screen',
      allowEmptyInput: true,
      spinner: false,
      answerDoneSound: false,
      assistantPrefix: '◆',
      prompt: '',
      inputCursorMark: '',
      placeholder: '',
      commands: ONBOARDING_COMMANDS,
      footerText: () => this.getFooterText(),
      renderWelcome: (ctx) => this.renderWelcome(ctx),
      onCommand: async (command, ctx) => this.handleCommand(command, ctx),
      onKeypress: (ch: string, key: TuiKeypress | undefined, ctx: TuiContext) => this.handleKeypress(ch, key, ctx),
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
            {
              answers: this.answers,
              skippedSteps: [...this.skippedSteps],
              selectedOption: this.getSelectedOption(getCurrentStepFromState(this.answers, this.skippedSteps)),
              selectedOptions: this.getSelectedOptions(getCurrentStepFromState(this.answers, this.skippedSteps)),
              notice: this.notice,
            },
            this.getMaxContentWidth(ctx),
            'tui',
          ),
        };

      case '/reset':
        this.answers = {};
        this.skippedSteps.clear();
        this.selectedChannels.clear();
        this.pickerStep = undefined;
        this.pickerIndex = 0;
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
    const step = getCurrentStepFromState(this.answers, this.skippedSteps);
    if (step === 'complete') {
      this.notice = 'Onboarding is already complete. Use /reset to start over or /exit to leave.';
      ctx.redraw();
      return;
    }

    const definition = getStepDefinition(step);
    const normalized = normalizeText(input);

    if (definition.optional && isSkipInput(normalized)) {
      this.applySkip(step);
      this.notice = `${definition.label} skipped.`;
      ctx.redraw();
      return;
    }

    switch (step) {
      case 'channels':
        this.answers.channels = parseChannels(normalized);
        this.selectedChannels = new Set(this.answers.channels);
        if (!usesTelegramChannel(this.answers)) {
          delete this.answers.telegramToken;
        }
        this.notice = `Captured channels: ${this.answers.channels.join(', ')}.`;
        this.pickerStep = undefined;
        break;

      case 'telegramToken':
        this.answers.telegramToken = normalized;
        this.notice = 'Captured Telegram bot token.';
        this.skippedSteps.delete(step);
        break;

      case 'provider':
        this.answers.provider = parseProvider(normalized);
        this.notice = `Captured provider: ${this.answers.provider}.`;
        this.pickerStep = undefined;
        break;

      case 'providerUrl':
        this.answers.providerUrl = normalized;
        this.notice = 'Captured provider URL.';
        this.skippedSteps.delete(step);
        break;

      case 'providerApiToken':
        this.answers.providerApiToken = normalized;
        this.notice = normalized ? 'Captured provider API token.' : 'Provider API token left empty.';
        this.skippedSteps.delete(step);
        break;

      case 'personalInformation':
        this.setPersonalInformationEnabled(parseBooleanOption(normalized));
        this.notice = `Personal information ${this.answers.personalInfo?.enabled ? 'enabled' : 'disabled'}.`;
        this.skippedSteps.delete(step);
        this.pickerStep = undefined;
        break;

      case 'personalName':
        this.setPersonalInfo('name', normalized);
        this.notice = 'Captured personal name.';
        this.skippedSteps.delete(step);
        break;

      case 'personalGender':
        this.setPersonalInfo('gender', normalized);
        this.notice = 'Captured gender.';
        this.skippedSteps.delete(step);
        break;

      case 'personalBirthday':
        this.setPersonalInfo('birthday', normalized);
        this.notice = 'Captured birthday.';
        this.skippedSteps.delete(step);
        break;

      case 'personalLocation':
        this.setPersonalInfo('location', normalized);
        this.notice = 'Captured location.';
        this.skippedSteps.delete(step);
        break;

      case 'personalOccupation':
        this.setPersonalInfo('occupation', normalized);
        this.notice = 'Captured occupation.';
        this.skippedSteps.delete(step);
        break;
    }

    const nextStep = getCurrentStepFromState(this.answers, this.skippedSteps);
    if (!this.getPickableOptions(nextStep)) {
      ctx.setInputValue('');
    }

    ctx.redraw();
  }

  private renderWelcome(ctx: TuiContext): void {
    const { colors, println } = ctx;
    const currentStep = getCurrentStepFromState(this.answers, this.skippedSteps);
    const selectedOption = this.getSelectedOption(currentStep);
    const screen = buildOnboardingScreen(
      {
        answers: this.answers,
        skippedSteps: [...this.skippedSteps],
        selectedOption,
        selectedOptions: this.getSelectedOptions(currentStep),
        inputValue: this.getPickableOptions(currentStep) ? undefined : ctx.getInputValue(),
        notice: this.notice,
      },
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
    // println(`${colors.dim}Type /help for onboarding commands.${colors.reset}`);
    // println();

    if (this.getPickableOptions(currentStep)) {
      ctx.setInputValue('');
    }
  }

  private getFooterText(): string {
    const totalSteps = getEnabledStepDefinitions(this.answers).length;
    const completedSteps = getCompletedStepCount(this.answers, this.skippedSteps);

    if (completedSteps >= totalSteps) {
      return 'onboarding complete  |  /status /reset /exit';
    }

    return `step ${completedSteps + 1}/${totalSteps}  |  /status /reset /exit`;
  }

  private getMaxContentWidth(ctx: TuiContext): number {
    return Math.max(48, ctx.terminalWidth - 6);
  }

  private applySkip(step: StepKey): void {
    this.skippedSteps.add(step);
    this.pickerStep = undefined;

    switch (step) {
      case 'providerUrl':
        delete this.answers.providerUrl;
        break;
      case 'providerApiToken':
        delete this.answers.providerApiToken;
        break;
      case 'telegramToken':
        delete this.answers.telegramToken;
        break;
      case 'personalInformation':
        delete this.answers.personalInfo;
        break;
      case 'personalName':
        this.clearPersonalInfo('name');
        break;
      case 'personalGender':
        this.clearPersonalInfo('gender');
        break;
      case 'personalBirthday':
        this.clearPersonalInfo('birthday');
        break;
      case 'personalLocation':
        this.clearPersonalInfo('location');
        break;
      case 'personalOccupation':
        this.clearPersonalInfo('occupation');
        break;
      case 'channels':
        this.selectedChannels.clear();
        break;
      case 'provider':
        break;
    }
  }

  private setPersonalInfo(key: PersonalInfoKey, value: string): void {
    this.answers.personalInfo = {
      ...this.answers.personalInfo,
      enabled: true,
      [key]: value,
    };
  }

  private setPersonalInformationEnabled(enabled: boolean): void {
    if (!enabled) {
      this.answers.personalInfo = { enabled: false };
      return;
    }

    this.answers.personalInfo = {
      ...this.answers.personalInfo,
      enabled: true,
    };
  }

  private clearPersonalInfo(key: PersonalInfoKey): void {
    if (!this.answers.personalInfo) {
      return;
    }

    delete this.answers.personalInfo[key];

    if (Object.keys(this.answers.personalInfo).length === 0) {
      delete this.answers.personalInfo;
    }
  }

  private handleKeypress(ch: string, key: TuiKeypress | undefined, ctx: TuiContext): boolean {
    const keyName = key?.name;
    const currentStep = getCurrentStepFromState(this.answers, this.skippedSteps);
    const options = this.getPickableOptions(currentStep);
    const inputValue = ctx.getInputValue();

    if (!this.isAllowedOnboardKey(ch, key, currentStep, inputValue)) {
      return true;
    }

    if (!options || options.length === 0 || currentStep === 'complete') {
      const defaultValue = currentStep === 'complete'
        ? undefined
        : this.getTextInputDefault(currentStep);
      if ((keyName === 'return' || keyName === 'enter') && !inputValue.trim() && defaultValue) {
        ctx.setInputValue(defaultValue);
      }
      return false;
    }

    if (inputValue.trim().startsWith('/') || ch === '/') {
      return false;
    }

    this.ensurePickerState(currentStep, options);

    if (keyName === 'up' || keyName === 'down') {
      const delta = keyName === 'up' ? -1 : 1;
      this.pickerIndex = (this.pickerIndex + delta + options.length) % options.length;
      ctx.setInputValue('');
      ctx.redraw();
      return true;
    }

    if ((keyName === 'tab' || keyName === 'space') && currentStep === 'channels') {
      this.toggleChannelSelection(options[this.pickerIndex] as OnboardingChannel);
      ctx.setInputValue('');
      ctx.redraw();
      return true;
    }

    if (keyName === 'return' || keyName === 'enter') {
      this.commitPickableStep(currentStep);
      ctx.setInputValue('');
      ctx.redraw();
      return true;
    }

    if (
      keyName === 'backspace'
      || keyName === 'delete'
      || keyName === 'left'
      || keyName === 'right'
      || keyName === 'home'
      || keyName === 'end'
      || (typeof ch === 'string' && ch.length > 0 && ch.charCodeAt(0) >= 32)
    ) {
      return true;
    }

    return false;
  }

  private isAllowedOnboardKey(
    ch: string,
    key: TuiKeypress | undefined,
    step: OnboardingStep,
    inputValue: string,
  ): boolean {
    const keyName = key?.name;
    const isPrintable = typeof ch === 'string' && ch.length > 0 && ch.charCodeAt(0) >= 32;
    const isEditingKey =
      keyName === 'backspace'
      || keyName === 'delete'
      || keyName === 'left'
      || keyName === 'right'
      || keyName === 'home'
      || keyName === 'end';
    const isSubmitKey = keyName === 'return' || keyName === 'enter';
    const isCommandInput = inputValue.trim().startsWith('/') || ch === '/';

    if (key?.ctrl && keyName === 'c') {
      return true;
    }

    if (isCommandInput) {
      return isPrintable || isEditingKey || isSubmitKey || keyName === 'tab' || keyName === 'up' || keyName === 'down';
    }

    if (step === 'complete') {
      return false;
    }

    const options = this.getPickableOptions(step);
    if (options && options.length > 0) {
      if (keyName === 'up' || keyName === 'down' || isSubmitKey || isEditingKey) {
        return true;
      }

      return step === 'channels' && (keyName === 'tab' || keyName === 'space');
    }

    return isPrintable || isEditingKey || isSubmitKey;
  }

  private getPickableOptions(step: OnboardingStep): readonly string[] | undefined {
    if (step === 'complete') {
      return undefined;
    }

    return getStepDefinition(step).options;
  }

  private getTextInputDefault(step: Exclude<OnboardingStep, 'complete'>): string | undefined {
    return getStepDefinition(step).placeholder;
  }

  private getSelectedOption(step: OnboardingStep): string | undefined {
    const options = this.getPickableOptions(step);
    if (!options || options.length === 0 || step === 'complete') {
      return undefined;
    }

    this.ensurePickerState(step, options);
    return options[this.pickerIndex];
  }

  private getSelectedOptions(step: OnboardingStep): readonly string[] | undefined {
    if (step !== 'channels') {
      return undefined;
    }

    if (this.selectedChannels.size > 0) {
      return [...this.selectedChannels];
    }

    if (this.answers.channels && this.answers.channels.length > 0) {
      return [...this.answers.channels];
    }

    return undefined;
  }

  private ensurePickerState(step: StepKey, options: readonly string[]): void {
    if (this.pickerStep !== step) {
      this.pickerStep = step;
      this.pickerIndex = 0;
      return;
    }

    if (this.pickerIndex >= options.length) {
      this.pickerIndex = 0;
    }
  }

  private toggleChannelSelection(channel: OnboardingChannel): void {
    if (this.selectedChannels.has(channel)) {
      this.selectedChannels.delete(channel);
      return;
    }

    this.selectedChannels.add(channel);
  }

  private commitPickableStep(step: Exclude<OnboardingStep, 'complete'>): void {
    const selectedOption = this.getSelectedOption(step);
    if (!selectedOption) {
      return;
    }

    switch (step) {
      case 'channels': {
        const selectedChannels = this.selectedChannels.size > 0
          ? [...this.selectedChannels]
          : [selectedOption as OnboardingChannel];
        this.answers.channels = parseChannels(selectedChannels.join(', '));
        this.selectedChannels = new Set(this.answers.channels);
        if (!usesTelegramChannel(this.answers)) {
          delete this.answers.telegramToken;
        }
        this.notice = `Captured channels: ${this.answers.channels.join(', ')}.`;
        this.pickerStep = undefined;
        return;
      }

      case 'provider':
        this.answers.provider = parseProvider(selectedOption);
        this.notice = `Captured provider: ${this.answers.provider}.`;
        this.pickerStep = undefined;
        return;

      case 'personalInformation':
        this.setPersonalInformationEnabled(parseBooleanOption(selectedOption));
        this.notice = `Personal information ${this.answers.personalInfo?.enabled ? 'enabled' : 'disabled'}.`;
        this.pickerStep = undefined;
        return;

      case 'providerUrl':
      case 'providerApiToken':
      case 'telegramToken':
      case 'personalName':
      case 'personalGender':
      case 'personalBirthday':
      case 'personalLocation':
      case 'personalOccupation':
        return;
    }
  }
}

function getTimelineEntries(
  answers: Partial<OnboardingAnswers>,
  skippedSteps: ReadonlySet<StepKey>,
): TimelineEntry[] {
  const currentStep = getCurrentStepFromState(answers, skippedSteps);
  const definitions = getEnabledStepDefinitions(answers);

  return definitions.map((definition) => ({
    ...definition,
    value: definition.getValue(answers, skippedSteps),
    state: getTimelineState(
      definition.key,
      currentStep,
      definitions.map((entry) => entry.key),
    ),
  }));
}

function getTimelineState(
  step: StepKey,
  currentStep: OnboardingStep,
  orderedSteps: readonly StepKey[],
): TimelineState {
  if (currentStep === 'complete') {
    return 'complete';
  }

  const stepIndex = orderedSteps.indexOf(step);
  const currentIndex = orderedSteps.indexOf(currentStep);

  if (stepIndex < currentIndex) {
    return 'complete';
  }

  if (stepIndex === currentIndex) {
    return 'active';
  }

  return 'pending';
}

function getCurrentStepFromState(
  answers: Partial<OnboardingAnswers>,
  skippedSteps: ReadonlySet<StepKey>,
): OnboardingStep {
  for (const definition of getEnabledStepDefinitions(answers)) {
    if (!definition.getValue(answers, skippedSteps)) {
      return definition.key;
    }
  }

  return 'complete';
}

function getCompletedStepCount(
  answers: Partial<OnboardingAnswers>,
  skippedSteps: ReadonlySet<StepKey>,
): number {
  let completed = 0;

  for (const definition of getEnabledStepDefinitions(answers)) {
    if (definition.getValue(answers, skippedSteps)) {
      completed += 1;
    }
  }

  return completed;
}

function isComplete(
  answers: Partial<OnboardingAnswers>,
  skippedSteps: ReadonlySet<StepKey>,
): answers is OnboardingAnswers {
  return getCurrentStepFromState(answers, skippedSteps) === 'complete';
}

function getPersonalInfoValue(
  key: PersonalInfoKey,
  answers: Partial<OnboardingAnswers>,
  skippedSteps: ReadonlySet<StepKey>,
): string | undefined {
  const skipKey = personalInfoKeyToStep(key);
  if (skippedSteps.has(skipKey)) {
    return 'skipped';
  }

  return answers.personalInfo?.[key];
}

function getPersonalInformationEnabledValue(
  answers: Partial<OnboardingAnswers>,
  skippedSteps: ReadonlySet<StepKey>,
): string | undefined {
  if (skippedSteps.has('personalInformation')) {
    return 'skipped';
  }

  if (answers.personalInfo?.enabled === undefined) {
    return undefined;
  }

  return String(answers.personalInfo.enabled);
}

function personalInfoKeyToStep(key: PersonalInfoKey): Extract<StepKey, `personal${string}`> {
  switch (key) {
    case 'name':
      return 'personalName';
    case 'gender':
      return 'personalGender';
    case 'birthday':
      return 'personalBirthday';
    case 'location':
      return 'personalLocation';
    case 'occupation':
      return 'personalOccupation';
  }
}

function parseProvider(input: string): OnboardingProvider {
  const normalized = input.toLowerCase();
  if (SUPPORTED_PROVIDERS.includes(normalized as OnboardingProvider)) {
    return normalized as OnboardingProvider;
  }

  throw new Error(`Unsupported provider: ${input}. Use ${formatOptionsLabel(SUPPORTED_PROVIDERS)}.`);
}

function parseBooleanOption(input: string): boolean {
  const normalized = input.toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  throw new Error(`Unsupported value: ${input}. Use ${formatOptionsLabel(BOOLEAN_OPTIONS)}.`);
}

function formatOptionsLabel(options: readonly string[]): string {
  return options.join(', ');
}

function getEnabledStepDefinitions(answers: Partial<OnboardingAnswers>): StepDefinition[] {
  return STEP_DEFINITIONS.filter((definition) => {
    if (definition.key === 'telegramToken') {
      return usesTelegramChannel(answers);
    }

    if (!PERSONAL_DETAIL_STEP_KEYS.has(definition.key)) {
      return true;
    }

    return answers.personalInfo?.enabled === true;
  });
}

function usesTelegramChannel(answers: Partial<OnboardingAnswers>): boolean {
  return answers.channels?.includes('telegram') ?? false;
}

function formatInlineInput(
  value: string | undefined,
  placeholder: string | undefined,
  mode: OnboardingScreenMode,
): string {
  const cursor = mode === 'tui' ? `${ANSI.bgWhite}${ANSI.black} ${ANSI.reset}` : '';
  const trimmed = value ?? '';
  if (!trimmed) {
    const fallback = placeholder ? placeholder : '[type here]';
    if (mode !== 'tui') {
      return fallback;
    }

    const [head = ' ', ...tail] = fallback;
    return `${ANSI.bgWhite}${ANSI.black}${head}${ANSI.reset}${ANSI.yellow}${tail.join('')}${ANSI.reset}`;
  }

  return `${trimmed}${cursor}`;
}

function isSkipInput(input: string): boolean {
  return input.toLowerCase() === 'skip';
}

function getStepDefinition(step: StepKey): StepDefinition {
  const definition = STEP_DEFINITIONS.find((candidate) => candidate.key === step);
  if (!definition) {
    throw new Error(`Unknown onboarding step: ${step}`);
  }

  return definition;
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

function timelineTag(state: TimelineState, label?: string): string {
  switch (state) {
    case 'complete':
      return ` ─ ${label}`;
    case 'active':
      return ` ─ ${label}`;
    case 'pending':
      return ` ─ ${label}`;
  }
}

function formatTimelineHeader(
  entry: TimelineEntry,
  index: number,
  mode: OnboardingScreenMode,
): string {
  const content = `${timelineIcon(entry.state)} ${index + 1}. ${entry.label}${timelineTag(entry.state, entry.value ?? entry.description)}`;
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

function getPickInstruction(step: StepKey): string {
  if (step === 'channels') {
    return 'use ↑/↓ to move, Tab/Space to toggle, Enter to confirm';
  }

  return 'use ↑/↓ to move and Enter to confirm';
}

function renderPickableOptions(
  lines: string[],
  step: StepKey,
  options: readonly string[],
  selectedOption: string | undefined,
  selectedOptions: readonly string[] | undefined,
  maxWidth: number,
  mode: OnboardingScreenMode,
): void {
  const effectiveSelectedOption = selectedOption ?? options[0];
  const selectedSet = new Set(selectedOptions ?? []);
  const hasExplicitSelections = selectedSet.size > 0;

  for (const option of options) {
    const isSelected = option === effectiveSelectedOption;
    const isChecked = step === 'channels'
      ? (hasExplicitSelections ? selectedSet.has(option) : false)
      : isSelected;
    const optionLabel = step === 'channels' ? `[${isChecked ? 'x' : ' '}] ${option}` : option;
    const content = step === 'channels'
      ? optionLabel
      : `${isSelected ? '◉' : '○'} ${optionLabel}`;
    const rendered =
      mode === 'tui'
        ? (isSelected
          ? `${ANSI.bgWhite}${ANSI.black} ${content} ${ANSI.reset}`
          : `${ANSI.dim}${content}${ANSI.reset}`)
        : content;

    pushWrapped(lines, '│      ', rendered, maxWidth);
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

function hasAnswer<T extends object>(answers: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(answers, key);
}

const onboard = new Onboard();

if (require.main === module) {
  onboard.run().catch((error) => {
    console.error('An error occurred during onboarding:', error);
    process.exit(1);
  });
}
