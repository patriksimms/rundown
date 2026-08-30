import { describe, expect, it } from 'vitest';
import {
  appendPlacement,
  placementFits,
  rollbackFailedLayout,
  validateLayoutUpdate,
} from './layout';
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

  it('accepts a complete free-placement layout with empty rows', () => {
    const second = { ...widget, id: 'two', layout: { x: 6, y: 0, width: 6, height: 2 } };
    expect(
      validateLayoutUpdate(
        [widget, second],
        [
          { widgetId: 'one', placement: { x: 0, y: 4, width: 4, height: 2 } },
          { widgetId: 'two', placement: { x: 8, y: 8, width: 4, height: 2 } },
        ],
      ),
    ).toBe(true);
  });

  it('rejects incomplete, duplicate, overlapping, and out-of-bounds batch layouts', () => {
    const second = { ...widget, id: 'two', layout: { x: 6, y: 0, width: 6, height: 2 } };
    const widgets = [widget, second];
    expect(
      validateLayoutUpdate(widgets, [
        { widgetId: 'one', placement: { x: 0, y: 0, width: 6, height: 2 } },
      ]),
    ).toBe(false);
    expect(
      validateLayoutUpdate(widgets, [
        { widgetId: 'one', placement: { x: 0, y: 0, width: 6, height: 2 } },
        { widgetId: 'one', placement: { x: 6, y: 0, width: 6, height: 2 } },
      ]),
    ).toBe(false);
    expect(
      validateLayoutUpdate(widgets, [
        { widgetId: 'one', placement: { x: 0, y: 0, width: 8, height: 2 } },
        { widgetId: 'two', placement: { x: 6, y: 0, width: 6, height: 2 } },
      ]),
    ).toBe(false);
    expect(
      validateLayoutUpdate(widgets, [
        { widgetId: 'one', placement: { x: 0, y: 0, width: 6, height: 2 } },
        { widgetId: 'two', placement: { x: 8, y: 0, width: 6, height: 2 } },
      ]),
    ).toBe(false);
  });

  it('rolls back only placements that still match the failed save', () => {
    const failed = { x: 2, y: 2, width: 6, height: 2 };
    const newer = { x: 4, y: 4, width: 6, height: 2 };
    const second = { ...widget, id: 'two', layout: failed };

    const rolledBack = rollbackFailedLayout(
      [{ ...widget, layout: newer }, second],
      new Map([
        ['one', widget.layout],
        ['two', { x: 6, y: 0, width: 6, height: 2 }],
      ]),
      new Map([
        ['one', failed],
        ['two', failed],
      ]),
    );

    expect(rolledBack[0]?.layout).toEqual(newer);
    expect(rolledBack[1]?.layout).toEqual({ x: 6, y: 0, width: 6, height: 2 });
  });
});
