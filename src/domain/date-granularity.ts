import type { DateGranularity } from './schema';

export type ResolvedDateGranularity = Exclude<DateGranularity, 'auto' | 'raw'>;

export function dateBucketTarget(width: number) {
  if (width <= 4) return 30;
  if (width <= 8) return 60;
  return 90;
}

export function resolveDateGranularity(
  granularity: DateGranularity,
  range: { start: string; end: string },
  targetBuckets: number,
): Exclude<DateGranularity, 'auto'> {
  if (granularity !== 'auto') return granularity;
  const start = new Date(`${range.start}T00:00:00Z`);
  const end = new Date(`${range.end}T00:00:00Z`);
  const days = Math.max(1, Math.round((end.valueOf() - start.valueOf()) / 86_400_000) + 1);
  if (days <= targetBuckets) return 'day';
  if (Math.ceil(days / 7) <= targetBuckets) return 'week';

  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() -
    start.getUTCMonth() +
    1;
  if (months <= targetBuckets) return 'month';
  if (Math.ceil(months / 3) <= targetBuckets) return 'quarter';
  return 'year';
}
