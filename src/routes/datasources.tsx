import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiClientError, callApi } from '#/api/client';
import { AppShell } from '#/components/app-shell';
import { ErrorState, LoadingState } from '#/components/request-state';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert';
import { Button } from '#/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '#/components/ui/field';
import { Input } from '#/components/ui/input';
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select';
import { Progress, ProgressLabel, ProgressValue } from '#/components/ui/progress';
import { Switch } from '#/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs';
import {
  datasourceNameFromFileName,
  datasourceUploadFormat,
  MAX_DATASOURCE_FILE_BYTES,
  type DatasourceUploadEvent,
  type DatasourceUploadFormat,
} from '#/domain/datasource-upload';
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
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    try {
      const data = await callApi<Bootstrap>({ action: 'bootstrap' });
      setBootstrap(data);
      const id = selected ?? data.dataSources[0]?.id;
      if (id && data.isAdmin) {
        setSelected(id);
        setDescription(
          await callApi<Description>({ action: 'describeDatasource', dataSourceId: id }),
        );
      }
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [selected]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useWebMcpTools({
    canManageDataSources: Boolean(bootstrap),
    isAdmin: bootstrap?.isAdmin,
    onMutation: refresh,
  });
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {error ? (
        <ErrorState error={error} />
      ) : !bootstrap ? (
        <LoadingState />
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Datasources</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a CSV or Parquet file, or register data already in this workspace.
            </p>
          </div>
          <Tabs defaultValue={bootstrap.isAdmin ? 'fields' : 'register'}>
            <TabsList>
              {bootstrap.isAdmin ? <TabsTrigger value="fields">Fields</TabsTrigger> : null}
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            {bootstrap.isAdmin ? (
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
            ) : null}
            <TabsContent value="register" className="pt-5">
              <RegisterForm refresh={refresh} />
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
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  async function save() {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
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
        <Button variant="outline" size="sm" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </TableCell>
    </TableRow>
  );
}

function RegisterForm({ refresh }: { refresh: () => Promise<void> }) {
  const [useExistingData, setUseExistingData] = useState(false);
  const [objects, setObjects] = useState<Array<{ key: string }>>([]);
  const [objectsCursor, setObjectsCursor] = useState<string>();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [kind, setKind] = useState<'object' | 'prefix'>('object');
  const [format, setFormat] = useState<DatasourceUploadFormat>('csv');
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<
    'idle' | 'preparing' | 'uploading' | 'registering' | 'inspecting' | 'removing'
  >('idle');
  const [uploadedKey, setUploadedKey] = useState<string>();
  const [cleanupToken, setCleanupToken] = useState<string>();
  const [registrationFailure, setRegistrationFailure] = useState<'inspection' | 'other'>();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const uploadRequest = useRef<XMLHttpRequest | undefined>(undefined);
  const uploadStartedAt = useRef(0);
  useEffect(() => {
    if (!key && objects[0]) setKey(objects[0].key);
  }, [key, objects]);

  useEffect(() => {
    if (!useExistingData || objects.length) return;
    void callApi<{ objects: Array<{ key: string }>; cursor?: string }>({
      action: 'listR2Objects',
    })
      .then((listing) => {
        setObjects(listing.objects);
        setObjectsCursor(listing.cursor);
      })
      .catch((caught: unknown) =>
        setFormError(caught instanceof Error ? caught.message : String(caught)),
      );
  }, [objects.length, useExistingData]);

  const inferredExistingFormat = kind === 'object' ? datasourceUploadFormat(key) : undefined;

  async function loadMoreObjects() {
    if (!objectsCursor) return;
    try {
      const listing = await callApi<{ objects: Array<{ key: string }>; cursor?: string }>({
        action: 'listR2Objects',
        cursor: objectsCursor,
      });
      setFormError(undefined);
      setObjects((current) => [...current, ...listing.objects]);
      setObjectsCursor(listing.cursor);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : String(caught));
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(undefined);
    setMessage(undefined);
    setRegistrationFailure(undefined);
    if (useExistingData) {
      setPhase('registering');
      try {
        await callApi({
          action: 'registerDatasource',
          name,
          location: { kind, key, format: inferredExistingFormat ?? format },
        });
        setMessage(`${name} registered.`);
        await refresh();
      } catch (caught) {
        setFormError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setPhase('idle');
      }
      return;
    }
    if (!file) {
      setFileError('Choose a CSV or Parquet file.');
      return;
    }
    const uploadFormat = datasourceUploadFormat(file.name);
    const validationError = validateFile(file, uploadFormat);
    if (!uploadFormat || validationError) {
      setFileError(validationError ?? 'Choose a CSV or Parquet file.');
      return;
    }

    uploadStartedAt.current = Date.now();
    setProgress(0);
    trackUpload('started', file, uploadFormat, 0);
    setPhase('preparing');
    let prepared: { key: string; uploadUrl: string; cleanupToken: string };
    try {
      prepared = await callApi<{ key: string; uploadUrl: string; cleanupToken: string }>({
        action: 'prepareDatasourceUpload',
        fileName: file.name,
        fileSize: file.size,
        format: uploadFormat,
      });
      setPhase('uploading');
      await uploadDatasourceFile(file, prepared.uploadUrl, setProgress, (request) => {
        uploadRequest.current = request;
      });
      setUploadedKey(prepared.key);
      setCleanupToken(prepared.cleanupToken);
      setPhase('inspecting');
      trackUpload('completed', file, uploadFormat, Date.now() - uploadStartedAt.current);
    } catch (caught) {
      setPhase('idle');
      setProgress(0);
      uploadRequest.current = undefined;
      const cancelled = caught instanceof UploadCancelledError;
      trackUpload(
        cancelled ? 'cancelled' : 'failed',
        file,
        uploadFormat,
        Date.now() - uploadStartedAt.current,
      );
      setFormError(
        cancelled
          ? 'Upload cancelled. Start again when you are ready.'
          : caught instanceof Error
            ? caught.message
            : String(caught),
      );
      return;
    }

    try {
      await callApi({
        action: 'registerDatasource',
        name,
        location: { kind: 'object', key: prepared.key, format: uploadFormat },
        cleanupToken: prepared.cleanupToken,
      });
      trackUpload(
        'datasource_registered',
        file,
        uploadFormat,
        Date.now() - uploadStartedAt.current,
      );
      setMessage(`${name} uploaded and registered.`);
      setFile(undefined);
      if (fileInput.current) fileInput.current.value = '';
      setUploadedKey(undefined);
      setCleanupToken(undefined);
      setRegistrationFailure(undefined);
      setProgress(0);
      setPhase('idle');
      await refresh();
    } catch (caught) {
      setPhase('idle');
      const inspectionFailed =
        caught instanceof ApiClientError && caught.code === 'datasource_inspection_failed';
      setRegistrationFailure(inspectionFailed ? 'inspection' : 'other');
      if (inspectionFailed)
        trackUpload('inspection_failed', file, uploadFormat, Date.now() - uploadStartedAt.current);
      setFormError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function selectFile(selectedFile?: File) {
    setMessage(undefined);
    setFormError(undefined);
    setRegistrationFailure(undefined);
    setFileError(undefined);
    if (!selectedFile) {
      setFile(undefined);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    const selectedFormat = datasourceUploadFormat(selectedFile.name);
    const validationError = validateFile(selectedFile, selectedFormat);
    if (!selectedFormat || validationError) {
      setFile(undefined);
      if (fileInput.current) fileInput.current.value = '';
      setFileError(validationError ?? 'Choose a CSV or Parquet file.');
      return;
    }
    setFile(selectedFile);
    setName(datasourceNameFromFileName(selectedFile.name));
  }

  async function removeFile() {
    if (!uploadedKey || !cleanupToken || !file) return;
    const uploadFormat = datasourceUploadFormat(file.name);
    if (!uploadFormat) return;
    setPhase('removing');
    try {
      await callApi({ action: 'removeDatasourceUpload', key: uploadedKey, cleanupToken });
      trackUpload('file_removed', file, uploadFormat, Date.now() - uploadStartedAt.current);
      setFile(undefined);
      if (fileInput.current) fileInput.current.value = '';
      setUploadedKey(undefined);
      setCleanupToken(undefined);
      setRegistrationFailure(undefined);
      setProgress(0);
      setFormError(undefined);
      setMessage('File removed.');
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPhase('idle');
    }
  }

  const busy = phase !== 'idle';
  return (
    <form className="max-w-xl" onSubmit={submit}>
      <FieldGroup>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="use-existing-data">Use existing workspace data</FieldLabel>
          <Switch
            id="use-existing-data"
            checked={useExistingData}
            onCheckedChange={setUseExistingData}
            disabled={busy || Boolean(uploadedKey)}
          />
        </Field>
        {!useExistingData ? (
          <Field data-invalid={Boolean(fileError)}>
            <FieldLabel htmlFor="source-file">File</FieldLabel>
            <Input
              id="source-file"
              ref={fileInput}
              type="file"
              accept=".csv,.parquet,text/csv,application/vnd.apache.parquet"
              aria-invalid={Boolean(fileError)}
              disabled={busy || Boolean(uploadedKey)}
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <FieldDescription>CSV or Parquet, maximum 100 MB</FieldDescription>
            <FieldError>{fileError}</FieldError>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="source-name">Name</FieldLabel>
          <Input
            id="source-name"
            value={name}
            required
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {useExistingData ? (
          <>
            <Field>
              <FieldLabel htmlFor="source-key">R2 key or prefix</FieldLabel>
              <Input
                id="source-key"
                list="workspace-objects"
                value={key}
                required
                onChange={(event) => setKey(event.target.value)}
              />
              <datalist id="workspace-objects">
                {objects.map((object) => (
                  <option key={object.key} value={object.key} />
                ))}
              </datalist>
              {objectsCursor ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadMoreObjects()}
                >
                  Load more objects
                </Button>
              ) : null}
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
            {!inferredExistingFormat ? (
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
            ) : null}
          </>
        ) : null}
        {phase === 'uploading' ? (
          <Progress value={progress} aria-label="Upload progress">
            <ProgressLabel>Uploading</ProgressLabel>
            <ProgressValue>{(_, value) => `${Math.round(value ?? 0)}%`}</ProgressValue>
          </Progress>
        ) : null}
        {phase === 'preparing' ? (
          <p className="text-sm text-muted-foreground">Preparing upload...</p>
        ) : null}
        {phase === 'registering' ? (
          <p className="text-sm text-muted-foreground">Registering datasource...</p>
        ) : null}
        {phase === 'inspecting' ? (
          <p className="text-sm text-muted-foreground">Inspecting file with DuckDB...</p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || Boolean(uploadedKey)}>
            {useExistingData ? 'Register datasource' : 'Upload and register'}
          </Button>
          {phase === 'uploading' ? (
            <Button type="button" variant="outline" onClick={() => uploadRequest.current?.abort()}>
              Cancel upload
            </Button>
          ) : null}
        </div>
        {formError ? (
          <Alert variant="destructive">
            <AlertTitle>
              {uploadedKey
                ? registrationFailure === 'inspection'
                  ? 'File uploaded, inspection failed'
                  : 'File uploaded, registration failed'
                : 'Could not continue'}
            </AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        {uploadedKey ? (
          <Button type="button" variant="outline" disabled={busy} onClick={removeFile}>
            Remove file
          </Button>
        ) : null}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </FieldGroup>
    </form>
  );
}

function validateFile(file: File, format: DatasourceUploadFormat | undefined) {
  if (!format) return 'Choose a CSV or Parquet file.';
  if (file.size > MAX_DATASOURCE_FILE_BYTES) return 'The file is larger than 100 MB.';
  if (file.size === 0) return 'The file is empty.';
  return undefined;
}

function uploadDatasourceFile(
  file: File,
  uploadUrl: string,
  onProgress: (progress: number) => void,
  onRequest: (request: XMLHttpRequest) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    onRequest(request);
    request.open('PUT', uploadUrl);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload returned HTTP ${request.status}.`));
      }
    });
    request.addEventListener('error', () => reject(new Error('The upload failed. Try again.')));
    request.addEventListener('abort', () => reject(new UploadCancelledError()));
    request.send(file);
  });
}

class UploadCancelledError extends Error {}

function trackUpload(
  event: DatasourceUploadEvent['event'],
  file: File,
  format: DatasourceUploadFormat,
  durationMs: number,
) {
  void callApi({
    action: 'trackDatasourceUpload',
    event,
    fileSize: file.size,
    format,
    durationMs,
  }).catch(() => undefined);
}
