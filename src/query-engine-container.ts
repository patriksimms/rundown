import { Container } from '@cloudflare/containers';
import { handleInternalR2Request, INTERNAL_R2_HOST } from '#/data/internal-r2';

export class QueryEngineContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  pingEndpoint = '/ready';
  sleepAfter = '10m';
  enableInternet = false;
}

QueryEngineContainer.outboundByHost = {
  [INTERNAL_R2_HOST]: handleInternalR2Request,
};
