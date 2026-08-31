FROM oven/bun:1.3.10-slim

RUN apt-get update -qq \
    && apt-get install -qq --no-install-recommends ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY container ./container

EXPOSE 8080
CMD ["bun", "run", "container/query-server.ts"]
