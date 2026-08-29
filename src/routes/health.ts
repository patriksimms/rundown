import { createFileRoute } from '@tanstack/react-router';

// TanStack Start adds the server route types through this type-only import.
import type {} from '@tanstack/react-start';

import { createHealthResponse } from '../health';

export const Route = createFileRoute('/health')({
  server: {
    handlers: {
      GET: () => createHealthResponse(),
    },
  },
});
