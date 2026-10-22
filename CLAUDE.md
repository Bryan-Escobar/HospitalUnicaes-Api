# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Start dev server with hot reload (Node 20, see .nvmrc)
npm run build          # Compile TypeScript → dist/
npm test               # Run all tests (Jest + supertest)
npm run test:coverage  # Tests with coverage report
npm run typecheck      # tsc --noEmit over src + test
npm run lint           # ESLint (lint:fix to autofix)
npm run format         # Prettier (format:check in CI)

# Run a single test suite by name
npm test -- -t "Suite Name"   # e.g. -t "Health API"
```

CI runs lint, format:check, typecheck, test and build on every PR. Keep all of them green.

## Project context

Read `context.md` first: it holds the business rules (11 rooms / 17 beds, 1 ambulance, lab states, public vs. private data) that every endpoint must enforce in the backend. Branch and commit conventions are in `CONTRIBUTING.md`.

## Architecture

Express + TypeScript + Prisma (PostgreSQL/Supabase). Layered structure, `routes → controller → service → repository`:

- **`src/presentation/[Entity]/`** — controller + routes per entity. Routes use a static `routes()` getter, controllers are classes with `public async` arrow methods. No logic in controllers.
- **`src/services/`** — business logic. Services receive their repository through the constructor (with a default instance).
- **`src/repositories/`** — data access. The only layer that imports the Prisma client.
- **`src/domain/`** — interfaces (`interfaces/`), Zod validators (`validators/`), CustomError (`errors/`).
- **`src/docs/`** — OpenAPI (Swagger) registry; each module documents its routes in `src/docs/paths/<entity>.docs.ts` and is imported from `src/docs/paths/index.ts`.

All routes are registered in `src/presentation/routes.ts` (the single aggregator). Infra routes live at the root (`/health`); business endpoints go under `/api/...`. Swagger UI is at `/docs`, raw spec at `/docs.json`.

`Server` (`src/presentation/server.ts`) builds the full Express app in its constructor (logger, CORS, docs, routes, 404 + global error handler); `start()` only calls `listen`. Tests import the app without opening a port.

## Key Patterns

**Prisma client** — singleton imported from `src/config/prisma.ts`, used only in repositories. Generated client is at `src/generated/prisma/client` (non-standard path). Run `npx prisma generate` after schema changes, never `prisma migrate` directly.

**DB migrations** — the schema is versioned with Supabase CLI in `supabase/migrations/*.sql` (single source of truth). New change: `supabase migration new <name>`, test with `supabase db reset`, apply with `supabase db push`, then `npx prisma db pull && npx prisma generate`. Never commit keys; `.env.example` lists the variables.

**Response format** — every endpoint returns `ApiResponse` from `src/domain/interfaces/api-response.interface.ts`:
```typescript
{ statusCode, success, message, data?, errors? }
```

**Error handling** — services throw `CustomError(message, statusCode)`. Controllers always catch with `handleError(error)` from `src/lib/errorHandler.ts` and return the same `ApiResponse` shape with `success: false`. `src/presentation/middlewares/error.middleware.ts` handles unknown routes (404), malformed JSON (400) and anything uncaught (500) without leaking internals.

**Validation** — Zod schemas in `src/domain/validators/[entity].validator.ts`, importing `z` from `src/lib/zod` (zod extended with `.openapi()`), never from `'zod'` directly. Applied in routes via `validateBody(schema)` / `validateQuery(schema)` / `validateParams(schema)`. Validation errors return 400 with an `errors` array of `{ field, message }`. Reuse the same schemas in the docs.

**Logging** — use `logger` from `src/config/logger.ts` or `req.log` (pino), never `console.log` (ESLint warns). Never log private patient data (context.md §3.4).

**Config** — env vars are read and validated only in `src/config/envs.ts` (env-var). Add new ones there and to `.env.example`.

**DB schema** — PostgreSQL with `public` and `auth` schemas (multi-schema Prisma). Any `BigInt` id must be wrapped with `Number()` before returning it in a response.

## Tests

Framework: **Jest + supertest** (`describe` / `test` / `expect`), config in `jest.config.js` (ts-jest).

Tests live in `test/presentation/[entity].test.ts`. They are **HTTP-level tests** — they hit the full Express app and mock service or repository methods with `jest.spyOn` (mocks are restored automatically after each test).

```typescript
describe('Entity API', () => {
  describe('GET /api/entity', () => {
    test('deberia retornar 200 con lista', async () => {
      jest.spyOn(EntityService.prototype, 'getItems').mockResolvedValue(mockData);
      const res = await request(app).get('/api/entity');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
```

`test/setup.ts` injects fake env vars before app import. `test/helpers/app.ts` exports the Express app. Never test against a real DB.
