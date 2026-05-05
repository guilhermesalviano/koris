import { describe, expect, it } from 'vitest';
import { buildOnboardingScreen } from '../../src/onboard';

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
});
