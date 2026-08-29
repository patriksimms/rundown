# Rundown

Rundown turns reporting intent into query-backed client dashboards. Editors build in the GUI or
through WebMCP tools, viewers use stored widgets and controls, and admins register existing CSV or
parquet files from tenant-scoped R2 prefixes.

The TanStack Start app and API run in one Cloudflare Worker. Query execution runs in a second,
private Worker using Ducklings and DuckDB/WASM. A Service Binding connects them without exposing the
query Worker on a public route. The app Worker authorizes the datasource and compiles SQL. The query
Worker materializes only that source into a temporary table and disables external access before
compiling user expressions.

## Local development

```sh
bun install
bun run dev
```

The development server starts both Workers and wires the local Service Binding. The build copies the
WASM module from the installed Ducklings package into an ignored local file before Vite starts.
Export `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` before querying local data.

The app runs at `http://localhost:3000`. `GET /health` verifies the Worker can serve requests.

Run all checks and create the production build with:

```sh
bun run check
bun run build
bun run deploy:dry-run
bun run test:e2e
```

`GET /health` checks that the Worker can serve requests. `GET /ready` also reads D1, KV, and R2. It returns `503` and logs the failed dependency when any binding is unavailable.

## Database

The application uses Drizzle for its schema and queries. Drizzle Kit generates SQL migrations, and Wrangler applies the committed SQL to D1.

```sh
# Generate a migration after changing src/db/schema.ts
bun run db:generate -- --name=describe-the-change

# Apply migrations to local Wrangler state
bun run db:migrate:local

# Apply migrations to the shared preview database
bun run db:migrate:preview

# Apply migrations to production explicitly
bun run db:migrate:production
```

`bun run check` applies every migration to a fresh temporary D1 database. Do not use `drizzle-kit push` against remote databases.

## Cloudflare deployment

The app is available at [rundown.rundown.workers.dev](https://rundown.rundown.workers.dev).
Cloudflare deploys every push to `main`. One Vite build produces both Workers. Deployment uploads the
private query Worker first and the app Worker second, so the Service Binding always has a target.

The GitHub repository is connected with these Workers Builds settings:

```text
Production branch: main
Build command: bun run check && bun run build
Deploy command: bun run deploy:built
Non-production deploy command: bun run deploy:dry-run
```

Set the `BUN_VERSION` build variable to `1.3.10`. Enable non-production branch builds to validate pull requests without uploading a Worker version.

The named preview environment remains available for deliberate preview deployments with
`bun run deploy:preview`, but is not used by pull-request checks.

The app Worker needs `CLERK_SECRET_KEY` in each environment. Cloudflare Builds needs
`VITE_CLERK_PUBLISHABLE_KEY` as a build variable.

The private query Worker needs `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` from an R2 API token that
can read the configured bucket. Wrangler environments are separate Workers, so production secrets
do not carry over to preview.

The Worker names in Cloudflare must match the configs: `rundown` and `rundown-query` in production,
then `rundown-preview` and `rundown-query-preview` in preview.

To deploy from a local authenticated shell instead:

```sh
bun run deploy
```

The Worker expects these private resources:

| Resource | Production            | Preview                       |
| -------- | --------------------- | ----------------------------- |
| D1       | `rundown-app`         | `rundown-app-preview`         |
| KV       | `rundown-query-cache` | `rundown-query-cache-preview` |
| R2       | `rundown-data`        | `rundown-data-preview`        |
| Worker   | `rundown-query`       | `rundown-query-preview`       |

The query Worker has no route and `workers_dev` is disabled. It is reachable only through the app
Worker's `QUERY_ENGINE` Service Binding. Its compressed upload is 10,211.58 KiB, about 28 KiB below
Cloudflare's 10 MiB paid-Worker limit. Keep dependencies and generic validation libraries out of
that Worker unless a dry-run proves the bundle still fits.

To recreate the infrastructure in another Cloudflare account, enable R2 once in the dashboard and create the private buckets with:

```sh
wrangler r2 bucket create rundown-data --location weur
wrangler r2 bucket create rundown-data-preview --location weur
```

Store objects under `ws/<workspaceId>/`. Datasource registration rejects keys outside the active
workspace prefix. Apply the D1 migration to preview before opening a preview build; applying it to
production remains a separate explicit step.
