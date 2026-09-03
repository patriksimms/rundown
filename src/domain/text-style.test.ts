import { describe, expect, it } from 'vitest';
import { textBoxClasses, textStyleClasses } from './text-style';

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

  it('keeps vertical alignment out of the text classes so it can style the box instead', () => {
    expect(textStyleClasses({ verticalAlign: 'center' })).toBeUndefined();
    expect(textBoxClasses({ verticalAlign: 'center' })).toBe('justify-center');
    expect(textBoxClasses({ verticalAlign: 'bottom' })).toBe('justify-end');
    expect(textBoxClasses({ size: 'lg' })).toBeUndefined();
  });
});
