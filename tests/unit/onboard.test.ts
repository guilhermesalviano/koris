import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOnboardingScreen,
  buildOnboardingSettings,
  Onboard,
  resolveOnboardingSettingsPath,
  saveOnboardingSettings,
  SETTINGS_FILENAME,
} from '../../src/onboard';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'koris-onboard-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
          telegramToken: 'YOUR_BOT_TOKEN',
          provider: 'ollama',
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
          telegramToken: 'YOUR_BOT_TOKEN',
          provider: 'ollama',
          providerApiToken: 'YOUR_CHAT_ID',
        },
      },
      72,
      'plain',
    );

    expect(screen).toContain('4. API token ─ configured');
    expect(screen).toContain('5. Model');
  });

  it('renders personal detail steps as substeps of personal information', () => {
    const screen = buildOnboardingScreen(
      {
        answers: {
          channels: ['telegram'],
          telegramToken: 'YOUR_BOT_TOKEN',
          provider: 'ollama',
          providerApiToken: 'YOUR_CHAT_ID',
          providerModel: 'z-ai/glm-5.1',
          providerUrl: 'http://localhost:11434',
          personalInfo: { enabled: true, name: 'Joe Doe' },
        },
      },
      72,
      'plain',
    );

    expect(screen).toContain('7. Your Information ─ true');
    expect(screen).toContain('7.1. Your name ─ Joe Doe');
    expect(screen).toContain('7.2. Gender');
    expect(screen).not.toContain('8. Your name');
  });
});

describe('Onboard footer progress', () => {
  it('keeps personal substeps under step 6 in the footer', () => {
    const onboard = new Onboard() as any;
    onboard.answers = {
      channels: ['telegram'],
      telegramToken: 'YOUR_BOT_TOKEN',
      provider: 'ollama',
      providerApiToken: 'YOUR_CHAT_ID',
      providerModel: 'z-ai/glm-5.1',
      providerUrl: 'http://localhost:11434',
      personalInfo: { enabled: true, name: 'Joe Doe' },
    };
    onboard.skippedSteps = new Set();

    expect(onboard.getFooterText()).toBe('step 7/7');
  });

  it('creates the temp settings draft when onboarding completes from a false picker selection', () => {
    vi.useFakeTimers();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const repoRoot = createTempDir();
    const appRoot = join(repoRoot, 'apps', 'client');
    const previousCwd = process.cwd();

    mkdirSync(appRoot, { recursive: true });
    writeFileSync(join(appRoot, 'settings.json'), '{}');
    writeFileSync(join(appRoot, 'settings.example.json'), JSON.stringify({
      channels: {
        telegram: {
          ENABLED: true,
          BOT_TOKEN: 'YOUR_BOT_TOKEN',
          USE_POLLING: true,
          CHAT_ID: 'YOUR_CHAT_ID',
        },
      },
      ai: {
        PROVIDER: 'ollama',
        BASE_URL: 'http://localhost:11434',
        API_TOKEN: '',
      },
      personal_information: {
        HUMAN_NAME: 'John Doe',
      },
    }));

    try {
      process.chdir(repoRoot);

      const onboard = new Onboard() as any;
      onboard.answers = {
        channels: ['telegram'],
        telegramToken: 'YOUR_BOT_TOKEN',
        provider: 'ollama',
        providerApiToken: 'YOUR_CHAT_ID',
        providerModel: 'z-ai/glm-5.1',
        providerUrl: 'http://localhost:11434',
      };
      onboard.skippedSteps = new Set();
      onboard.pickerStep = 'personalInformation';
      onboard.pickerIndex = 1;

      const redrawCalls: string[] = [];
      const inputValues: string[] = [];
      const ctx = {
        getInputValue: () => '',
        setInputValue: (value: string) => {
          inputValues.push(value);
        },
        redraw: () => {
          redrawCalls.push('redraw');
        },
        println: vi.fn(),
        rl: { close: vi.fn() },
      };

      expect(onboard.handleKeypress('', { name: 'return' }, ctx)).toBe(true);
      vi.advanceTimersByTime(80);
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(readFileSync(join(appRoot, SETTINGS_FILENAME), 'utf-8')).toContain('"personal_information": {}');
      expect(inputValues).toContain('');
      expect(redrawCalls).toHaveLength(1);
    } finally {
      process.chdir(previousCwd);
    }
  });
});

describe('onboarding settings draft', () => {
  it('builds a temp settings payload by overlaying onboarding answers on the example settings', () => {
    expect(buildOnboardingSettings({
      channels: ['telegram', 'discord'],
      telegramToken: 'YOUR_BOT_TOKEN',
      provider: 'ollama',
      providerUrl: 'http://localhost:11434',
      providerApiToken: 'YOUR_CHAT_ID',
      personalInfo: {
        enabled: true,
        name: 'Joe Doe',
        gender: 'male',
      },
    }, {
      baseSettings: {
        temp_folder: './temp',
        channels: {
          telegram: {
            enabled: true,
            bot_token: 'YOUR_BOT_TOKEN',
            use_polling: true,
            chat_id: 'YOUR_CHAT_ID',
          },
        },
        ai: {
          provider: 'ollama',
          base_url: 'http://localhost:11434',
          api_token: '',
          model: 'gemma4:e4b',
        },
        personal_information: {
          name: 'John Doe',
          gender: 'male',
          birthday: '1990-01-01',
          location: 'New York, USA',
          occupation: 'Software Engineer',
        },
      },
    })).toEqual({
      temp_folder: './temp',
      channels: {
        telegram: {
          enabled: true,
          chat_id: 'YOUR_CHAT_ID',
          use_polling: true,
          bot_token: 'YOUR_BOT_TOKEN',
        },
        discord: {
          enabled: true,
        },
      },
      ai: {
        provider: 'ollama',
        base_url: 'http://localhost:11434',
        api_token: '',
        model: 'gemma4:e4b',
      },
      personal_information: {
        name: 'Joe Doe',
        gender: 'male',
      },
    });
  });

  it('resolves the draft path to apps/client from the monorepo root', () => {
    const repoRoot = createTempDir();
    const appRoot = join(repoRoot, 'apps', 'client');
    const runtimeDir = join(appRoot, 'dist', 'src');

    mkdirSync(join(appRoot, 'src'), { recursive: true });
    writeFileSync(join(appRoot, 'src', 'onboard.ts'), '');

    expect(resolveOnboardingSettingsPath({
      cwd: repoRoot,
      dirname: runtimeDir,
    })).toBe(join(appRoot, SETTINGS_FILENAME));
  });

  it('saves the draft next to settings.json using settings.example.json as the base', () => {
    const repoRoot = createTempDir();
    const appRoot = join(repoRoot, 'apps', 'client');
    const runtimeDir = join(appRoot, 'dist', 'src');

    mkdirSync(appRoot, { recursive: true });
    writeFileSync(join(appRoot, 'settings.json'), '{}');
    writeFileSync(join(appRoot, 'settings.example.json'), JSON.stringify({
      temp_folder: './temp',
      heartbeat: {
        enabled: true,
      },
      channels: {
        telegram: {
          enabled: true,
          bot_token: 'YOUR_BOT_TOKEN',
          use_polling: true,
          chat_id: 'YOUR_CHAT_ID',
        },
      },
      ai: {
        provider: 'ollama',
        base_url: 'http://localhost:11434',
        api_token: '',
        model: 'gemma4:e4b',
      },
      personal_information: {
        name: 'John Doe',
        gender: 'male',
        birthday: '1990-01-01',
        location: 'New York, USA',
        occupation: 'Software Engineer',
      },
    }));

    const destination = saveOnboardingSettings({
      channels: ['telegram'],
      telegramToken: 'YOUR_BOT_TOKEN',
      provider: 'ollama',
      providerApiToken: '',
    }, {
      cwd: repoRoot,
      dirname: runtimeDir,
    });

    expect(destination).toBe(join(appRoot, SETTINGS_FILENAME));
    expect(JSON.parse(readFileSync(destination, 'utf-8'))).toEqual({
      temp_folder: './temp',
      heartbeat: {
        enabled: true,
      },
      channels: {
        telegram: {
          enabled: true,
          chat_id: 'YOUR_CHAT_ID',
          use_polling: true,
          bot_token: 'YOUR_BOT_TOKEN',
        },
      },
      ai: {
        provider: 'ollama',
        base_url: 'http://localhost:11434',
        api_token: '',
        model: 'gemma4:e4b',
      },
      personal_information: {
      },
    });
  });
});
