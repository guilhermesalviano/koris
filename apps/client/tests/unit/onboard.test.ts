import { describe, expect, it } from 'vitest';
import { buildOnboardingScreen } from '../../src/onboard';

describe('buildOnboardingScreen', () => {
  it('keeps the API token step active until it is answered or skipped', () => {
    const screen = buildOnboardingScreen(
      {
        answers: {
          channels: ['telegram'],
          provider: 'openai',
        },
      },
      72,
      'plain',
    );

    expect(screen).toContain('3. API token');
    expect(screen).not.toContain('4. Provider URL');
  });

  it('treats an empty API token as a completed answer and advances onboarding', () => {
    const screen = buildOnboardingScreen(
      {
        answers: {
          channels: ['telegram'],
          provider: 'openai',
          providerApiToken: '',
        },
      },
      72,
      'plain',
    );

    expect(screen).toContain('3. API token ─ configured');
    expect(screen).toContain('4. Provider URL');
  });
});
