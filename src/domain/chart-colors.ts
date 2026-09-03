import type { BarColorBy } from './schema';

// The theme ships eight chart colours, so anything beyond that wraps around.
const paletteSize = 8;

/** CSS value for a palette slot, cycling once the eight theme colours run out. */
export function paletteColor(index: number) {
  return `var(--chart-${(index % paletteSize) + 1})`;
}

/**
 * Whether a bar chart should colour each bar separately. Per-bar colouring only reads correctly
 * with a single series: with several metrics, a breakdown or a comparison the colour already
 * carries the series, so those fall back to one colour per series.
 */
export function colorsPerCategory(colorBy: BarColorBy | undefined, seriesCount: number) {
  return colorBy === 'category' && seriesCount === 1;
}
