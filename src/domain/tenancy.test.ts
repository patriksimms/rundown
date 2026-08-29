import { describe, expect, it } from 'vitest';
import { isWorkspaceR2Key, scopedR2Prefix } from './tenancy';

describe('R2 tenant boundaries', () => {
  it('accepts only keys below the exact workspace prefix', () => {
    expect(isWorkspaceR2Key('ws/acme/', 'ws/acme/report.csv')).toBe(true);
    expect(isWorkspaceR2Key('ws/acme/', 'ws/other/report.csv')).toBe(false);
    expect(isWorkspaceR2Key('ws/acme/', 'ws/acme/../other/report.csv')).toBe(false);
  });

  it('scopes listings and rejects traversal', () => {
    expect(scopedR2Prefix('ws/acme/', '/reports/')).toBe('ws/acme/reports/');
    expect(scopedR2Prefix('ws/acme/', '../other/')).toBeUndefined();
  });
});
