import { createFileRoute } from '@tanstack/react-router';

// TanStack Start adds the server route types through this type-only import.
import type {} from '@tanstack/react-start';

import { handleReadinessRequest } from '../readiness.server';

export const Route = createFileRoute('/ready')({
  server: {
    handlers: {
      GET: handleReadinessRequest,
    },
  },
});
