import { describe, it, expect, vi } from 'vitest';
import { ContextRepository } from '../../../src/repositories/context';

const configMock = vi.hoisted(() => ({
  config: {
    PERSONAL_INFORMATION: {
      NAME: 'Test User',
      GENDER: 'female',
      BIRTHDAY: '1990-01-01',
      LOCATION: 'SP',
      OCCUPATION: 'Engineer',
    },
  },
}));

vi.mock('../../../src/config', () => configMock);

describe('ContextRepository', () => {
  it('formats channel, platform and personal information into a prompt', () => {
    const repository = new ContextRepository();

    const result = repository.get({ channel: 'telegram' });

    expect(result).toContain('# Before responding, consider the following context information:');
    expect(result).toContain('1. Datetime:');
    expect(result).toContain('2. Channel Source: telegram');
    expect(result).toContain('3. Platform:');
    expect(result).toContain('4. Main Human Information:');
    expect(result).toContain('Name: Test User, gender: female, birthday: 1990-01-01');
    expect(result).toContain('location: SP');
    expect(result).toContain('occupation: Engineer');
    expect(result.split('\n').length).toBeGreaterThan(3);
  });

  it('omits optional personal fields that are empty', () => {
    configMock.config.PERSONAL_INFORMATION.GENDER = '';
    configMock.config.PERSONAL_INFORMATION.BIRTHDAY = '';
    configMock.config.PERSONAL_INFORMATION.LOCATION = '';
    configMock.config.PERSONAL_INFORMATION.OCCUPATION = '';
    const repository = new ContextRepository();

    const result = repository.get({ channel: 'tui' });

    expect(result).toContain('Name: Test User');
    expect(result).not.toContain('gender:');
    expect(result).not.toContain('location:');
    expect(result).not.toContain('occupation:');
  });
});
