# Rundown

Rundown turns reporting intent into query-backed client dashboards. Editors build in the GUI or
through WebMCP tools, viewers use stored widgets and controls, and editors register uploaded or
existing CSV and Parquet files from tenant-scoped R2 prefixes.

The TanStack Start app and API run in a Cloudflare Worker. Query execution runs in a Bun Cloudflare
Container with native DuckDB. The Worker authorizes exact Parquet objects, compiles Rundown formulas
to SQL, and gives DuckDB short-lived internal URLs for those objects. The container has no internet
access or R2 credentials.

## Local development

```sh
bun install
bun run db:migrate:local
bun run dev
```

Upload files from the datasource registration
screen or place CSV and Parquet files in `dev-data/`. Local workspaces see those files under their
tenant-scoped `ws/<workspaceId>/` prefix. Vite serves the files with upload, deletion, and range
request support so the query container can read them without R2 credentials or a separate
object-storage service.

For example:

```sh
cp reporting_example.csv dev-data/
```

Local D1 and KV data persist in `.wrangler/`. Built and deployed containers read authorized Parquet
objects through the Worker's internal R2 handler. To work only on routes that do not query data,
start the app without local containers:

```sh
RUNDOWN_DISABLE_CONTAINERS=1 bun run dev
```

The app runs at `http://localhost:3000`. Set `RUNDOWN_PORT` to move the dev server; the local data
service follows it, so nothing stays pinned to `3000`.

Create the production build with:

```sh
bun run build
bun run deploy:dry-run
```

`GET /health` checks that the Worker can serve requests. `GET /ready` also reads D1, KV, and R2. It returns `503` and logs the failed dependency when any binding is unavailable.

## Tests

Three suites run separately, fastest first.

```sh
bun run check            # formatting, lint, types, migrations, and unit tests
bun run test:integration # the service and API route against Worker bindings
bun run test:e2e         # browser tests
```

`bun run test:integration` runs the request path inside `workerd` with isolated D1, KV, and R2
bindings. Clerk and the DuckDB query container are replaced at their network boundaries; tenancy,
grants, share links, control validation, and query caching all run for real.

`bun run test:e2e` starts its own dev server on port `3140`. Set `RUNDOWN_E2E_PORT` to change it, and
`RUNDOWN_E2E_REUSE_SERVER=1` to attach to a server you already started. Reuse is off by default
because attaching to an unrelated process on the port produced misleading runs; the suite also
refuses to start when the port does not answer as Rundown.

The `authenticated` Playwright project signs a real Clerk user in with
[Clerk testing tokens](https://clerk.com/docs/testing/overview). It is skipped unless the
environment provides `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `E2E_CLERK_USER_USERNAME`,
and `E2E_CLERK_USER_PASSWORD` for a Clerk development instance. The test user needs:

- an email address using Clerk's `+clerk_test` convention, so the sign-in settles the new-device
  check with Clerk's fixed test code instead of a real inbox
- a password
- membership in a Clerk organization, because the app shows nothing until one is active

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
Non-production branch builds: disabled
```

Set the `BUN_VERSION` build variable to `1.3.10`. GitHub Actions validates pull requests, including
the Wrangler deployment package, so Cloudflare does not need to build non-production branches.

The named preview environment remains available for deliberate preview deployments with
`bun run deploy` or `bun run deploy:preview`, but is not used by pull-request checks. Production
deployments normally come from pushes to `main`.

### GitHub Actions

The `Check` workflow runs three jobs: lint, types, unit tests, and a Wrangler deployment dry run;
Worker integration tests; and browser tests. The browser job needs a Clerk development instance and
fails with a list of what is missing until it is configured:

| Name                         | Kind                | Purpose                           |
| ---------------------------- | ------------------- | --------------------------------- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Repository variable | Loads Clerk in the browser        |
| `CLERK_SECRET_KEY`           | Repository secret   | Lets the Worker verify sessions   |
| `E2E_CLERK_USER_USERNAME`    | Repository secret   | Identifier of the Clerk test user |
| `E2E_CLERK_USER_PASSWORD`    | Repository secret   | Password of the Clerk test user   |

The test user needs a `+clerk_test` email address, a password, and membership in a Clerk
organization. The tests section above explains why.

Each environment needs `CLERK_SECRET_KEY`, `INTERNAL_R2_SIGNING_SECRET`,
`UPLOAD_SIGNING_SECRET`, and `RESET_ADMIN_TOKEN`. Use independent random values. The first signs
short-lived container capabilities, the second signs upload cleanup tokens, and the third protects
the reset route. No R2 API credential belongs in the Worker or container. Cloudflare Builds needs
`VITE_CLERK_PUBLISHABLE_KEY` as a build variable. Wrangler environments are separate Workers, so
production secrets do not carry over to preview.

Browser uploads stream through the Worker into its R2 binding. No bucket CORS policy or presigned
URL is needed. Managed CSV uploads convert to Parquet inside the query container before Rundown
registers the datasource.

## Environment reset

The reset command requires an environment and `RESET_ADMIN_TOKEN`:

```sh
bun run reset development
RUNDOWN_PREVIEW_URL=https://preview.example bun run reset preview
bun run reset production
```

Development and preview delete Rundown's D1 rows, R2 objects, and query-cache KV keys. Clerk users
and organizations are outside these bindings and remain untouched. Production always returns the
exact deletion plan and performs no deletion. Apply the committed D1 migrations before using a
fresh environment.

For an explicit production deployment from a local authenticated shell:

```sh
bun run deploy:production
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
