import { describe, expect, it } from 'vitest';
import { inputSchemaFor } from './use-webmcp-tools';

describe('WebMCP input schemas', () => {
  it('derives viewer query inputs without exposing SQL or datasource locations', () => {
    const schema = inputSchemaFor('queryWidget', {
      dashboardId: 'dashboard',
      shareToken: 'token',
    });
    expect(schema.properties).toHaveProperty('widgetId');
    expect(schema.properties).toHaveProperty('controlState');
    expect(schema.properties).not.toHaveProperty('dashboardId');
    expect(schema.properties).not.toHaveProperty('shareToken');
    expect(schema.properties).not.toHaveProperty('sql');
    expect(schema.properties).not.toHaveProperty('dataSourceId');
  });

  it('keeps consequential mutation fields in schemas', () => {
    const schema = inputSchemaFor('shareDashboard', { dashboardId: 'dashboard' });
    expect(schema.properties).toHaveProperty('operation');
    expect(schema.required).toContain('operation');
  });
});
