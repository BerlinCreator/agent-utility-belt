# Agent Utility Belt — API Suite

## What
29+ APIs for AI agent builders. Fastify + TypeScript + Postgres + Redis. Deployed on Railway.

## Tech Stack
- **Runtime:** Node.js 22, TypeScript
- **Framework:** Fastify 4
- **Database:** Postgres (Drizzle ORM)
- **Cache/Queue:** Redis (ioredis)
- **Testing:** Vitest
- **Deploy:** Railway (Dockerfile)

## Project Structure
```
src/
  index.ts              — Main entry, route registration
  server.ts             — Fastify server setup
  middleware/            — Auth, rate limiting
  routes/
    commodity/           — 9 commodity APIs
    high-demand/         — 7 high-demand APIs
    first-to-market/     — 13 first-to-market APIs
    health.ts            — Health endpoint
  db/
    schema.ts            — Drizzle schema
    migrate.ts           — Migration runner
tests/
  *.test.ts              — Test files
```

## Commands
```bash
pnpm build              # TypeScript compile
pnpm test               # Run Vitest tests
pnpm typecheck          # tsc --noEmit
pnpm lint               # ESLint
```

## Route Registration Pattern
Every API exports a Fastify plugin:
```typescript
// src/routes/category/api-name.ts
import { FastifyInstance } from "fastify";
export async function apiNameRoutes(app: FastifyInstance) {
  app.post("/endpoint", async (request, reply) => {
    // ...
  });
}
```

Register in `src/index.ts`:
```typescript
await protectedApp.register(apiNameRoutes, { prefix: "/v1/api-name" });
```

## Response Format (MUST follow)
```json
// Success:
{ "success": true, "data": { ... } }
// Error:
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human readable" } }
```

## Auth
All API routes require `x-api-key` header. Auth middleware is in `src/middleware/auth.ts`.

## Rate Limiting
Built-in via `src/middleware/rate-limit.ts`. Uses Redis.

## Gotchas
- DO NOT add `.pnpmrc.json` to Dockerfile COPY (it's gitignored)
- Use `pnpm-workspace.yaml` for `onlyBuiltDependencies: [sharp]`
- Dockerfile uses `corepack` not `npm install -g pnpm`
- Test against Railway env vars (DATABASE_URL, REDIS_URL)
- Health endpoint is at `/health` not `/v1/health`
