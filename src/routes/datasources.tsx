import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callApi } from '#/api/client';
import { AppShell } from '#/components/app-shell';
import { ErrorState, LoadingState } from '#/components/request-state';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert';
import { Button } from '#/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field';
import { Input } from '#/components/ui/input';
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select';
import { Separator } from '#/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs';
import { Textarea } from '#/components/ui/textarea';
import { useWebMcpTools } from '#/webmcp/use-webmcp-tools';

export const Route = createFileRoute('/datasources')({ component: DatasourcesPage });
interface Bootstrap {
  isAdmin: boolean;
  dataSources: Array<{ id: string; name: string }>;
}
interface Description {
  id: string;
  name: string;
  fields: FieldRecord[];
  calculatedFields: Array<{
    id: string;
    label: string;
    canonicalName: string;
    expression: string;
    role: string;
    semanticType: string;
    description?: string;
  }>;
  libraryMetrics: Array<{
    id: string;
    name: string;
    canonicalName: string;
    expression: string;
    semanticType: string;
    description?: string;
  }>;
}
interface FieldRecord {
  id: string;
  columnName: string;
  canonicalName: string;
  label: string;
  role: 'dimension' | 'metric' | 'date' | 'id';
  semanticType: 'currency' | 'count' | 'ratio' | 'text' | 'date' | 'id';
  description: string | null;
  hidden: boolean;
  castTo: string | null;
  sampleValues: unknown[] | null;
}

function DatasourcesPage() {
  const [bootstrap, setBootstrap] = useState<Bootstrap>();
  const [selected, setSelected] = useState<string>();
  const [description, setDescription] = useState<Description>();
  const [objects, setObjects] = useState<Array<{ key: string }>>([]);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    try {
      const data = await callApi<Bootstrap>({ action: 'bootstrap' });
      setBootstrap(data);
      const id = selected ?? data.dataSources[0]?.id;
      if (id) {
        setSelected(id);
        setDescription(
          await callApi<Description>({ action: 'describeDatasource', dataSourceId: id }),
        );
      }
      if (data.isAdmin)
        setObjects(
          (await callApi<{ objects: Array<{ key: string }> }>({ action: 'listR2Objects' })).objects,
        );
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [selected]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useWebMcpTools({ isAdmin: bootstrap?.isAdmin, onMutation: refresh });
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        {error ? (
          <ErrorState error={error} />
        ) : !bootstrap ? (
          <LoadingState />
        ) : !bootstrap.isAdmin ? (
          <Alert>
            <AlertTitle>Admin access required</AlertTitle>
            <AlertDescription>
              Datasource registration and workspace metrics are managed by Clerk organization
              admins.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Datasources</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Register existing R2 files, then correct only the field metadata that matters.
              </p>
            </div>
            <Tabs defaultValue="fields">
              <TabsList>
                <TabsTrigger value="fields">Fields</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
                <TabsTrigger value="formulas">Formulas</TabsTrigger>
              </TabsList>
              <TabsContent value="fields" className="pt-5">
                <Field className="mb-5 max-w-sm">
                  <FieldLabel htmlFor="source-picker">Datasource</FieldLabel>
                  <NativeSelect
                    id="source-picker"
                    value={selected ?? ''}
                    onChange={(event) => setSelected(event.target.value)}
                  >
                    {bootstrap.dataSources.map((source) => (
                      <NativeSelectOption key={source.id} value={source.id}>
                        {source.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                {description ? <FieldTable source={description} refresh={refresh} /> : null}
              </TabsContent>
              <TabsContent value="register" className="pt-5">
                <RegisterForm objects={objects} refresh={refresh} />
              </TabsContent>
              <TabsContent value="formulas" className="pt-5">
                {description ? (
                  <FormulaForms source={description} refresh={refresh} />
                ) : (
                  <p className="text-sm text-muted-foreground">Register a datasource first.</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </AppShell>
  );
}

function FieldTable({ source, refresh }: { source: Description; refresh: () => Promise<void> }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Column</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Canonical name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Description</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {source.fields.map((field) => (
            <FieldRow key={field.id} sourceId={source.id} field={field} refresh={refresh} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
function FieldRow({
  sourceId,
  field,
  refresh,
}: {
  sourceId: string;
  field: FieldRecord;
  refresh: () => Promise<void>;
}) {
  const [value, setValue] = useState(field);
  async function save() {
    await callApi({
      action: 'updateFieldMetadata',
      dataSourceId: sourceId,
      columnName: field.columnName,
      patch: {
        label: value.label,
        canonicalName: value.canonicalName,
        role: value.role,
        semanticType: value.semanticType,
        description: value.description,
        hidden: value.hidden,
        castTo: value.castTo,
      },
    });
    await refresh();
  }
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{field.columnName}</TableCell>
      <TableCell>
        <Input
          aria-label={`${field.columnName} label`}
          value={value.label}
          onChange={(event) => setValue({ ...value, label: event.target.value })}
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label={`${field.columnName} canonical name`}
          value={value.canonicalName}
          onChange={(event) => setValue({ ...value, canonicalName: event.target.value })}
        />
      </TableCell>
      <TableCell>
        <NativeSelect
          aria-label={`${field.columnName} role`}
          value={value.role}
          onChange={(event) =>
            setValue({ ...value, role: event.target.value as FieldRecord['role'] })
          }
        >
          {['dimension', 'metric', 'date', 'id'].map((item) => (
            <NativeSelectOption key={item} value={item}>
              {item}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </TableCell>
      <TableCell>
        <NativeSelect
          aria-label={`${field.columnName} semantic type`}
          value={value.semanticType}
          onChange={(event) =>
            setValue({ ...value, semanticType: event.target.value as FieldRecord['semanticType'] })
          }
        >
          {['currency', 'count', 'ratio', 'text', 'date', 'id'].map((item) => (
            <NativeSelectOption key={item} value={item}>
              {item}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </TableCell>
      <TableCell>
        <Input
          aria-label={`${field.columnName} description`}
          value={value.description ?? ''}
          onChange={(event) => setValue({ ...value, description: event.target.value })}
        />
      </TableCell>
      <TableCell>
        <Button variant="outline" size="sm" onClick={save}>
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

function RegisterForm({
  objects,
  refresh,
}: {
  objects: Array<{ key: string }>;
  refresh: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [key, setKey] = useState(objects[0]?.key ?? '');
  const [kind, setKind] = useState<'object' | 'prefix'>('object');
  const [format, setFormat] = useState<'csv' | 'parquet'>('csv');
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    if (!key && objects[0]) setKey(objects[0].key);
  }, [key, objects]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await callApi({ action: 'registerDatasource', name, location: { kind, key, format } });
    setMessage(`${name} registered.`);
    await refresh();
  }
  return (
    <form className="max-w-xl" onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="source-name">Name</FieldLabel>
          <Input id="source-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="source-key">R2 key or prefix</FieldLabel>
          <NativeSelect
            id="source-key"
            value={key}
            onChange={(event) => setKey(event.target.value)}
          >
            {objects.map((object) => (
              <NativeSelectOption key={object.key} value={object.key}>
                {object.key}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="source-kind">Location</FieldLabel>
          <NativeSelect
            id="source-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <NativeSelectOption value="object">Single object</NativeSelectOption>
            <NativeSelectOption value="prefix">Partition prefix</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="source-format">Format</FieldLabel>
          <NativeSelect
            id="source-format"
            value={format}
            onChange={(event) => setFormat(event.target.value as typeof format)}
          >
            <NativeSelectOption value="csv">CSV</NativeSelectOption>
            <NativeSelectOption value="parquet">Parquet</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Button type="submit">Register datasource</Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </FieldGroup>
    </form>
  );
}

function FormulaForms({ source, refresh }: { source: Description; refresh: () => Promise<void> }) {
  const [calculated, setCalculated] = useState({ name: '', expression: '', description: '' });
  const [metric, setMetric] = useState({ name: '', expression: '', description: '' });
  async function saveCalculated(event: FormEvent) {
    event.preventDefault();
    await callApi({
      action: 'upsertCalculatedField',
      dataSourceId: source.id,
      name: calculated.name,
      expression: calculated.expression,
      role: 'metric',
      semanticType: 'count',
      description: calculated.description,
    });
    setCalculated({ name: '', expression: '', description: '' });
    await refresh();
  }
  async function saveMetric(event: FormEvent) {
    event.preventDefault();
    await callApi({
      action: 'upsertLibraryMetric',
      name: metric.name,
      expression: metric.expression,
      semanticType: 'ratio',
      description: metric.description,
    });
    setMetric({ name: '', expression: '', description: '' });
    await refresh();
  }
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <FormulaForm
        title="Calculated field"
        description="Row-level DuckDB expression over this datasource's raw columns."
        value={calculated}
        setValue={setCalculated}
        onSubmit={saveCalculated}
      />
      <FormulaForm
        title="Library metric"
        description="Aggregate DuckDB expression over canonical field names."
        value={metric}
        setValue={setMetric}
        onSubmit={saveMetric}
      />
      <div className="lg:col-span-2">
        <Separator className="mb-5" />
        <h2 className="mb-3 text-lg font-semibold">Available formulas</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Canonical name</TableHead>
                <TableHead>Expression</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...source.calculatedFields, ...source.libraryMetrics].map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{'label' in item ? item.label : item.name}</TableCell>
                  <TableCell>{item.canonicalName}</TableCell>
                  <TableCell className="font-mono text-xs">{item.expression}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
function FormulaForm({
  title,
  description,
  value,
  setValue,
  onSubmit,
}: {
  title: string;
  description: string;
  value: { name: string; expression: string; description: string };
  setValue: (value: { name: string; expression: string; description: string }) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${title}-name`}>Name</FieldLabel>
          <Input
            id={`${title}-name`}
            value={value.name}
            onChange={(event) => setValue({ ...value, name: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${title}-expression`}>Expression</FieldLabel>
          <Textarea
            id={`${title}-expression`}
            value={value.expression}
            onChange={(event) => setValue({ ...value, expression: event.target.value })}
          />
          <FieldDescription>Semicolons and external reads are rejected.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${title}-description`}>Description</FieldLabel>
          <Input
            id={`${title}-description`}
            value={value.description}
            onChange={(event) => setValue({ ...value, description: event.target.value })}
          />
        </Field>
        <Button type="submit">Save</Button>
      </FieldGroup>
    </form>
  );
}
