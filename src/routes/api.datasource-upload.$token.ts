import { createFileRoute } from '@tanstack/react-router';
import type {} from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import { handleBrowserUploadRequest } from '#/data/internal-r2';
import { ApiError } from '#/server/errors';
import { requireSession } from '#/server/auth.server';

export const Route = createFileRoute('/api/datasource-upload/$token')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try {
          const session = await requireSession();
          return handleBrowserUploadRequest(request, params.token, env, {
            userId: session.userId,
            workspaceId: session.workspace.id,
            workspacePrefix: session.workspace.r2Prefix,
          });
        } catch (error) {
          if (error instanceof ApiError)
            return Response.json({ error: error.message }, { status: error.status });
          throw error;
        }
      },
    },
  },
});
