import { env } from 'cloudflare:workers';
import { AwsClient } from 'aws4fetch';
import { z } from 'zod';
import { datasourceUploadKey, type DatasourceUploadFormat } from '#/domain/datasource-upload';
import { compileSourceSqlFromBaseUrl } from '#/query/compiler';
import type { DataSourceRecord } from '#/query/types';

const sourceObjectSchema = z.object({
  key: z.string(),
  size: z.number().nonnegative(),
  etag: z.string(),
  uploaded: z.coerce.date(),
});

const sourceListingSchema = z.object({
  objects: z.array(sourceObjectSchema),
  truncated: z.boolean(),
  cursor: z.string().optional(),
});

export type SourceObject = z.infer<typeof sourceObjectSchema>;
export type SourceListing = z.infer<typeof sourceListingSchema>;

export async function listSourceObjects(prefix?: string): Promise<SourceListing> {
  if (usesR2()) {
    const listing = await env.DATA.list({ prefix, limit: 1000 });
    return {
      objects: listing.objects.map(({ key, size, etag, uploaded }) => ({
        key,
        size,
        etag,
        uploaded,
      })),
      truncated: listing.truncated,
      cursor: listing.truncated ? listing.cursor : undefined,
    };
  }

  const url = new URL(env.DATA_SOURCE_BASE_URL);
  if (prefix) url.searchParams.set('prefix', prefix);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Local data listing returned HTTP ${response.status}.`);
  return sourceListingSchema.parse(await response.json());
}

export async function headSourceObject(key: string): Promise<SourceObject | null> {
  if (usesR2()) {
    const object = await env.DATA.head(key);
    return object
      ? { key: object.key, size: object.size, etag: object.etag, uploaded: object.uploaded }
      : null;
  }

  const response = await fetch(sourceUrl(key), { method: 'HEAD' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Local data lookup returned HTTP ${response.status}.`);
  const size = Number(response.headers.get('content-length'));
  return sourceObjectSchema.parse({
    key,
    size,
    etag: response.headers.get('etag'),
    uploaded: response.headers.get('last-modified'),
  });
}

export async function prepareSourceUpload(workspacePrefix: string, format: DatasourceUploadFormat) {
  const key = datasourceUploadKey(workspacePrefix, format);
  if (!usesR2()) {
    return { key, uploadUrl: sourceUrl(key) };
  }

  const signer = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
  const objectUrl = new URL(
    `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${encodeURIComponent(env.R2_BUCKET_NAME)}/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
  );
  objectUrl.searchParams.set('X-Amz-Expires', '900');
  const signed = await signer.sign(new Request(objectUrl, { method: 'PUT' }), {
    aws: { signQuery: true },
  });
  return { key, uploadUrl: signed.url };
}

export async function deleteSourceObject(key: string) {
  if (usesR2()) {
    await env.DATA.delete(key);
    return;
  }
  const response = await fetch(sourceUrl(key), { method: 'DELETE' });
  if (response.status !== 404 && !response.ok)
    throw new Error(`Local data deletion returned HTTP ${response.status}.`);
}

export async function resolveDataSource(dataSource: DataSourceRecord) {
  if (usesR2()) {
    return {
      sql: compileSourceSqlFromBaseUrl(dataSource, env.QUERY_DATA_SOURCE_BASE_URL),
      requiresR2Credentials: true,
    };
  }

  const keys =
    dataSource.location.kind === 'object'
      ? [dataSource.location.key]
      : (await listSourceObjects(dataSource.location.key)).objects
          .map((object) => object.key)
          .filter((key) => key.endsWith(`.${dataSource.location.format}`));
  if (!keys.length) throw new Error('No matching local data files were found.');
  return {
    sql: compileSourceSqlFromBaseUrl(dataSource, env.QUERY_DATA_SOURCE_BASE_URL, keys),
    requiresR2Credentials: false,
  };
}

export async function checkSourceStorage() {
  if (usesR2()) {
    await env.DATA.list({ limit: 1, prefix: '__readiness__/' });
    return;
  }
  const response = await fetch(env.DATA_SOURCE_BASE_URL, { method: 'GET' });
  if (!response.ok) throw new Error(`Local data service returned HTTP ${response.status}.`);
  await response.body?.cancel();
}

function usesR2() {
  return env.DATA_SOURCE_BASE_URL.startsWith('r2://');
}

function sourceUrl(key: string) {
  const base = env.DATA_SOURCE_BASE_URL.replace(/\/$/u, '');
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
