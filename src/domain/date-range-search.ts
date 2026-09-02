import { dateRangeSchema, type DateRange } from './schema';
import { dateRangePresets } from './dates';

const fixedRangePattern = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/u;

export function parseDateRangeSearch(value: unknown): DateRange | undefined {
  if (typeof value !== 'string') return undefined;
  const preset = dateRangePresets.find((item) => item.id === value);
  if (preset) return preset.range;
  const fixed = fixedRangePattern.exec(value);
  if (!fixed) return undefined;
  const parsed = dateRangeSchema.safeParse({
    startDate: { fixed: fixed[1] },
    endDate: { fixed: fixed[2] },
  });
  return parsed.success ? parsed.data : undefined;
}

export function dateRangeSearchValue(range: DateRange) {
  const preset = dateRangePresets.find((item) => sameDateRange(item.range, range));
  if (preset) return preset.id;
  if ('fixed' in range.startDate && 'fixed' in range.endDate)
    return `${range.startDate.fixed}..${range.endDate.fixed}`;
  return undefined;
}

export function sameDateRange(left: DateRange, right: DateRange) {
  return (
    sameDateValue(left.startDate, right.startDate) && sameDateValue(left.endDate, right.endDate)
  );
}

function sameDateValue(left: DateRange['startDate'], right: DateRange['startDate']) {
  if ('fixed' in left || 'fixed' in right)
    return 'fixed' in left && 'fixed' in right && left.fixed === right.fixed;
  return (
    left.relative.amount === right.relative.amount &&
    left.relative.unit === right.relative.unit &&
    left.relative.direction === right.relative.direction &&
    left.relative.anchor === right.relative.anchor
  );
}
