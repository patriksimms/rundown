import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

export { QueryEngineContainer } from './query-engine-container';

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
