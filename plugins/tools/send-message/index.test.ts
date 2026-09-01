import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMessage, create } from './index';
import type { IChannelsGateway, ILogger, OutboundMessageRecord, ToolDefinition, ToolPluginContext } from '../contracts';
import type { PluginRegistry } from '../../registry';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

function makeMessage(overrides: Partial<OutboundMessageRecord> = {}): OutboundMessageRecord {
  return {
    id: 'm1',
    channel: 'telegram',
    target: '987654321',
    status: 'sent',
    errorMessage: undefined,
    ...overrides,
  };
}

function makeGateway(overrides: Partial<IChannelsGateway> = {}): IChannelsGateway {
  return {
    sendMessage: vi.fn().mockResolvedValue(makeMessage()),
    sendSticker: vi.fn(),
    ...overrides,
  };
}

describe('sendMessage tool', () => {
  let channels: IChannelsGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    channels = makeGateway();
  });

  it('returns error when content is missing', async () => {
    const result = await sendMessage(logger, {}, undefined, channels);
    expect(result.success).toBe(false);
    expect(result.error).toContain('content');
  });

  it('returns error when channel or target is missing', async () => {
    const result = await sendMessage(logger, { content: 'Olá', channel: 'telegram' }, undefined, channels);
    expect(result.success).toBe(false);
    expect(result.error).toContain('channel');
  });

  it('returns error when channel is missing and the context channel is not recordable', async () => {
    const result = await sendMessage(logger, { content: 'Olá', target: '111' }, { channel: 'web' }, channels);
    expect(result.success).toBe(false);
    expect(result.error).toContain('channel');
  });

  it('infers the channel from the conversation context', async () => {
    const result = await sendMessage(logger, { content: 'Olá', target: '111' }, { channel: 'whatsapp' }, channels);

    expect(result.success).toBe(true);
    expect(channels.sendMessage).toHaveBeenCalledWith('whatsapp', '111', 'Olá');
  });

  it('explicit channel wins over the context channel', async () => {
    const result = await sendMessage(
      logger,
      { content: 'Olá', channel: 'telegram', target: '111' },
      { channel: 'whatsapp' },
      channels,
    );

    expect(result.success).toBe(true);
    expect(channels.sendMessage).toHaveBeenCalledWith('telegram', '111', 'Olá');
  });

  it('returns error when the channel manager is not running', async () => {
    channels = makeGateway({ sendMessage: vi.fn().mockRejectedValue(new Error('Outbound messaging is not available: no channel manager is running.')) });
    const result = await sendMessage(logger, { content: 'Olá', channel: 'telegram', target: '111' }, undefined, channels);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('sends the message and returns the result', async () => {
    channels = makeGateway({ sendMessage: vi.fn().mockResolvedValue(makeMessage()) });
    const result = await sendMessage(logger, { content: 'Olá!', channel: 'telegram', target: '987654321' }, undefined, channels);

    expect(result.success).toBe(true);
    expect(result.toolName).toBe('send_message');
    expect(channels.sendMessage).toHaveBeenCalledWith('telegram', '987654321', 'Olá!');
    expect(JSON.parse(result.result!)).toMatchObject({ id: 'm1', status: 'sent' });
  });

  it('returns error when the message failed to send', async () => {
    channels = makeGateway({ sendMessage: vi.fn().mockResolvedValue(makeMessage({ status: 'failed', errorMessage: 'boom' })) });
    const result = await sendMessage(logger, { content: 'Olá', channel: 'telegram', target: '111' }, undefined, channels);

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('returns error when the gateway throws', async () => {
    channels = makeGateway({ sendMessage: vi.fn().mockRejectedValueOnce(new Error('db fail')) });
    const result = await sendMessage(logger, { content: 'Olá', channel: 'telegram', target: '111' }, undefined, channels);

    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
  });
});

describe('create', () => {
  function register(isEnabled: () => boolean): ToolDefinition {
    const context = { pluginEnablement: { isEnabled } } as unknown as ToolPluginContext;
    let registered: ToolDefinition | undefined;
    const fakeRegistry = {
      extend: vi.fn((_point, value: ToolDefinition) => { registered = value; }),
    } as unknown as PluginRegistry;
    create(context).setup(fakeRegistry);
    return registered!;
  }

  it('is enabled when trusted and the plugin is enabled', () => {
    const definition = register(() => true);
    expect(definition.enabled({ trusted: true })).toBe(true);
  });

  it('is disabled when the plugin is administratively disabled, even when trusted', () => {
    const definition = register(() => false);
    expect(definition.enabled({ trusted: true })).toBe(false);
  });
});
