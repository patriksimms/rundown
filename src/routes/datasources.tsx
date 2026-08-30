import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callApi } from '#/api/client';
import { AppShell } from '#/components/app-shell';
import { ErrorState, LoadingState } from '#/components/request-state';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert';
import { Button } from '#/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field';
import { Input } from '#/components/ui/input';
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs';
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
  return (
    <AppShell requireWorkspace>
      <DatasourcesContent />
    </AppShell>
  );
}

function DatasourcesContent() {
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
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {error ? (
        <ErrorState error={error} />
      ) : !bootstrap ? (
        <LoadingState />
      ) : !bootstrap.isAdmin ? (
        <Alert>
          <AlertTitle>Admin access required</AlertTitle>
          <AlertDescription>
            Datasource registration and workspace metrics are managed by Clerk organization admins.
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
          </Tabs>
        </div>
      )}
    </main>
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
