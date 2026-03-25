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
COPY drizzle/ ./drizzle/

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
