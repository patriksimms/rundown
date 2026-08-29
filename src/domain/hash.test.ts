import { describe, expect, it } from 'vitest';
import { hashJson, stableStringify } from './hash';

describe('stable hashing', () => {
  it('does not change when object keys are reordered', async () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 4 }, b: 2 }),
    );
    await expect(hashJson({ b: 2, a: 1 })).resolves.toBe(await hashJson({ a: 1, b: 2 }));
  });
});
