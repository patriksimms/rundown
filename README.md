# Rundown

Rundown is a TanStack Start application deployed to Cloudflare Workers.

## Local development

```sh
bun install
bun run dev
```

The app runs at `http://localhost:3000`. `GET /health` returns a small JSON response that can be used to verify a deployment.

Run all checks and create the production build with:

```sh
bun run check
bun run build
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

The preview Worker also needs `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` as runtime secrets. Wrangler environments are separate Workers, so production secrets do not carry over.

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

To recreate the infrastructure in another Cloudflare account, enable R2 once in the dashboard and create the private buckets with:

```sh
wrangler r2 bucket create rundown-data --location weur
wrangler r2 bucket create rundown-data-preview --location weur
```
