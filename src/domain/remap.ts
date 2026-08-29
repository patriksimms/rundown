import { widgetDefinitionSchema, type WidgetDefinition } from './schema';

interface FieldIdentity {
  id: string;
  canonicalName: string;
}

interface RemapMetadata {
  fields: FieldIdentity[];
  calculatedFields: FieldIdentity[];
}

export function remapWidgetDefinition(
  definition: WidgetDefinition,
  source: RemapMetadata,
  targetDataSourceId: string,
  target: RemapMetadata,
) {
  if (!('dataSourceId' in definition)) return definition;
  const sourceFields = [...source.fields, ...source.calculatedFields];
  const targetByCanonicalName = new Map(
    [...target.fields, ...target.calculatedFields].map((field) => [field.canonicalName, field.id]),
  );
  const fieldIdMap = new Map(
    sourceFields.map((field) => [field.id, targetByCanonicalName.get(field.canonicalName)]),
  );

  function replace(value: unknown): unknown {
    if (typeof value === 'string' && fieldIdMap.has(value)) {
      const replacement = fieldIdMap.get(value);
      if (!replacement) throw new Error(`Target datasource has no canonical field for ${value}.`);
      return replacement;
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replace(child)]));
    return value;
  }

  const remapped = widgetDefinitionSchema.parse(replace(definition));
  return widgetDefinitionSchema.parse({
    ...remapped,
    dataSourceId: targetDataSourceId,
  });
}
