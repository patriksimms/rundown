import { describe, expect, it } from 'vitest';
import { colorsPerCategory, paletteColor } from './chart-colors';

describe('chart colours', () => {
  it('cycles through the eight palette slots', () => {
    expect(paletteColor(0)).toBe('var(--chart-1)');
    expect(paletteColor(7)).toBe('var(--chart-8)');
    expect(paletteColor(8)).toBe('var(--chart-1)');
  });

  it('colours per bar only for a single series', () => {
    expect(colorsPerCategory('category', 1)).toBe(true);
    expect(colorsPerCategory('category', 2)).toBe(false);
    expect(colorsPerCategory('series', 1)).toBe(false);
    expect(colorsPerCategory(undefined, 1)).toBe(false);
  });
});
