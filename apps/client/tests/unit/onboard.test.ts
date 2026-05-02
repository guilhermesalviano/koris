import { describe, expect, it } from 'vitest';
import {
  buildLaunchCommand,
  buildOnboardingHelp,
  buildOnboardingScreen,
  buildOnboardingSummary,
  parseChannels,
} from '../../src/onboard';

describe('onboard helpers', () => {
  it('parses channel input with trimming, lowercase normalization, and deduplication', () => {
    expect(parseChannels(' TUI, web, telegram, tui ')).toEqual(['tui', 'web', 'telegram']);
  });

  it('rejects unsupported channels', () => {
    expect(() => parseChannels('slack')).toThrow(
      'Unsupported channel: slack. Use tui, web, or telegram.',
    );
  });

  it('builds launch commands from tui and web flags', () => {
    expect(buildLaunchCommand(['tui', 'web'])).toBe('pnpm app -- --tui --web');
    expect(buildLaunchCommand(['telegram'])).toBe('pnpm app');
  });

  it('includes telegram guidance in the onboarding summary when needed', () => {
    const summary = buildOnboardingSummary({
      agentName: 'Kori',
      description: 'Helps me review code changes.',
      channels: ['tui', 'telegram'],
    });

    expect(summary).toContain('Agent name: Kori');
    expect(summary).toContain('Channels: tui, telegram');
    expect(summary).toContain('Telegram setup: add telegram.BOT_TOKEN');
    expect(summary).toContain('Persistence note: this onboarding flow does not write settings.json yet.');
  });

  it('renders the onboarding screen as a left-rail timeline', () => {
    const screen = buildOnboardingScreen({
      answers: {
        agentName: 'Kori reviewer',
      },
      notice: 'Captured agent name: Kori reviewer',
    });

    expect(screen).toContain('A step-by-step TUI setup flow with a persistent left rail.');
    expect(screen).toContain('│');
    expect(screen).toContain('├─ ● 1. Agent name  done');
    expect(screen).toContain('├─ ◉ 2. Description');
    expect(screen).toContain('├─ ○ 3. Channels');
    expect(screen).toContain('╰─ commands: /status /reset /clear /exit');
  });

  it('adds TUI colors for done, active, and pending step headers', () => {
    const screen = buildOnboardingScreen(
      {
        answers: {
          agentName: 'Kori reviewer',
        },
      },
      72,
      'tui',
    );

    expect(screen).toContain('\x1b[32m● 1. Agent name  done\x1b[0m');
    expect(screen).toContain('\x1b[47m\x1b[30m ◉ 2. Description \x1b[0m');
    expect(screen).toContain('\x1b[2m○ 3. Channels\x1b[0m');
  });

  it('renders onboarding help in the same screen language', () => {
    const help = buildOnboardingHelp();

    expect(help).toContain('Onboarding commands');
    expect(help).toContain('├─ /status: show the current step and captured values');
    expect(help).toContain('╰─ /exit: leave onboarding');
  });
});
