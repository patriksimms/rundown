# Rundown

Rundown turns reporting intent into query-backed client dashboards. Editors build in the GUI or
through WebMCP tools, viewers use stored widgets and controls, and editors register uploaded or
existing CSV and Parquet files from tenant-scoped R2 prefixes.

The TanStack Start app and API run in a Cloudflare Worker. Query execution runs in a Bun Cloudflare
Container with native DuckDB. The Worker authorizes the datasource and compiles SQL, then the
container materializes only that source into a temporary table and disables external access before
compiling user expressions.

## Local development

```sh
bun install
bun run db:migrate:local
bun run dev
```

Docker must be running for local query execution. Upload files from the datasource registration
screen or place CSV and Parquet files in `dev-data/`. Local workspaces see those files under their
tenant-scoped `ws/<workspaceId>/` prefix. Vite serves the files with upload, deletion, and range
request support so the query container can read them without R2 credentials or a separate
object-storage service.

For example:

```sh
cp reporting_example.csv dev-data/
```

Local D1 and KV data persist in `.wrangler/`. The application still uses R2 bindings and direct
DuckDB R2 reads in built and deployed containers. To work only on routes that do not query data,
start the app without local containers:

```sh
RUNDOWN_DISABLE_CONTAINERS=1 bun run dev
```

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
Cloudflare deploys every push to `main`. The Worker deployment also builds and uploads the query
container image.

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

Each environment needs `CLERK_SECRET_KEY`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. The R2
credentials come from an API token that can read the configured bucket and are passed to the private
query container at startup. Cloudflare Builds needs `VITE_CLERK_PUBLISHABLE_KEY` as a build variable.
Wrangler environments are separate Workers, so production secrets do not carry over to preview.

Browser uploads use 15-minute presigned PUT URLs. Before deploying this feature, add this CORS policy
to the production R2 bucket. Apply the equivalent policy to a preview bucket with its exact preview
origin before testing uploads there.

```json
[
  {
    "AllowedOrigins": ["https://rundown-app.dev"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

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

The deployment provisions `QueryEngineContainer` as a SQLite-backed Durable Object namespace.
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
