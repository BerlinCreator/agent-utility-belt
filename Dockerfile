FROM node:22-slim AS base

WORKDIR /app

# Install pnpm via corepack (avoids OOM from npm install -g pnpm@latest in Railway)
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmrc.json ./
RUN pnpm install --frozen-lockfile --prod=false

# Build
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# Production stage
FROM node:22-slim AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmrc.json ./
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

ENTRYPOINT ["./docker-entrypoint.sh"]
