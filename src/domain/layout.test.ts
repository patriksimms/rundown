import { describe, expect, it } from 'vitest';
import { appendPlacement, placementFits } from './layout';
import type { DashboardWidget } from './schema';

const widget: DashboardWidget = {
  id: 'one',
  layout: { x: 0, y: 0, width: 6, height: 2 },
  definition: { type: 'text', content: { schemaVersion: 'plain', document: 'hello' } },
  definitionHash: 'hash',
};

describe('dashboard layout', () => {
  it('appends below the current bottom and caps width to the grid', () => {
    expect(appendPlacement([widget], 20, 3, 12)).toEqual({ x: 0, y: 2, width: 12, height: 3 });
  });

  it('rejects overlap and placements outside the grid', () => {
    expect(placementFits([widget], { x: 5, y: 1, width: 4, height: 2 })).toBe(false);
    expect(placementFits([widget], { x: 10, y: 3, width: 4, height: 2 })).toBe(false);
    expect(placementFits([widget], { x: 6, y: 0, width: 6, height: 2 })).toBe(true);
  });
});
