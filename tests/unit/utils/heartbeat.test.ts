import { describe, it, expect } from 'vitest';
import {
  isValidCronExpression,
  isEveryMinute,
  hasSpecificHour,
  matchesCron,
  isCronDue,
} from '../../../src/utils/heartbeat';

describe('isValidCronExpression', () => {
  it('accepts standard 5-field cron', () => {
    expect(isValidCronExpression('0 9 * * 1')).toBe(true);
  });

  it('accepts all-wildcard expression', () => {
    expect(isValidCronExpression('* * * * *')).toBe(true);
  });

  it('accepts step expressions', () => {
    expect(isValidCronExpression('*/15 * * * *')).toBe(true);
  });

  it('accepts range expressions', () => {
    expect(isValidCronExpression('0-5 9 * * *')).toBe(true);
  });

  it('accepts list expressions', () => {
    expect(isValidCronExpression('0 9,17 * * *')).toBe(true);
  });

  it('rejects 4-field cron', () => {
    expect(isValidCronExpression('0 9 * *')).toBe(false);
  });

  it('rejects 6-field cron', () => {
    expect(isValidCronExpression('0 0 9 * * *')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidCronExpression('')).toBe(false);
  });

  it('accepts leading/trailing whitespace', () => {
    expect(isValidCronExpression('  0 9 * * 1  ')).toBe(true);
  });
});

describe('isEveryMinute', () => {
  it('returns true for "* * * * *"', () => {
    expect(isEveryMinute('* * * * *')).toBe(true);
  });

  it('returns true for "*/1 * * * *"', () => {
    expect(isEveryMinute('*/1 * * * *')).toBe(true);
  });

  it('returns false for "*/5 * * * *"', () => {
    expect(isEveryMinute('*/5 * * * *')).toBe(false);
  });

  it('returns false for specific minute', () => {
    expect(isEveryMinute('30 9 * * *')).toBe(false);
  });

  it('returns false for "*/30 * * * *"', () => {
    expect(isEveryMinute('*/30 * * * *')).toBe(false);
  });
});

describe('hasSpecificHour', () => {
  it('returns true when hour field is a number', () => {
    expect(hasSpecificHour('0 9 * * *')).toBe(true);
  });

  it('returns true when hour field is a range', () => {
    expect(hasSpecificHour('0 9-17 * * *')).toBe(true);
  });

  it('returns true when minute is fixed and hour is wildcard', () => {
    expect(hasSpecificHour('0 * * * *')).toBe(true);
  });

  it('returns true for */30 in minute field (valid repeat)', () => {
    expect(hasSpecificHour('*/30 * * * *')).toBe(true);
  });

  it('returns true for */15 in minute field', () => {
    expect(hasSpecificHour('*/15 * * * *')).toBe(true);
  });

  it('returns false for wildcard minute with wildcard hour', () => {
    expect(hasSpecificHour('* * * * *')).toBe(false);
  });

  it('returns true for wildcard minute with specific hour', () => {
    expect(hasSpecificHour('* 9 * * *')).toBe(true);
  });

  it('returns false for */1 in minute with wildcard hour', () => {
    expect(hasSpecificHour('*/1 * * * *')).toBe(false);
  });

  it('returns true for */1 in minute with specific hour', () => {
    expect(hasSpecificHour('*/1 9 * * *')).toBe(true);
  });
});

describe('matchesCron', () => {
  it('matches exact minute and hour', () => {
    const date = new Date(2024, 0, 15, 9, 0, 0); // local 09:00
    expect(matchesCron('0 9 * * *', date)).toBe(true);
  });

  it('does not match wrong minute', () => {
    const date = new Date(2024, 0, 15, 9, 5, 0);
    expect(matchesCron('0 9 * * *', date)).toBe(false);
  });

  it('does not match wrong hour', () => {
    const date = new Date(2024, 0, 15, 10, 0, 0);
    expect(matchesCron('0 9 * * *', date)).toBe(false);
  });

  it('matches wildcard on all fields', () => {
    expect(matchesCron('* * * * *', new Date())).toBe(true);
  });

  it('matches step expression */15 at minute 0', () => {
    const date = new Date(2024, 0, 15, 9, 0, 0);
    expect(matchesCron('*/15 * * * *', date)).toBe(true);
  });

  it('matches step expression */15 at minute 15', () => {
    const date = new Date(2024, 0, 15, 9, 15, 0);
    expect(matchesCron('*/15 * * * *', date)).toBe(true);
  });

  it('does not match step */15 at minute 7', () => {
    const date = new Date(2024, 0, 15, 9, 7, 0);
    expect(matchesCron('*/15 * * * *', date)).toBe(false);
  });

  it('matches range field', () => {
    const date = new Date(2024, 0, 15, 9, 3, 0);
    expect(matchesCron('0-5 9 * * *', date)).toBe(true);
  });

  it('does not match outside range', () => {
    const date = new Date(2024, 0, 15, 9, 6, 0);
    expect(matchesCron('0-5 9 * * *', date)).toBe(false);
  });

  it('matches comma-separated list', () => {
    const date = new Date(2024, 0, 15, 17, 0, 0);
    expect(matchesCron('0 9,17 * * *', date)).toBe(true);
  });
});

describe('isCronDue', () => {
  it('returns true when cron fired between since and now', () => {
    const now = new Date(2024, 0, 15, 9, 5, 0);
    const since = new Date(2024, 0, 15, 8, 55, 0);
    expect(isCronDue('0 9 * * *', now, since)).toBe(true);
  });

  it('returns false when cron did not fire in interval', () => {
    const now = new Date(2024, 0, 15, 9, 5, 0);
    const since = new Date(2024, 0, 15, 9, 2, 0);
    expect(isCronDue('0 10 * * *', now, since)).toBe(false);
  });

  it('returns false when interval is zero (since === now)', () => {
    const now = new Date(2024, 0, 15, 9, 0, 0);
    const since = new Date(2024, 0, 15, 9, 0, 0);
    expect(isCronDue('0 9 * * *', now, since)).toBe(false);
  });

  it('returns false when since is after now', () => {
    const now = new Date(2024, 0, 15, 9, 0, 0);
    const since = new Date(2024, 0, 15, 10, 0, 0);
    expect(isCronDue('0 9 * * *', now, since)).toBe(false);
  });

  it('handles a wide interval covering multiple fires', () => {
    const now = new Date(2024, 0, 15, 11, 0, 0);
    const since = new Date(2024, 0, 15, 8, 0, 0);
    expect(isCronDue('0 9 * * *', now, since)).toBe(true);
  });
});
