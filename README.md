# Rundown

Rundown turns reporting intent into query-backed client dashboards. Editors build in the GUI or
through WebMCP tools, viewers use stored widgets and controls, and admins register existing CSV or
parquet files from tenant-scoped R2 prefixes.

The TanStack Start app and API run in a Cloudflare Worker. Query execution runs in a Bun Cloudflare
Container with native DuckDB because DuckDB/WASM makes the Worker 10.93 MiB compressed, above the
paid Worker limit. The Worker authorizes the datasource and compiles SQL, then the container
materializes only that source into a temporary table and disables external access before compiling
user expressions.

## Local development

```sh
bun install
bun run dev
```

Docker must be running for local query execution. To work only on routes that do not query data,
start the app without local containers:

```sh
RUNDOWN_DISABLE_CONTAINERS=1 bun run dev
```

The app runs at `http://localhost:3000`. `GET /health` verifies the Worker can serve requests.

Run all checks and create the production build with:

```sh
bun run check
bun run build
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

The app is available at [rundown.rundown.workers.dev](https://rundown.rundown.workers.dev). Cloudflare deploys every push to `main`; pushes to other branches create preview versions.

The GitHub repository is connected with these Workers Builds settings:

```text
Production branch: main
Build command: bun run check && bun run build
Deploy command: bun run deploy:built
```

Set the `BUN_VERSION` build variable to `1.3.10`. Enable non-production branch builds to create preview versions for pull requests.

Set `CLOUDFLARE_ENV=preview` for non-production branch builds. Cloudflare does not select separate bindings for branch previews automatically. The named preview environment binds the preview D1 database, KV namespace, and R2 bucket.

Each environment needs these secrets:

- `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY`
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, from an R2 API token that can read the configured
  bucket

The R2 credentials are passed to the private query container at startup. Wrangler environments are
separate Workers, so production secrets do not carry over to preview.

The Worker name in Cloudflare must match the `name` in `wrangler.jsonc`, currently `rundown`.

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

The deployment also provisions `QueryEngineContainer` as a SQLite-backed Durable Object namespace.
Production permits five `basic` instances; preview permits two. Cloudflare Builds needs container
builds enabled so Wrangler can build and push the checked-in `Dockerfile`.

To recreate the infrastructure in another Cloudflare account, enable R2 once in the dashboard and create the private buckets with:

```sh
wrangler r2 bucket create rundown-data --location weur
wrangler r2 bucket create rundown-data-preview --location weur
```

Store objects under `ws/<workspaceId>/`. Datasource registration rejects keys outside the active
workspace prefix. Apply the D1 migration to preview before opening a preview build; applying it to
production remains a separate explicit step.
