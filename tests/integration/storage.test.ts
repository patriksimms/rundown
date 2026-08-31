import { env } from 'cloudflare:workers';
import { describe, expect, test } from 'vitest';
import {
  callService,
  expectApiError,
  signInToNewWorkspace,
  withR2Storage,
  type SourceListing,
} from './fixtures';

describe('workspace object storage', () => {
  test('listing is scoped to the workspace prefix in the R2 binding', async () => {
    const workspace = await signInToNewWorkspace();
    await env.DATA.put(`${workspace.r2Prefix}reports/january.csv`, 'region,revenue\nnorth,1\n');
    await env.DATA.put(`${workspace.r2Prefix}reports/february.csv`, 'region,revenue\nsouth,2\n');
    await env.DATA.put('ws/another-workspace/secret.csv', 'region,revenue\nwest,3\n');

    const listing = await withR2Storage(
      () => callService({ action: 'listR2Objects' }) as Promise<SourceListing>,
    );

    expect(listing.objects.map((object) => object.key).sort()).toEqual([
      `${workspace.r2Prefix}reports/february.csv`,
      `${workspace.r2Prefix}reports/january.csv`,
    ]);
    expect(listing.truncated).toBe(false);
  });

  test('a narrower prefix stays inside the workspace and traversal is refused', async () => {
    const workspace = await signInToNewWorkspace();
    await env.DATA.put(`${workspace.r2Prefix}reports/january.csv`, 'region\nnorth\n');
    await env.DATA.put(`${workspace.r2Prefix}archive/old.csv`, 'region\nsouth\n');

    const listing = await withR2Storage(
      () => callService({ action: 'listR2Objects', prefix: 'reports/' }) as Promise<SourceListing>,
    );
    expect(listing.objects.map((object) => object.key)).toEqual([
      `${workspace.r2Prefix}reports/january.csv`,
    ]);

    await withR2Storage(() =>
      expectApiError(callService({ action: 'listR2Objects', prefix: '../' }), {
        status: 400,
        code: 'invalid_r2_prefix',
      }),
    );
  });
});
