import { clerkClient } from '@clerk/tanstack-react-start/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import type { ApiRequest } from '#/api/contracts';
import { createDatabase } from '#/db/client';
import { headSourceObject, listSourceObjects } from '#/data/source.server';
import {
  calculatedFields,
  dashboardGrants,
  dashboards,
  dataSources,
  fields,
  libraryMetrics,
  shareLinks,
} from '#/db/schema';
import {
  controlStateSchema,
  dashboardDocumentSchema,
  defaultDateRange,
  type ControlState,
  type DashboardDocument,
  type DashboardWidget,
  type WidgetDefinition,
} from '#/domain/schema';
import { appendPlacement, placementFits, validateLayoutUpdate } from '#/domain/layout';
import { canUpdateFieldMetadata } from '#/domain/field-metadata';
import { hashJson } from '#/domain/hash';
import { comparisonDateRange, resolveDateRange } from '#/domain/dates';
import { queryCacheState, widgetDependencyState } from '#/domain/cache';
import { remapWidgetDefinition } from '#/domain/remap';
import { mergeControlState } from '#/domain/control-state';
import { alignDateComparisonRows } from '#/domain/widget-results';
import { isWorkspaceR2Key, scopedR2Prefix } from '#/domain/tenancy';
import {
  assertSingleExpression,
  compileLibraryExpression,
  compileWidgetQuery,
} from '#/query/compiler';
import { referencedSqlIdentifiers } from '#/query/sql-identifiers';
import {
  describeDataSource,
  explainIsolatedQuery,
  runIsolatedPreparedQuery,
} from '#/query/duckdb.server';
import type { DataSourceRecord } from '#/query/types';
import { requireAdmin, requireSession, type SessionContext } from './auth.server';
import { ApiError } from './errors';
import { loadDashboard, loadDataSource, loadQueryMetadata } from './records.server';

const database = () => createDatabase(env.DB);

export async function executeRequest(request: ApiRequest): Promise<unknown> {
  const startedAt = Date.now();
  try {
    const result = await dispatchRequest(request);
    console.info('rundown.request', {
      action: request.action,
      result: 'success',
      durationMs: Date.now() - startedAt,
      ...safeRequestIdentifiers(request),
    });
    return result;
  } catch (error) {
    console.warn('rundown.request', {
      action: request.action,
      result: 'error',
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof ApiError ? error.code : 'unexpected_error',
      ...safeRequestIdentifiers(request),
    });
    throw error;
  }
}

async function dispatchRequest(request: ApiRequest): Promise<unknown> {
  switch (request.action) {
    case 'bootstrap':
      return bootstrap();
    case 'listDashboards':
      return listDashboards();
    case 'getDashboard':
      return getDashboard(request.dashboardId, request.shareToken);
    case 'getSharedDashboard':
      return getSharedDashboard(request.shareToken);
    case 'createDashboard':
      return createDashboard(request);
    case 'updateDashboard':
      return updateDashboard(request);
    case 'addWidget':
      return addWidget(request);
    case 'updateWidget':
      return updateWidget(request);
    case 'removeWidget':
      return removeWidget(request);
    case 'moveWidget':
      return moveWidget(request);
    case 'updateLayout':
      return updateLayout(request);
    case 'copyWidget':
      return copyWidget(request);
    case 'previewWidget':
      return previewWidget(request);
    case 'queryWidget':
      return queryWidget(
        request.dashboardId,
        request.widgetId,
        request.controlState,
        request.shareToken,
        request.page,
      );
    case 'explainWidget':
      return explainWidget(request.dashboardId, request.widgetId, request.shareToken);
    case 'getControlOptions':
      return getControlOptions(
        request.dashboardId,
        request.controlId,
        request.search,
        request.shareToken,
      );
    case 'listDataSources':
      return listDataSources();
    case 'listLibraryMetrics':
      return listLibraryMetrics();
    case 'describeDatasource':
      return describeDatasource(request.dataSourceId, request.dashboardId, request.shareToken);
    case 'listR2Objects':
      return listR2Objects(request.prefix);
    case 'registerDatasource':
      return registerDatasource(request);
    case 'updateFieldMetadata':
      return updateFieldMetadata(request);
    case 'upsertCalculatedField':
      return upsertCalculatedField(request);
    case 'upsertLibraryMetric':
      return upsertLibraryMetric(request);
    case 'shareDashboard':
      return shareDashboard(request);
  }
}

async function bootstrap() {
  const session = await requireSession();
  const [dashboardRows, sourceRows] = await Promise.all([
    visibleDashboardRows(session),
    database()
      .select({ id: dataSources.id, name: dataSources.name })
      .from(dataSources)
      .where(eq(dataSources.workspaceId, session.workspace.id)),
  ]);
  return {
    userId: session.userId,
    workspace: { id: session.workspace.id, name: session.workspace.name },
    isAdmin: session.isAdmin,
    dashboards: dashboardRows.map(summary),
    dataSources: sourceRows,
  };
}

async function listDashboards() {
  const session = await requireSession();
  return (await visibleDashboardRows(session)).map(summary);
}

async function getDashboard(id: string, shareToken?: string) {
  const access = await authorizeDashboard(id, 'viewer', shareToken);
  const referencedSourceIds = [
    ...new Set(
      access.document.widgets.flatMap((widget) =>
        'dataSourceId' in widget.definition ? [widget.definition.dataSourceId] : [],
      ),
    ),
  ];
  const sources =
    access.role === 'admin' || access.role === 'editor'
      ? await database()
          .select({ id: dataSources.id, name: dataSources.name })
          .from(dataSources)
          .where(eq(dataSources.workspaceId, access.document.workspaceId))
      : referencedSourceIds.length
        ? await database()
            .select({ id: dataSources.id, name: dataSources.name })
            .from(dataSources)
            .where(inArray(dataSources.id, referencedSourceIds))
        : [];
  return {
    dashboard: access.document,
    role: access.role,
    dataSources: sources,
    controlState: defaultControlState(access.document),
    ...(access.role === 'admin' || access.role === 'editor'
      ? { sharing: await sharingState(access.document.id) }
      : {}),
  };
}

async function getSharedDashboard(shareToken: string) {
  const link = await database().query.shareLinks.findFirst({
    where: and(eq(shareLinks.token, shareToken), isNull(shareLinks.revokedAt)),
  });
  if (!link)
    throw new ApiError(
      404,
      'invalid_share_link',
      'This share link is invalid or has been revoked.',
    );
  return getDashboard(link.dashboardId, shareToken);
}

async function createDashboard(request: Extract<ApiRequest, { action: 'createDashboard' }>) {
  const session = await requireSession();
  if (request.dataSourceIds.length) {
    const owned = await database()
      .select({ id: dataSources.id })
      .from(dataSources)
      .where(
        and(
          eq(dataSources.workspaceId, session.workspace.id),
          inArray(dataSources.id, request.dataSourceIds),
        ),
      );
    if (owned.length !== new Set(request.dataSourceIds).size)
      throw new ApiError(
        400,
        'invalid_datasource',
        'One or more datasources do not belong to this workspace.',
      );
  }
  const now = new Date().toISOString();
  const id = `dash_${crypto.randomUUID()}`;
  const document: DashboardDocument = {
    id,
    workspaceId: session.workspace.id,
    name: request.name,
    schemaVersion: 2,
    timezone: request.timezone,
    defaultDateRange: request.defaultDateRange ?? defaultDateRange,
    columns: 12,
    widgets: [],
    createdBy: session.userId,
    createdAt: now,
    updatedAt: now,
  };
  await database().batch([
    database().insert(dashboards).values({
      id,
      workspaceId: session.workspace.id,
      name: request.name,
      document,
      createdBy: session.userId,
      createdAt: now,
      updatedAt: now,
    }),
    database().insert(dashboardGrants).values({
      dashboardId: id,
      clerkUserId: session.userId,
      role: 'editor',
      grantedBy: session.userId,
      grantedAt: now,
    }),
  ]);
  return document;
}

async function updateDashboard(request: Extract<ApiRequest, { action: 'updateDashboard' }>) {
  const access = await authorizeDashboard(request.dashboardId, 'editor');
  const updated = {
    ...access.document,
    name: request.name ?? access.document.name,
    timezone: request.timezone ?? access.document.timezone,
    defaultDateRange: request.defaultDateRange ?? access.document.defaultDateRange,
    updatedAt: new Date().toISOString(),
  };
  await persistDashboard(updated);
  return updated;
}

async function addWidget(request: Extract<ApiRequest, { action: 'addWidget' }>) {
  const access = await authorizeDashboard(request.dashboardId, 'editor');
  await validateDefinition(access.document, request.definition);
  const id = `widget_${crypto.randomUUID()}`;
  const widget: DashboardWidget = {
    id,
    layout: appendPlacement(
      access.document.widgets,
      request.width,
      request.height,
      access.document.columns,
    ),
    definition: request.definition,
    definitionHash: await definitionHash(request.definition, access.document.workspaceId),
  };
  const updated = {
    ...access.document,
    widgets: [...access.document.widgets, widget],
    updatedAt: new Date().toISOString(),
  };
  await persistDashboard(updated);
  return { widget, compiledSql: await compiledSql(updated, widget) };
}

async function updateWidget(request: Extract<ApiRequest, { action: 'updateWidget' }>) {
  const access = await authorizeDashboard(request.dashboardId, 'editor');
  const existing = widgetById(access.document, request.widgetId);
  await validateDefinition(access.document, request.definition);
  const widget = {
    ...existing,
    definition: request.definition,
    definitionHash: await definitionHash(request.definition, access.document.workspaceId),
  };
  const updated = {
    ...access.document,
    widgets: access.document.widgets.map((item) => (item.id === widget.id ? widget : item)),
    updatedAt: new Date().toISOString(),
  };
  await persistDashboard(updated);
  return { widget, compiledSql: await compiledSql(updated, widget) };
}

async function removeWidget(request: Extract<ApiRequest, { action: 'removeWidget' }>) {
  const access = await authorizeDashboard(request.dashboardId, 'editor');
  widgetById(access.document, request.widgetId);
  const updated = {
    ...access.document,
    widgets: access.document.widgets.filter((item) => item.id !== request.widgetId),
    updatedAt: new Date().toISOString(),
  };
  await persistDashboard(updated);
  return updated;
}

async function moveWidget(request: Extract<ApiRequest, { action: 'moveWidget' }>) {
  const access = await authorizeDashboard(request.dashboardId, 'editor');
  const existing = widgetById(access.document, request.widgetId);
  if (
    !placementFits(access.document.widgets, request.placement, access.document.columns, existing.id)
  )
    throw new ApiError(
      400,
      'invalid_placement',
      'The widget placement overlaps another widget or exceeds the grid.',
    );
  const updatedWidget = { ...existing, layout: request.placement };
  const updated = {
    ...access.document,
    widgets: access.document.widgets.map((widget) =>
      widget.id === existing.id ? updatedWidget : widget,
    ),
    updatedAt: new Date().toISOString(),
  };
  await persistDashboard(updated);
  return updatedWidget;
}

async function updateLayout(request: Extract<ApiRequest, { action: 'updateLayout' }>) {
  const access = await authorizeDashboard(request.dashboardId, 'editor');
  if (!validateLayoutUpdate(access.document.widgets, request.placements, access.document.columns))
    throw new ApiError(
      400,
      'invalid_layout',
      'The layout must include every widget exactly once, stay inside the grid, and not overlap.',
    );
  const placements = new Map(
    request.placements.map((update) => [update.widgetId, update.placement]),
  );
  const updated = {
    ...access.document,
    widgets: access.document.widgets.map((widget) => ({
      ...widget,
      layout: placements.get(widget.id)!,
    })),
    updatedAt: new Date().toISOString(),
  };
  await persistDashboard(updated);
  return updated.widgets;
}

async function copyWidget(request: Extract<ApiRequest, { action: 'copyWidget' }>) {
  const target = await authorizeDashboard(request.dashboardId, 'editor');
  const source = await authorizeDashboard(request.fromDashboardId, 'viewer');
  const original = widgetById(source.document, request.widgetId);
  let definition = original.definition;
  if ('dataSourceId' in original.definition) {
    const sourceDataSource = await loadDataSource(
      original.definition.dataSourceId,
      source.document.workspaceId,
    );
    const targetDataSource = await loadDataSource(
      request.targetDataSourceId ?? original.definition.dataSourceId,
      target.document.workspaceId,
    );
    if (sourceDataSource.id !== targetDataSource.id) {
      const [sourceMetadata, targetMetadata] = await Promise.all([
        loadQueryMetadata(sourceDataSource.id, source.document.workspaceId),
        loadQueryMetadata(targetDataSource.id, target.document.workspaceId),
      ]);
      try {
        definition = remapWidgetDefinition(
          original.definition,
          sourceMetadata,
          targetDataSource.id,
          targetMetadata,
        );
      } catch (error) {
        throw new ApiError(
          400,
          'canonical_field_missing',
          error instanceof Error ? error.message : 'The target datasource is not compatible.',
        );
      }
    }
  }
  return addWidget({
    action: 'addWidget',
    dashboardId: target.document.id,
    definition,
    width: original.layout.width,
    height: original.layout.height,
  });
}

async function previewWidget(request: Extract<ApiRequest, { action: 'previewWidget' }>) {
  const access = await authorizeDashboard(request.dashboardId, 'editor');
  await validateDefinition(access.document, request.definition);
  return runDefinition(access.document, request.definition, request.controlState ?? {});
}

async function queryWidget(
  dashboardId: string,
  widgetId: string,
  state: ControlState | undefined,
  shareToken?: string,
  page = 0,
) {
  const access = await authorizeDashboard(dashboardId, 'viewer', shareToken);
  const widget = widgetById(access.document, widgetId);
  const defaults = defaultControlState(access.document);
  const controlState = validateControlState(access.document, mergeControlState(defaults, state));
  if (!('dataSourceId' in widget.definition)) return { rows: [], controlState };
  const dataSource = await loadDataSource(
    widget.definition.dataSourceId,
    access.document.workspaceId,
  );
  const metadata = await loadQueryMetadata(dataSource.id, access.document.workspaceId);
  const resolvedControls = await resolveControls(
    access.document,
    widget.definition,
    [...metadata.fields, ...metadata.calculatedFields],
    controlState,
  );
  const dateRange = controlState.dateRange ?? access.document.defaultDateRange;
  const resolvedDateRange = resolveDateRange(dateRange, access.document.timezone);
  const resolvedControlState: ControlState = {
    ...controlState,
    dateRange: {
      startDate: { fixed: resolvedDateRange.start },
      endDate: { fixed: resolvedDateRange.end },
    },
  };
  const currentDefinitionHash = await hashJson(widgetDependencyState(widget.definition, metadata));
  const cacheKey = await hashJson({
    ...queryCacheState({
      definitionHash: currentDefinitionHash,
      requestedDateRange: dateRange,
      resolvedDateRange,
      resolvedControls: normalize(resolvedControls),
      dataSourceVersion: dataSource.version,
      timezone: access.document.timezone,
    }),
    page,
  });
  const cached = await env.QUERY_CACHE.get(cacheKey, 'json');
  if (cached) {
    console.info('rundown.query_cache', { dashboardId, widgetId, outcome: 'hit' });
    return { ...(cached as object), cache: 'hit' };
  }
  console.info('rundown.query_cache', { dashboardId, widgetId, outcome: 'miss' });
  const pageSize =
    widget.definition.type === 'table' && widget.definition.resultLimit.mode === 'pagination'
      ? widget.definition.resultLimit.amount
      : undefined;
  const run = (
    queryControlState: ControlState,
    queryDefinition: WidgetDefinition = widget.definition,
    offset = pageSize === undefined ? undefined : page * pageSize,
  ) =>
    runIsolatedPreparedQuery<Record<string, unknown>>(dataSource, (sourceTableName) => {
      const compiled = compileWidgetQuery({
        dashboard: access.document,
        definition: queryDefinition,
        dataSource,
        ...metadata,
        controlState: queryControlState,
        bucketName: env.R2_BUCKET_NAME,
        sourceTableName,
        resolvedControls,
        offset,
      });
      return { sql: compiled.sql, parameters: compiled.parameters };
    });
  const comparison = widgetComparison(widget.definition);
  const summaryDefinition = tableSummaryDefinition(widget.definition);
  const [rows, comparisonRows, summaryRows] = await Promise.all([
    run(resolvedControlState),
    comparison
      ? run({
          ...resolvedControlState,
          dateRange: comparisonDateRange(
            resolvedControlState.dateRange!,
            comparison,
            access.document.timezone,
          ),
        })
      : Promise.resolve(undefined),
    summaryDefinition ? run(resolvedControlState, summaryDefinition, undefined) : undefined,
  ]);
  const alignedComparisonRows =
    comparisonRows && comparison && hasDateDimension(widget.definition, metadata)
      ? alignDateComparisonRows(comparisonRows, comparison, resolvedDateRange)
      : comparisonRows;
  const hasMore = pageSize !== undefined && rows.length > pageSize;
  const result = {
    rows: normalize(pageSize === undefined ? rows : rows.slice(0, pageSize)),
    ...(alignedComparisonRows
      ? {
          comparisonRows: normalize(
            pageSize === undefined
              ? alignedComparisonRows
              : alignedComparisonRows.slice(0, pageSize),
          ),
        }
      : {}),
    ...(summaryRows?.[0] ? { summaryRow: normalize(summaryRows[0]) } : {}),
    controlState,
    cache: 'miss',
    ...(pageSize === undefined ? {} : { page, hasMore }),
  };
  await env.QUERY_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 86_400 });
  return result;
}

async function explainWidget(dashboardId: string, widgetId: string, shareToken?: string) {
  const access = await authorizeDashboard(dashboardId, 'viewer', shareToken);
  const widget = widgetById(access.document, widgetId);
  if (!('dataSourceId' in widget.definition)) return { sql: null, definitions: [] };
  const dataSource = await loadDataSource(
    widget.definition.dataSourceId,
    access.document.workspaceId,
  );
  const metadata = await loadQueryMetadata(dataSource.id, access.document.workspaceId);
  const compiled = compileWidgetQuery({
    dashboard: access.document,
    definition: widget.definition,
    dataSource,
    ...metadata,
    controlState: {},
    bucketName: env.R2_BUCKET_NAME,
    sourceTableName: 'rundown_source',
  });
  const calculatedDefinitions = metadata.calculatedFields
    .filter((field) => definitionFieldIds(widget.definition).includes(field.id))
    .map((field) => ({
      name: field.label,
      expression: field.expression,
      description: field.description,
    }));
  return {
    sql: compiled.sql,
    definitions: [...calculatedDefinitions, ...compiled.definitions],
  };
}

async function getControlOptions(
  dashboardId: string,
  controlId: string,
  search: string | undefined,
  shareToken?: string,
) {
  const access = await authorizeDashboard(dashboardId, 'viewer', shareToken);
  const control = widgetById(access.document, controlId);
  if (control.definition.type !== 'control')
    throw new ApiError(400, 'not_a_control', 'The selected widget is not a filter control.');
  const controlDefinition = control.definition;
  const dataSource = await loadDataSource(
    controlDefinition.dataSourceId,
    access.document.workspaceId,
  );
  const metadata = await loadQueryMetadata(dataSource.id, access.document.workspaceId);
  const field =
    metadata.fields.find((item) => item.id === controlDefinition.fieldId) ??
    metadata.calculatedFields.find((item) => item.id === controlDefinition.fieldId);
  if (!field) throw new ApiError(400, 'unknown_field', 'The control field no longer exists.');
  const expression =
    'columnName' in field ? quoteIdentifier(field.columnName) : `(${field.expression})`;
  const parameters: unknown[] = [];
  const where = search ? ` WHERE CAST(${expression} AS VARCHAR) ILIKE ?` : '';
  if (search) parameters.push(`%${search}%`);
  const direction = controlDefinition.optionsSortDirection?.toUpperCase() ?? 'ASC';
  const rows = await runIsolatedPreparedQuery<{ value: unknown }>(
    dataSource,
    (sourceTableName) => ({
      sql: `SELECT ${expression} AS value FROM ${quoteIdentifier(sourceTableName)}${where} GROUP BY 1 ORDER BY 1 ${direction} LIMIT 100`,
      parameters,
    }),
  );
  return { values: rows.map((row) => normalize(row.value)) };
}

async function listDataSources() {
  const session = await requireSession();
  return database()
    .select()
    .from(dataSources)
    .where(eq(dataSources.workspaceId, session.workspace.id));
}

async function listLibraryMetrics() {
  const session = await requireSession();
  return database()
    .select()
    .from(libraryMetrics)
    .where(eq(libraryMetrics.workspaceId, session.workspace.id));
}

async function describeDatasource(dataSourceId: string, dashboardId?: string, shareToken?: string) {
  const workspaceId = shareToken
    ? await sharedDatasourceWorkspace(dataSourceId, dashboardId, shareToken)
    : (await requireSession()).workspace.id;
  const dataSource = await loadDataSource(dataSourceId, workspaceId);
  const metadata = await loadQueryMetadata(dataSource.id, workspaceId);
  const canonicalNames = new Set(
    [...metadata.fields, ...metadata.calculatedFields].map((field) => field.canonicalName),
  );
  const applicableMetrics = metadata.libraryMetrics.filter((metric) =>
    referencedSqlIdentifiers(metric.expression).every((name) => canonicalNames.has(name)),
  );
  return {
    ...dataSource,
    fields: metadata.fields.filter((field) => !field.hidden),
    calculatedFields: metadata.calculatedFields,
    libraryMetrics: applicableMetrics,
  };
}

async function sharedDatasourceWorkspace(
  dataSourceId: string,
  dashboardId: string | undefined,
  shareToken: string,
) {
  if (!dashboardId)
    throw new ApiError(400, 'dashboard_required', 'Shared datasource access needs a dashboard.');
  const access = await authorizeDashboard(dashboardId, 'viewer', shareToken);
  const referenced = access.document.widgets.some(
    (widget) =>
      'dataSourceId' in widget.definition && widget.definition.dataSourceId === dataSourceId,
  );
  if (!referenced)
    throw new ApiError(
      403,
      'datasource_access_denied',
      'The datasource is not used by this dashboard.',
    );
  return access.document.workspaceId;
}

async function listR2Objects(prefix?: string) {
  const session = await requireSession();
  requireAdmin(session);
  const safePrefix = scopedR2Prefix(session.workspace.r2Prefix, prefix);
  if (!safePrefix)
    throw new ApiError(400, 'invalid_r2_prefix', 'R2 prefixes cannot contain traversal segments.');
  return listSourceObjects(safePrefix);
}

async function registerDatasource(request: Extract<ApiRequest, { action: 'registerDatasource' }>) {
  const session = await requireSession();
  requireAdmin(session);
  if (!isWorkspaceR2Key(session.workspace.r2Prefix, request.location.key))
    throw new ApiError(
      400,
      'invalid_r2_prefix',
      `Datasource keys must start with ${session.workspace.r2Prefix}.`,
    );
  const objects =
    request.location.kind === 'object'
      ? [await headSourceObject(request.location.key)].filter((item) => item !== null)
      : (await listSourceObjects(request.location.key)).objects;
  if (!objects.length)
    throw new ApiError(404, 'r2_object_not_found', 'No matching R2 objects were found.');
  const dataSource: DataSourceRecord = {
    id: `ds_${crypto.randomUUID()}`,
    workspaceId: session.workspace.id,
    name: request.name,
    location: request.location,
    version: await hashJson(objects.map((object) => [object.key, object.etag])),
  };
  const inspection = await describeDataSource(dataSource);
  const discovered = inspection.description.map((column) =>
    seedField(dataSource.id, column, inspection.samples),
  );
  const now = new Date().toISOString();
  const db = database();
  await db.batch([
    db.insert(dataSources).values({
      id: dataSource.id,
      workspaceId: dataSource.workspaceId,
      name: dataSource.name,
      location: dataSource.location,
      version: dataSource.version,
      createdAt: now,
      updatedAt: now,
    }),
    ...discovered.map((field) =>
      db.insert(fields).values({ ...field, workspaceId: session.workspace.id }),
    ),
  ]);
  return { ...dataSource, fields: discovered };
}

async function updateFieldMetadata(
  request: Extract<ApiRequest, { action: 'updateFieldMetadata' }>,
) {
  const session = await requireSession();
  await loadDataSource(request.dataSourceId, session.workspace.id);
  let hasEditorAccess = false;
  let usesSource = false;
  if (request.dashboardId) {
    const access = await authorizeDashboard(request.dashboardId, 'editor');
    hasEditorAccess = access.role === 'admin' || access.role === 'editor';
    usesSource = dashboardUsesDataSource(access.document, request.dataSourceId);
  }
  if (!canUpdateFieldMetadata(session.isAdmin, hasEditorAccess, usesSource, request.patch))
    throw new ApiError(
      403,
      'field_metadata_access_denied',
      'Editors may update visible field metadata only for datasources used by their dashboard.',
    );
  const row = await database().query.fields.findFirst({
    where: and(
      eq(fields.dataSourceId, request.dataSourceId),
      eq(fields.columnName, request.columnName),
    ),
  });
  if (!row) throw new ApiError(404, 'field_not_found', 'Field not found.');
  await database().update(fields).set(request.patch).where(eq(fields.id, row.id));
  return database().query.fields.findFirst({ where: eq(fields.id, row.id) });
}

async function upsertCalculatedField(
  request: Extract<ApiRequest, { action: 'upsertCalculatedField' }>,
) {
  const session = await requireSession();
  if (!session.isAdmin) {
    if (!request.dashboardId)
      throw new ApiError(
        403,
        'dashboard_editor_required',
        'Calculated fields require editor access to a dashboard.',
      );
    const access = await authorizeDashboard(request.dashboardId, 'editor');
    if (!dashboardUsesDataSource(access.document, request.dataSourceId))
      throw new ApiError(
        403,
        'dashboard_datasource_required',
        'The authorized dashboard does not use this datasource.',
      );
  }
  const dataSource = await loadDataSource(request.dataSourceId, session.workspace.id);
  assertSingleExpression(request.expression);
  await explainIsolatedQuery(
    dataSource,
    `SELECT ${request.expression} FROM ${quoteIdentifier('rundown_source')} LIMIT 1`,
  );
  const mutableValues = {
    canonicalName: request.canonicalName ?? slug(request.name),
    label: request.name,
    expression: request.expression,
    role: request.role,
    semanticType: request.semanticType,
    defaultAggregation: request.defaultAggregation ?? null,
    description: request.description ?? null,
    updatedAt: new Date().toISOString(),
  };
  const db = database();
  if (request.id) {
    const [updated] = await db
      .update(calculatedFields)
      .set(mutableValues)
      .where(
        and(
          eq(calculatedFields.id, request.id),
          eq(calculatedFields.workspaceId, session.workspace.id),
          eq(calculatedFields.dataSourceId, dataSource.id),
        ),
      )
      .returning();
    if (!updated)
      throw new ApiError(404, 'calculated_field_not_found', 'Calculated field not found.');
    return updated;
  }
  const values = {
    id: `calc_${crypto.randomUUID()}`,
    workspaceId: session.workspace.id,
    dataSourceId: dataSource.id,
    ...mutableValues,
  };
  const [created] = await db.insert(calculatedFields).values(values).returning();
  return created;
}

async function upsertLibraryMetric(
  request: Extract<ApiRequest, { action: 'upsertLibraryMetric' }>,
) {
  const session = await requireSession();
  if (!session.isAdmin) {
    if (request.id)
      throw new ApiError(
        403,
        'library_metric_admin_required',
        'Only workspace admins can update library metrics.',
      );
    if (!request.dashboardId)
      throw new ApiError(
        403,
        'dashboard_editor_required',
        'Library metrics require editor access to a dashboard.',
      );
    await authorizeDashboard(request.dashboardId, 'editor');
  }
  assertSingleExpression(request.expression);
  const sourceRows = await database()
    .select()
    .from(dataSources)
    .where(eq(dataSources.workspaceId, session.workspace.id));
  let validated = false;
  for (const row of sourceRows) {
    const dataSource = await loadDataSource(row.id, session.workspace.id);
    const metadata = await loadQueryMetadata(row.id, session.workspace.id);
    const names = new Set(
      [...metadata.fields, ...metadata.calculatedFields].map((field) =>
        field.canonicalName.toLocaleLowerCase('en-US'),
      ),
    );
    if (!referencedSqlIdentifiers(request.expression).every((name) => names.has(name))) continue;
    const expression = compileLibraryExpression(request.expression, metadata);
    await explainIsolatedQuery(
      dataSource,
      `SELECT ${expression} FROM ${quoteIdentifier('rundown_source')}`,
    );
    validated = true;
    break;
  }
  if (!validated)
    throw new ApiError(
      400,
      'metric_not_applicable',
      'No datasource contains every canonical field referenced by this metric.',
    );
  const mutableValues = {
    name: request.name,
    canonicalName: request.canonicalName ?? slug(request.name),
    expression: request.expression,
    semanticType: request.semanticType,
    description: request.description ?? null,
    updatedAt: new Date().toISOString(),
  };
  const db = database();
  if (request.id) {
    const [updated] = await db
      .update(libraryMetrics)
      .set(mutableValues)
      .where(
        and(
          eq(libraryMetrics.id, request.id),
          eq(libraryMetrics.workspaceId, session.workspace.id),
        ),
      )
      .returning();
    if (!updated) throw new ApiError(404, 'library_metric_not_found', 'Library metric not found.');
    return updated;
  }
  const values = {
    id: `metric_${crypto.randomUUID()}`,
    workspaceId: session.workspace.id,
    ...mutableValues,
  };
  const [created] = await db.insert(libraryMetrics).values(values).returning();
  return created;
}

async function shareDashboard(request: Extract<ApiRequest, { action: 'shareDashboard' }>) {
  const access = await authorizeDashboard(request.dashboardId, 'editor');
  if (!access.session) throw new ApiError(401, 'unauthenticated', 'Sign in to manage sharing.');
  const db = database();
  if (request.operation.kind === 'createLink') {
    const token = randomToken();
    const link = {
      token,
      dashboardId: request.dashboardId,
      createdBy: access.session.userId,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    await db.insert(shareLinks).values(link);
    return { ...link, url: `/share/${token}` };
  }
  if (request.operation.kind === 'revokeLink') {
    await db
      .update(shareLinks)
      .set({ revokedAt: new Date().toISOString() })
      .where(
        and(
          eq(shareLinks.dashboardId, request.dashboardId),
          eq(shareLinks.token, request.operation.token),
        ),
      );
  } else {
    if (request.operation.kind === 'grant') {
      const users = await clerkClient().users.getUserList({
        emailAddress: [request.operation.userEmail],
        limit: 2,
      });
      const user = users.data[0];
      if (!user) throw new ApiError(404, 'user_not_found', 'No Clerk user has that email address.');
      const values = {
        dashboardId: request.dashboardId,
        clerkUserId: user.id,
        role: request.operation.role,
        grantedBy: access.session.userId,
        grantedAt: new Date().toISOString(),
      };
      await db
        .insert(dashboardGrants)
        .values(values)
        .onConflictDoUpdate({
          target: [dashboardGrants.dashboardId, dashboardGrants.clerkUserId],
          set: values,
        });
    } else {
      let userId = request.operation.userId;
      if (!userId && request.operation.userEmail) {
        const users = await clerkClient().users.getUserList({
          emailAddress: [request.operation.userEmail],
          limit: 2,
        });
        userId = users.data[0]?.id;
      }
      if (!userId)
        throw new ApiError(400, 'user_reference_required', 'Provide a user id or email to revoke.');
      await db
        .delete(dashboardGrants)
        .where(
          and(
            eq(dashboardGrants.dashboardId, request.dashboardId),
            eq(dashboardGrants.clerkUserId, userId),
          ),
        );
    }
  }
  return sharingState(request.dashboardId);
}

async function authorizeDashboard(id: string, required: 'viewer' | 'editor', shareToken?: string) {
  const loaded = await loadDashboard(id);
  if (shareToken) {
    const link = await database().query.shareLinks.findFirst({
      where: and(
        eq(shareLinks.token, shareToken),
        eq(shareLinks.dashboardId, id),
        isNull(shareLinks.revokedAt),
      ),
    });
    if (!link)
      throw new ApiError(
        403,
        'invalid_share_link',
        'This share link is invalid or has been revoked.',
      );
    if (required === 'editor')
      throw new ApiError(403, 'read_only_link', 'Share links are read-only.');
    return { ...loaded, role: 'viewer' as const, session: null };
  }
  const session = await requireSession();
  if (loaded.document.workspaceId !== session.workspace.id)
    throw new ApiError(404, 'dashboard_not_found', 'Dashboard not found.');
  if (session.isAdmin) return { ...loaded, role: 'admin' as const, session };
  const grant = await database().query.dashboardGrants.findFirst({
    where: and(
      eq(dashboardGrants.dashboardId, id),
      eq(dashboardGrants.clerkUserId, session.userId),
    ),
  });
  if (!grant || (required === 'editor' && grant.role !== 'editor'))
    throw new ApiError(
      403,
      'dashboard_access_denied',
      `You need ${required} access to this dashboard.`,
    );
  return { ...loaded, role: grant.role as 'editor' | 'viewer', session };
}

async function visibleDashboardRows(session: SessionContext) {
  if (session.isAdmin)
    return database()
      .select()
      .from(dashboards)
      .where(eq(dashboards.workspaceId, session.workspace.id));
  return database()
    .select({
      id: dashboards.id,
      workspaceId: dashboards.workspaceId,
      name: dashboards.name,
      document: dashboards.document,
      createdBy: dashboards.createdBy,
      createdAt: dashboards.createdAt,
      updatedAt: dashboards.updatedAt,
    })
    .from(dashboards)
    .innerJoin(dashboardGrants, eq(dashboardGrants.dashboardId, dashboards.id))
    .where(
      and(
        eq(dashboards.workspaceId, session.workspace.id),
        eq(dashboardGrants.clerkUserId, session.userId),
      ),
    );
}

function summary(row: { id: string; name: string; document: unknown; updatedAt: string }) {
  const document = dashboardDocumentSchema.parse(row.document);
  return {
    id: row.id,
    name: row.name,
    widgetCount: document.widgets.length,
    dataSourceIds: [
      ...new Set(
        document.widgets.flatMap((widget) =>
          'dataSourceId' in widget.definition ? [widget.definition.dataSourceId] : [],
        ),
      ),
    ],
    updatedAt: row.updatedAt,
  };
}

function defaultControlState(dashboard: DashboardDocument): ControlState {
  const dateControl = dashboard.widgets.find((widget) => widget.definition.type === 'dateControl');
  const values = Object.fromEntries(
    dashboard.widgets.flatMap((widget) =>
      widget.definition.type === 'control' && widget.definition.defaultValues?.length
        ? [[widget.id, widget.definition.defaultValues]]
        : [],
    ),
  );
  return {
    ...(dateControl?.definition.type === 'dateControl'
      ? { dateRange: dateControl.definition.defaultDateRange ?? dashboard.defaultDateRange }
      : {}),
    ...(Object.keys(values).length ? { values } : {}),
  };
}

async function persistDashboard(document: DashboardDocument) {
  dashboardDocumentSchema.parse(document);
  await database()
    .update(dashboards)
    .set({ name: document.name, document, updatedAt: document.updatedAt })
    .where(eq(dashboards.id, document.id));
}

function widgetById(document: DashboardDocument, widgetId: string) {
  const widget = document.widgets.find((item) => item.id === widgetId);
  if (!widget) throw new ApiError(404, 'widget_not_found', 'Widget not found.');
  return widget;
}

async function validateDefinition(dashboard: DashboardDocument, definition: WidgetDefinition) {
  if (!('dataSourceId' in definition)) return;
  const dataSource = await loadDataSource(definition.dataSourceId, dashboard.workspaceId);
  const metadata = await loadQueryMetadata(dataSource.id, dashboard.workspaceId);
  const referenced = definitionFieldIds(definition);
  const known = new Set(
    [...metadata.fields, ...metadata.calculatedFields].map((field) => field.id),
  );
  if (referenced.some((id) => !known.has(id)))
    throw new ApiError(
      400,
      'unknown_field',
      'The widget references a field that does not belong to its datasource.',
    );
  const compiled = compileWidgetQuery({
    dashboard,
    definition,
    dataSource,
    ...metadata,
    controlState: {},
    bucketName: env.R2_BUCKET_NAME,
    sourceTableName: 'rundown_source',
  });
  await explainIsolatedQuery(dataSource, compiled.sql, compiled.parameters);
}

async function runDefinition(
  dashboard: DashboardDocument,
  definition: WidgetDefinition,
  state: ControlState,
) {
  const defaults = defaultControlState(dashboard);
  const controlState = validateControlState(dashboard, mergeControlState(defaults, state));
  if (!('dataSourceId' in definition)) return { rows: [], controlState };
  const dataSource = await loadDataSource(definition.dataSourceId, dashboard.workspaceId);
  const metadata = await loadQueryMetadata(dataSource.id, dashboard.workspaceId);
  const resolvedControls = await resolveControls(
    dashboard,
    definition,
    [...metadata.fields, ...metadata.calculatedFields],
    controlState,
  );
  const dateRange = controlState.dateRange ?? dashboard.defaultDateRange;
  const resolvedDateRange = resolveDateRange(dateRange, dashboard.timezone);
  const resolvedControlState: ControlState = {
    ...controlState,
    dateRange: {
      startDate: { fixed: resolvedDateRange.start },
      endDate: { fixed: resolvedDateRange.end },
    },
  };
  const run = (queryControlState: ControlState, queryDefinition: WidgetDefinition = definition) =>
    runIsolatedPreparedQuery<Record<string, unknown>>(dataSource, (sourceTableName) => {
      const compiled = compileWidgetQuery({
        dashboard,
        definition: queryDefinition,
        dataSource,
        ...metadata,
        controlState: queryControlState,
        bucketName: env.R2_BUCKET_NAME,
        sourceTableName,
        resolvedControls,
      });
      return { sql: compiled.sql, parameters: compiled.parameters };
    });
  const comparison = widgetComparison(definition);
  const summaryDefinition = tableSummaryDefinition(definition);
  const [rows, comparisonRows, summaryRows] = await Promise.all([
    run(resolvedControlState),
    comparison
      ? run({
          ...resolvedControlState,
          dateRange: comparisonDateRange(
            resolvedControlState.dateRange!,
            comparison,
            dashboard.timezone,
          ),
        })
      : Promise.resolve(undefined),
    summaryDefinition ? run(resolvedControlState, summaryDefinition) : undefined,
  ]);
  const alignedComparisonRows =
    comparisonRows && comparison && hasDateDimension(definition, metadata)
      ? alignDateComparisonRows(comparisonRows, comparison, resolvedDateRange)
      : comparisonRows;
  return {
    rows: normalize(rows),
    ...(alignedComparisonRows ? { comparisonRows: normalize(alignedComparisonRows) } : {}),
    ...(summaryRows?.[0] ? { summaryRow: normalize(summaryRows[0]) } : {}),
    controlState,
  };
}

async function compiledSql(dashboard: DashboardDocument, widget: DashboardWidget) {
  if (!('dataSourceId' in widget.definition)) return null;
  const dataSource = await loadDataSource(widget.definition.dataSourceId, dashboard.workspaceId);
  const metadata = await loadQueryMetadata(dataSource.id, dashboard.workspaceId);
  return compileWidgetQuery({
    dashboard,
    definition: widget.definition,
    dataSource,
    ...metadata,
    controlState: {},
    bucketName: env.R2_BUCKET_NAME,
    sourceTableName: 'rundown_source',
  }).sql;
}

async function definitionHash(definition: WidgetDefinition, workspaceId: string) {
  if (!('dataSourceId' in definition)) return hashJson(definition);
  const metadata = await loadQueryMetadata(definition.dataSourceId, workspaceId);
  return hashJson(widgetDependencyState(definition, metadata));
}

function validateControlState(dashboard: DashboardDocument, input: ControlState) {
  const state = controlStateSchema.parse(input);
  if (
    dashboard.widgets.some((widget) => widget.definition.type === 'dateControl') &&
    !state.dateRange
  )
    throw new ApiError(400, 'date_range_required', 'This dashboard requires a date range.');
  const controlIds = new Set(
    dashboard.widgets
      .filter((widget) => widget.definition.type === 'control')
      .map((widget) => widget.id),
  );
  for (const key of Object.keys(state.values ?? {}))
    if (!controlIds.has(key))
      throw new ApiError(400, 'unknown_control', `Unknown dashboard control ${key}.`);
  return state;
}

function widgetComparison(definition: WidgetDefinition) {
  if (!('comparison' in definition) || !definition.comparison) return undefined;
  return definition.comparison.mode === 'none' ? undefined : definition.comparison.mode;
}

function tableSummaryDefinition(definition: WidgetDefinition): WidgetDefinition | undefined {
  if (definition.type !== 'table' || !definition.showSummaryRow || !definition.dimensions.length)
    return undefined;
  return {
    ...definition,
    dimensions: [],
    resultLimit: { mode: 'top', amount: 1 },
    sort: undefined,
    showSummaryRow: false,
  };
}

function hasDateDimension(
  definition: WidgetDefinition,
  metadata: {
    fields: Array<{ id: string; semanticType: string }>;
    calculatedFields: Array<{ id: string; semanticType: string }>;
  },
) {
  const fieldId =
    definition.type === 'line' || definition.type === 'bar'
      ? definition.dimension.fieldId
      : undefined;
  return [...metadata.fields, ...metadata.calculatedFields].some(
    (field) => field.id === fieldId && field.semanticType === 'date',
  );
}

async function resolveControls(
  dashboard: DashboardDocument,
  definition: WidgetDefinition,
  targetFields: Array<{ id: string; canonicalName: string; semanticType: string }>,
  state: ControlState,
) {
  if (!('dataSourceId' in definition)) return [];
  const resolved: Array<{ fieldId: string; values: unknown[] }> = [];
  for (const [controlId, values] of Object.entries(state.values ?? {})) {
    const control = widgetById(dashboard, controlId);
    if (control.definition.type !== 'control') continue;
    const controlDefinition = control.definition;
    const sourceMetadata = await loadQueryMetadata(
      controlDefinition.dataSourceId,
      dashboard.workspaceId,
    );
    const sourceField = [...sourceMetadata.fields, ...sourceMetadata.calculatedFields].find(
      (field) => field.id === controlDefinition.fieldId,
    );
    if (!sourceField) continue;
    const target = targetFields.find(
      (field) =>
        field.canonicalName === sourceField.canonicalName &&
        compatibleSemanticTypes(field.semanticType, sourceField.semanticType),
    );
    if (target) resolved.push({ fieldId: target.id, values });
  }
  return resolved;
}

function compatibleSemanticTypes(left: string, right: string) {
  return left === right || (left === 'text' && right === 'text');
}

function definitionFieldIds(definition: WidgetDefinition) {
  const ids: string[] = [];
  if ('dateRangeFieldId' in definition) ids.push(definition.dateRangeFieldId);
  if ('fieldId' in definition) ids.push(definition.fieldId);
  if ('filter' in definition)
    ids.push(...(definition.filter?.conditions.map((condition) => condition.fieldId) ?? []));
  if ('dimension' in definition) ids.push(definition.dimension.fieldId);
  if ('dimensions' in definition)
    ids.push(...definition.dimensions.map((dimension) => dimension.fieldId));
  if ('breakdownDimension' in definition && definition.breakdownDimension)
    ids.push(definition.breakdownDimension.fieldId);
  const metrics =
    'metric' in definition
      ? [definition.metric]
      : 'metrics' in definition
        ? definition.metrics
        : [];
  ids.push(
    ...metrics.flatMap((metric) => (metric.source.kind === 'field' ? [metric.source.fieldId] : [])),
  );
  return ids;
}

function dashboardUsesDataSource(dashboard: DashboardDocument, dataSourceId: string) {
  return dashboard.widgets.some(
    (widget) =>
      'dataSourceId' in widget.definition && widget.definition.dataSourceId === dataSourceId,
  );
}

function seedField(
  dataSourceId: string,
  column: { column_name: string; column_type: string },
  samples: Record<string, unknown>[],
) {
  const idLike = /id$/iu.test(column.column_name);
  const dateLike = /DATE|TIMESTAMP/u.test(column.column_type);
  const numeric = /INT|DECIMAL|DOUBLE|FLOAT|REAL|HUGE/u.test(column.column_type);
  const values = [
    ...new Set(
      samples
        .map((row) => normalize(row[column.column_name]))
        .filter((value) => value !== null && value !== undefined)
        .map((value) => JSON.stringify(value)),
    ),
  ]
    .slice(0, 5)
    .map((value) => JSON.parse(value) as unknown);
  return {
    id: `field_${crypto.randomUUID()}`,
    dataSourceId,
    columnName: column.column_name,
    canonicalName: slug(column.column_name),
    label: humanize(column.column_name),
    role: idLike ? 'id' : dateLike ? 'date' : numeric ? 'metric' : 'dimension',
    semanticType: idLike ? 'id' : dateLike ? 'date' : numeric ? 'count' : 'text',
    defaultAggregation: numeric ? 'sum' : null,
    description: null,
    hidden: false,
    castTo: idLike ? 'VARCHAR' : null,
    sampleValues: values,
    cardinality: null,
  };
}

async function sharingState(dashboardId: string) {
  const [links, grants] = await Promise.all([
    database()
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.dashboardId, dashboardId), isNull(shareLinks.revokedAt))),
    database().select().from(dashboardGrants).where(eq(dashboardGrants.dashboardId, dashboardId)),
  ]);
  const userPages = await Promise.all(
    chunk(grants, 100).map((page) =>
      clerkClient().users.getUserList({
        userId: page.map((grant) => grant.clerkUserId),
        limit: page.length,
      }),
    ),
  );
  const userById = new Map(userPages.flatMap((page) => page.data).map((user) => [user.id, user]));
  return {
    links: links.map((link) => ({ ...link, url: `/share/${link.token}` })),
    grants: grants.map((grant) => {
      const user = userById.get(grant.clerkUserId);
      return {
        ...grant,
        userEmail: user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress,
        displayName:
          [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
          user?.username ||
          undefined,
      };
    }),
  };
}

function safeRequestIdentifiers(request: ApiRequest) {
  return {
    ...('dashboardId' in request ? { dashboardId: request.dashboardId } : {}),
    ...('widgetId' in request ? { widgetId: request.widgetId } : {}),
    ...('dataSourceId' in request ? { dataSourceId: request.dataSourceId } : {}),
  };
}

function chunk<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function slug(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[^A-Za-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .toLowerCase();
}
function humanize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/[_-]+/gu, ' ')
    .replace(/^./u, (letter) => letter.toUpperCase());
}
function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
}
