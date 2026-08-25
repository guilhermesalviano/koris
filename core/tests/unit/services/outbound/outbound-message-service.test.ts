import { describe, it, expect, vi } from 'vitest';
import { OutboundMessageService } from '../../../../src/services/outbound/outbound-message-service';
import { OutboundMessage } from '../../../../src/entities/outbound-message';

const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

function makeChannels() {
  return { sendMessage: vi.fn().mockResolvedValue(undefined) };
}

function makeOutboundRepo(overrides: Record<string, unknown> = {}) {
  return {
    save: vi.fn(),
    markSent: vi.fn(),
    markFailed: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    count: vi.fn().mockReturnValue(0),
    ...overrides,
  };
}

function makeService(channels = makeChannels(), outboundRepo = makeOutboundRepo()) {
  const service = new OutboundMessageService(logger as never, channels as never, outboundRepo as never);
  return { service, channels, outboundRepo };
}

describe('OutboundMessageService', () => {
  it('sends to an explicit channel and target and marks as sent', async () => {
    const { service, channels, outboundRepo } = makeService();

    const result = await service.send({ content: 'Olá!', channel: 'telegram', target: '987654321' });

    expect(channels.sendMessage).toHaveBeenCalledWith('telegram', '987654321', 'Olá!');
    expect(outboundRepo.save).toHaveBeenCalledTimes(1);
    expect(outboundRepo.markSent).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(OutboundMessage);
    expect(result.status).toBe('sent');
    expect(result.target).toBe('987654321');
  });

  it('records a failed message when sending throws', async () => {
    const channels = makeChannels();
    channels.sendMessage.mockRejectedValueOnce(new Error('channel down'));
    const outboundRepo = makeOutboundRepo({
      getById: vi.fn().mockReturnValue(
        new OutboundMessage({
          id: 'm1',
          channel: 'telegram',
          target: '111',
          content: 'Olá',
          status: 'failed',
          errorMessage: 'channel down',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      ),
    });
    const { service } = makeService(channels, outboundRepo);

    const result = await service.send({ content: 'Olá', channel: 'telegram', target: '111' });

    expect(outboundRepo.markFailed).toHaveBeenCalledWith(expect.any(String), 'channel down');
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('channel down');
  });

  it('throws for an invalid channel', async () => {
    const { service, channels } = makeService();

    await expect(service.send({ content: 'Olá', channel: 'slack', target: '111' })).rejects.toThrow('Invalid channel');
    expect(channels.sendMessage).not.toHaveBeenCalled();
  });
});