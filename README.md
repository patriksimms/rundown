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

## Cloudflare deployment

The app is available at [rundown.rundown.workers.dev](https://rundown.rundown.workers.dev). Cloudflare deploys every push to `main`; pushes to other branches create preview versions.

The GitHub repository is connected with these Workers Builds settings:

```text
Production branch: main
Build command: bun run check && bun run build
Deploy command: bun run deploy:built
```

Set the `BUN_VERSION` build variable to `1.3.10`. Enable non-production branch builds to create preview versions for pull requests.

The Worker name in Cloudflare must match the `name` in `wrangler.jsonc`, currently `rundown`.

To deploy from a local authenticated shell instead:

```sh
bun run deploy
```
