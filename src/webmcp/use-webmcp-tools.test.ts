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

  it('exposes batch placements without asking for the open dashboard id', () => {
    const schema = inputSchemaFor('updateLayout', { dashboardId: 'dashboard' });
    expect(schema.properties).toHaveProperty('placements');
    expect(schema.properties).not.toHaveProperty('dashboardId');
  });

  it('fixes the dashboard id for editor field metadata updates', () => {
    const schema = inputSchemaFor('updateFieldMetadata', { dashboardId: 'dashboard' });
    expect(schema.properties).toHaveProperty('dataSourceId');
    expect(schema.properties).toHaveProperty('patch');
    expect(schema.properties).not.toHaveProperty('dashboardId');
  });

  it('exposes the new rolling date anchors through generic widget tools', () => {
    const schema = inputSchemaFor('addWidget', { dashboardId: 'dashboard' });
    expect(JSON.stringify(schema)).toContain('startOfYear');
    expect(JSON.stringify(schema)).toContain('startOfQuarter');
  });
});
