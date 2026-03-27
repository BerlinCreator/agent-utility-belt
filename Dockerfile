FROM node:22-slim AS base
RUN corepack enable

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Build
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# Production stage
FROM node:22-slim AS production
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=base /app/dist ./dist

# Copy migrations if they exist (directory may be empty during early development)
COPY drizzle/ ./drizzle/

# Entrypoint runs migrations then starts the server
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
