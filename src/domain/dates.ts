import type { DateRange } from './schema';

export interface ResolvedDateRange {
  start: string;
  end: string;
}

export function resolveDateRange(
  range: DateRange,
  timezone: string,
  now = new Date(),
): ResolvedDateRange {
  return {
    start: resolveDateValue(range.startDate, timezone, now),
    end: resolveDateValue(range.endDate, timezone, now),
  };
}

export function comparisonDateRange(
  range: DateRange,
  mode: 'previousPeriod' | 'previousYear',
  timezone: string,
  now = new Date(),
): DateRange {
  const resolved = resolveDateRange(range, timezone, now);
  const start = parseDate(resolved.start);
  const end = parseDate(resolved.end);
  if (mode === 'previousYear') {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    end.setUTCFullYear(end.getUTCFullYear() - 1);
  } else {
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    end.setUTCDate(start.getUTCDate() - 1);
    start.setTime(end.getTime());
    start.setUTCDate(start.getUTCDate() - days + 1);
  }
  return {
    startDate: { fixed: formatDate(start) },
    endDate: { fixed: formatDate(end) },
  };
}

function resolveDateValue(value: DateRange['startDate'], timezone: string, now: Date) {
  if ('fixed' in value) return value.fixed;
  const parts = dateParts(now, timezone);
  let resolved = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (value.relative.anchor === 'startOfWeek') {
    const day = resolved.getUTCDay() || 7;
    resolved.setUTCDate(resolved.getUTCDate() - day + 1);
  } else if (value.relative.anchor === 'startOfMonth') {
    resolved.setUTCDate(1);
  }
  const direction = value.relative.direction === 'past' ? -1 : 1;
  const amount = value.relative.amount * direction;
  switch (value.relative.unit) {
    case 'day':
      resolved.setUTCDate(resolved.getUTCDate() + amount);
      break;
    case 'week':
      resolved.setUTCDate(resolved.getUTCDate() + amount * 7);
      break;
    case 'month':
      resolved.setUTCMonth(resolved.getUTCMonth() + amount);
      break;
    case 'quarter':
      resolved.setUTCMonth(resolved.getUTCMonth() + amount * 3);
      break;
    case 'year':
      resolved.setUTCFullYear(resolved.getUTCFullYear() + amount);
      break;
  }
  return resolved.toISOString().slice(0, 10);
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dateParts(date: Date, timezone: string) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(values.find((item) => item.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}
