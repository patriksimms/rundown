import { describe, expect, it } from 'vitest';
import { textStyleClasses } from './text-style';

describe('text style classes', () => {
  it('produces nothing when no style is stored so elements keep their own defaults', () => {
    expect(textStyleClasses(undefined)).toBeUndefined();
    expect(textStyleClasses({})).toBeUndefined();
  });

  it('only emits classes for the properties that were set', () => {
    expect(textStyleClasses({ size: 'lg' })).toBe('text-lg');
    expect(textStyleClasses({ weight: 'semibold', tone: 'muted' })).toBe(
      'font-semibold text-muted-foreground',
    );
  });

  it('widens tracking with uppercase so the label does not read as a cramped block', () => {
    expect(textStyleClasses({ transform: 'uppercase' })).toBe('uppercase tracking-wide');
    expect(textStyleClasses({ transform: 'none' })).toBe('normal-case');
  });
});
