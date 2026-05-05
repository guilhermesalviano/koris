import { describe, expect, it } from 'vitest';

import { resolveSubmittedInput } from '../../src/line-handler';

describe('resolveSubmittedInput', () => {
  it('returns trimmed text for non-empty input', () => {
    expect(resolveSubmittedInput('  hello  ')).toBe('hello');
  });

  it('drops blank submissions by default', () => {
    expect(resolveSubmittedInput('   ')).toBeUndefined();
  });

  it('keeps blank submissions when empty input is allowed', () => {
    expect(resolveSubmittedInput('   ', true)).toBe('');
  });
});
