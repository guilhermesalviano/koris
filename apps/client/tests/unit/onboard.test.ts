import { describe, expect, it } from 'vitest';
import { buildOnboardingScreen, Onboard } from '../../src/onboard';

describe('buildOnboardingScreen', () => {
  it('asks for TELEGRAM_BOT_TOKEN when telegram is selected', () => {
    const screen = buildOnboardingScreen(
      {
        answers: {
          channels: ['telegram'],
        },
      },
      72,
      'plain',
    );

    expect(screen).toContain('2. Telegram bot token');
    expect(screen).not.toContain('3. Provider');
  });

  it('skips the Telegram token step when telegram is not selected', () => {
    const screen = buildOnboardingScreen(
      {
        answers: {
          channels: ['discord'],
        },
      },
      72,
      'plain',
    );

    expect(screen).toContain('2. Provider');
    expect(screen).not.toContain('Telegram bot token');
  });

  it('keeps the API token step active until it is answered or skipped', () => {
    const screen = buildOnboardingScreen(
      {
        answers: {
          channels: ['telegram'],
          telegramToken: '123456:token',
          provider: 'openai',
        },
      },
      72,
      'plain',
      );

    expect(screen).toContain('4. API token');
    expect(screen).not.toContain('5. Provider URL');
  });

  it('treats an empty API token as a completed answer and advances onboarding', () => {
    const screen = buildOnboardingScreen(
      {
        answers: {
          channels: ['telegram'],
          telegramToken: '123456:token',
          provider: 'openai',
          providerApiToken: '',
        },
      },
      72,
      'plain',
    );

    expect(screen).toContain('4. API token ─ configured');
    expect(screen).toContain('5. Provider URL');
  });

  it('renders personal detail steps as substeps of personal information', () => {
    const screen = buildOnboardingScreen(
      {
        answers: {
          channels: ['telegram'],
          telegramToken: '123456:token',
          provider: 'openai',
          providerApiToken: '',
          providerUrl: 'https://api.openai.com/v1',
          personalInfo: { enabled: true, name: 'Joe Doe' },
        },
      },
      72,
      'plain',
    );

    expect(screen).toContain('6. Your Information ─ true');
    expect(screen).toContain('6.1. Your name ─ Joe Doe');
    expect(screen).toContain('6.2. Gender');
    expect(screen).not.toContain('7. Your name');
  });
});

describe('Onboard footer progress', () => {
  it('keeps personal substeps under step 6 in the footer', () => {
    const onboard = new Onboard() as any;
    onboard.answers = {
      channels: ['telegram'],
      telegramToken: '123456:token',
      provider: 'openai',
      providerApiToken: '',
      providerUrl: 'https://api.openai.com/v1',
      personalInfo: { enabled: true, name: 'Joe Doe' },
    };
    onboard.skippedSteps = new Set();

    expect(onboard.getFooterText()).toBe('step 6/6');
  });
});
