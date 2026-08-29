FROM oven/bun:1.3.10-slim

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY container ./container

EXPOSE 8080
CMD ["bun", "run", "container/query-server.ts"]
