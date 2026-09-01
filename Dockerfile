FROM oven/bun:1.3.10-slim

RUN apt-get update -qq \
    && apt-get install -qq --no-install-recommends ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/container
# The query engine has its own manifest, so frontend dependency changes leave this layer cached.
COPY container/package.json container/bun.lock ./
RUN bun install --production --frozen-lockfile
COPY container ./

EXPOSE 8080
CMD ["bun", "run", "query-server.ts"]
