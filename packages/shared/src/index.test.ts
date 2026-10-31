import { describe, expect, it } from 'vitest';
import { askSchema, extractCitationIndices, registerSchema } from './index';

describe('extractCitationIndices', () => {
  it('returns unique, sorted source numbers', () => {
    expect(extractCitationIndices('A [3] b [1][3]. c [12]')).toEqual([1, 3, 12]);
  });

  it('returns an empty list when nothing is cited', () => {
    expect(extractCitationIndices('No citations here [a]')).toEqual([]);
  });
});

describe('schemas', () => {
  it('normalises email and enforces password length', () => {
    const ok = registerSchema.safeParse({ name: 'Ann', email: ' ANN@Example.com ', password: 'longenough' });
    expect(ok.success && ok.data.email).toBe('ann@example.com');
    expect(registerSchema.safeParse({ name: 'Ann', email: 'a@b.co', password: 'short' }).success).toBe(false);
  });

  it('rejects blank questions', () => {
    expect(askSchema.safeParse({ question: '   ' }).success).toBe(false);
  });
});
