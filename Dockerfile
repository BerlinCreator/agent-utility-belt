FROM node:22-slim AS base

WORKDIR /app

# Use corepack (built into Node 22) to enable pnpm — no npm registry needed
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Build
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# Production stage
FROM node:22-slim AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=base /app/dist ./dist

# Copy migrations. The entrypoint script skips migrations if this dir is empty.
RUN mkdir -p ./drizzle
COPY drizzle/ ./drizzle/

# Entrypoint runs migrations then starts the server
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
