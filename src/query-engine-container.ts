import { Container } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

export class QueryEngineContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  pingEndpoint = '/ready';
  sleepAfter = '10m';
  enableInternet = true;
  envVars = {
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
  };
}
