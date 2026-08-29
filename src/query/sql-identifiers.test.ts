import { describe, expect, it } from 'vitest';
import { referencedSqlIdentifiers, rewriteSqlIdentifiers } from './sql-identifiers';

describe('SQL identifier scanning', () => {
  it('ignores functions and literals when collecting field references', () => {
    expect(
      referencedSqlIdentifiers(
        `COALESCE(media_cost, 0) + CASE WHEN status = 'paid' THEN 1 ELSE 0 END`,
      ),
    ).toEqual(['media_cost', 'status']);
  });

  it('keeps dollar-quoted literals, interval units, and cast types intact', () => {
    const replacements = new Map([
      ['mediacost', '"cost"'],
      ['day', '"day_column"'],
      ['int4', '"int4_column"'],
      ['time', '"time_column"'],
    ]);
    expect(
      rewriteSqlIdentifiers(
        `$$MediaCost$$ || MediaCost::INT4 || CAST(MediaCost AS TIMESTAMP WITH TIME ZONE) || MediaCost + INTERVAL -1 DAYS`,
        (identifier) => replacements.get(identifier.toLocaleLowerCase('en-US')),
      ),
    ).toBe(
      `$$MediaCost$$ || "cost"::INT4 || CAST("cost" AS TIMESTAMP WITH TIME ZONE) || "cost" + INTERVAL -1 DAYS`,
    );
  });
});
