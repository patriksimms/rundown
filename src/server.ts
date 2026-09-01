import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { handleResetRequest } from './reset.server';

export { QueryEngineContainer } from './query-engine-container';
export { ContainerProxy } from '@cloudflare/containers';

export default createServerEntry({
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/reset') return handleResetRequest(request);
    return handler.fetch(request);
  },
});
