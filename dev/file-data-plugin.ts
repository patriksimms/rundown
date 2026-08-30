import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

const route = '/__dev-data';
const supportedExtensions = new Set(['.csv', '.parquet']);

export function fileDataPlugin(directory = 'dev-data'): Plugin {
  const root = resolve(directory);

  return {
    name: 'rundown-file-data',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        try {
          const url = new URL(request.url ?? '/', 'http://localhost');
          if (url.pathname !== route && !url.pathname.startsWith(`${route}/`)) return next();

          if (url.pathname === route) {
            if (request.method !== 'GET') return methodNotAllowed(response);
            const prefix = url.searchParams.get('prefix') ?? '';
            const workspace = workspacePath(prefix);
            const files = await listFiles(root, workspace.localPrefix);
            response.setHeader('content-type', 'application/json');
            response.end(
              JSON.stringify({
                objects: files.slice(0, 1000).map((file) => ({
                  key: `${workspace.keyPrefix}${file.key}`,
                  size: file.size,
                  etag: file.etag,
                  uploaded: file.uploaded.toISOString(),
                })),
                truncated: files.length > 1000,
              }),
            );
            return;
          }

          if (request.method !== 'GET' && request.method !== 'HEAD')
            return methodNotAllowed(response);
          const key = decodeURIComponent(url.pathname.slice(route.length + 1));
          const file = safeFilePath(root, workspacePath(key).localPrefix);
          if (!file || !supportedExtensions.has(extname(file).toLowerCase()))
            return notFound(response);
          const metadata = await stat(file).catch(() => undefined);
          if (!metadata?.isFile()) return notFound(response);

          const etag = fileEtag(metadata.size, metadata.mtimeMs);
          response.setHeader('accept-ranges', 'bytes');
          response.setHeader('etag', etag);
          response.setHeader('last-modified', metadata.mtime.toUTCString());
          response.setHeader(
            'content-type',
            extname(file).toLowerCase() === '.csv'
              ? 'text/csv; charset=utf-8'
              : 'application/vnd.apache.parquet',
          );

          const range = parseRange(request.headers.range, metadata.size);
          if (range === 'invalid') {
            response.statusCode = 416;
            response.setHeader('content-range', `bytes */${metadata.size}`);
            response.end();
            return;
          }
          const start = range?.start ?? 0;
          const end = range?.end ?? metadata.size - 1;
          response.statusCode = range ? 206 : 200;
          response.setHeader('content-length', Math.max(0, end - start + 1));
          if (range) response.setHeader('content-range', `bytes ${start}-${end}/${metadata.size}`);
          if (request.method === 'HEAD' || metadata.size === 0) {
            response.end();
            return;
          }
          createReadStream(file, { start, end }).pipe(response);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

interface ListedFile {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
}

async function listFiles(root: string, prefix: string): Promise<ListedFile[]> {
  const files: ListedFile[] = [];
  await walk(root, root, files);
  return files
    .filter((file) => file.key.startsWith(prefix))
    .sort((a, b) => a.key.localeCompare(b.key));
}

async function walk(root: string, directory: string, files: ListedFile[]) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(root, path, files);
      continue;
    }
    if (!entry.isFile() || !supportedExtensions.has(extname(entry.name).toLowerCase())) continue;
    const metadata = await stat(path);
    files.push({
      key: relative(root, path).split(sep).join('/'),
      size: metadata.size,
      etag: fileEtag(metadata.size, metadata.mtimeMs),
      uploaded: metadata.mtime,
    });
  }
}

function workspacePath(key: string) {
  const segments = key.split('/');
  if (segments[0] !== 'ws' || !segments[1]) return { keyPrefix: '', localPrefix: key };
  return {
    keyPrefix: `ws/${segments[1]}/`,
    localPrefix: segments.slice(2).join('/'),
  };
}

function safeFilePath(root: string, key: string) {
  const path = resolve(root, key);
  const pathRelativeToRoot = relative(root, path);
  return pathRelativeToRoot.startsWith('..') || isAbsolute(pathRelativeToRoot) ? undefined : path;
}

function parseRange(header: string | undefined, size: number) {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return 'invalid' as const;
  const requestedStart = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const requestedEnd = match[2] && match[1] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(requestedStart) ||
    !Number.isSafeInteger(requestedEnd) ||
    requestedStart < 0 ||
    requestedStart >= size ||
    requestedEnd < requestedStart
  )
    return 'invalid' as const;
  return { start: requestedStart, end: Math.min(requestedEnd, size - 1) };
}

function fileEtag(size: number, modified: number) {
  return `"${size.toString(16)}-${Math.floor(modified).toString(16)}"`;
}

function notFound(response: import('node:http').ServerResponse) {
  response.statusCode = 404;
  response.end();
}

function methodNotAllowed(response: import('node:http').ServerResponse) {
  response.statusCode = 405;
  response.setHeader('allow', 'GET, HEAD');
  response.end();
}
