import { describe, expect, it } from 'vitest';
import { askSchema, extractCitationIndices, registerSchema } from './index';

describe('extractCitationIndices', () => {
  it('returns unique, sorted source numbers', () => {
    expect(extractCitationIndices('A [3] b [1][3]. c [12]')).toEqual([1, 3, 12]);
  });

  it('understands lists and ranges, which models often write', () => {
    expect(extractCitationIndices('a [1, 3, 4, 5] b [2–3] c [7-8]')).toEqual([1, 2, 3, 4, 5, 7, 8]);
  });

  it('ignores markdown links', () => {
    expect(extractCitationIndices('see [1](https://example.com) and [2]')).toEqual([2]);
  });

  it('returns an empty list when nothing is cited', () => {
    expect(extractCitationIndices('No citations here [a]')).toEqual([]);
  });
});

describe('schemas', () => {
  it('limits passwords to the 72 bytes bcrypt actually uses, counting multi-byte characters', () => {
    const base = { name: 'A', email: 'a@b.co' };
    expect(registerSchema.safeParse({ ...base, password: 'a'.repeat(72) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, password: 'a'.repeat(73) }).success).toBe(false);
    // 30 emoji = 30 "characters" but 120 bytes: the tail would silently be ignored
    expect(registerSchema.safeParse({ ...base, password: '🔒'.repeat(30) }).success).toBe(false);
  });

  it('normalises email and enforces password length', () => {
    const ok = registerSchema.safeParse({ name: 'Ann', email: ' ANN@Example.com ', password: 'longenough' });
    expect(ok.success && ok.data.email).toBe('ann@example.com');
    expect(registerSchema.safeParse({ name: 'Ann', email: 'a@b.co', password: 'short' }).success).toBe(false);
  });

  it('rejects blank questions', () => {
    expect(askSchema.safeParse({ question: '   ' }).success).toBe(false);
  });
});
