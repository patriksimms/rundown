import { describe, expect, it } from 'vitest';
import { sharedUserLabel } from './sharing';

describe('shared user labels', () => {
  it('uses recognizable identity details without exposing internal user ids', () => {
    expect(sharedUserLabel({ displayName: 'Ada Lovelace', userEmail: 'ada@example.com' })).toBe(
      'Ada Lovelace · ada@example.com',
    );
    expect(sharedUserLabel({ userEmail: 'ada@example.com' })).toBe('ada@example.com');
    expect(sharedUserLabel({})).toBe('Unknown or deleted user');
  });
});
