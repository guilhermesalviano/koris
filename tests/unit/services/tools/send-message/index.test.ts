import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockService = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('../../../../../src/infrastructure/db-sqlite', () => ({
  DatabaseServiceFactory: { create: vi.fn() },
}));

vi.mock('../../../../../src/channels', () => ({
  ChannelsSingleton: {
    getExistingInstance: vi.fn(),
  },
}));

vi.mock('../../../../../src/services/outbound/outbound-message-service', () => ({
  OutboundMessageServiceFactory: { create: vi.fn().mockReturnValue(mockService) },
}));

import { sendMessage } from '../../../../../src/services/tools/send-message';
import { ChannelsSingleton } from '../../../../../src/channels';
import type { ILogger } from '../../../../../src/infrastructure/logger';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
const channelsManager = { sendMessage: vi.fn() };

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    channel: 'telegram',
    target: '987654321',
    content: 'Olá!',
    status: 'sent',
    errorMessage: undefined,
    createdAt: '2026-01-01T00:00:00.000Z',
    sentAt: '2026-01-01T00:00:01.000Z',
    ...overrides,
  };
}

describe('sendMessage tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ChannelsSingleton.getExistingInstance).mockReturnValue(channelsManager as never);
  });

  it('returns error when content is missing', async () => {
    const result = await sendMessage(logger, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('content');
  });

  it('returns error when channel or target is missing', async () => {
    const result = await sendMessage(logger, { content: 'Olá', channel: 'telegram' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('channel');
  });

  it('returns error when channel is missing and the context channel is not recordable', async () => {
    const result = await sendMessage(logger, { content: 'Olá', target: '111' }, { channel: 'web' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('channel');
  });

  it('infers the channel from the conversation context', async () => {
    mockService.send.mockResolvedValue(makeMessage());
    const result = await sendMessage(logger, { content: 'Olá', target: '111' }, { channel: 'whatsapp' });

    expect(result.success).toBe(true);
    expect(mockService.send).toHaveBeenCalledWith({
      content: 'Olá',
      channel: 'whatsapp',
      target: '111',
    });
  });

  it('explicit channel wins over the context channel', async () => {
    mockService.send.mockResolvedValue(makeMessage());
    const result = await sendMessage(
      logger,
      { content: 'Olá', channel: 'telegram', target: '111' },
      { channel: 'whatsapp' },
    );

    expect(result.success).toBe(true);
    expect(mockService.send).toHaveBeenCalledWith({
      content: 'Olá',
      channel: 'telegram',
      target: '111',
    });
  });

  it('returns error when the channel manager is not running', async () => {
    vi.mocked(ChannelsSingleton.getExistingInstance).mockReturnValue(null);
    const result = await sendMessage(logger, { content: 'Olá', channel: 'telegram', target: '111' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('sends the message and returns the result', async () => {
    mockService.send.mockResolvedValue(makeMessage());
    const result = await sendMessage(logger, { content: 'Olá!', channel: 'telegram', target: '987654321' });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe('send_message');
    expect(mockService.send).toHaveBeenCalledWith({
      content: 'Olá!',
      channel: 'telegram',
      target: '987654321',
    });
    expect(JSON.parse(result.result!)).toMatchObject({ id: 'm1', status: 'sent' });
  });

  it('returns error when the message failed to send', async () => {
    mockService.send.mockResolvedValue(makeMessage({ status: 'failed', errorMessage: 'boom' }));
    const result = await sendMessage(logger, { content: 'Olá', channel: 'telegram', target: '111' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('returns error when the service throws', async () => {
    mockService.send.mockRejectedValueOnce(new Error('db fail'));
    const result = await sendMessage(logger, { content: 'Olá', channel: 'telegram', target: '111' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
  });
});