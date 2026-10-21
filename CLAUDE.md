# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Compile TypeScript → dist/
npm test             # Run all tests (Mocha)
npm run test:coverage  # Tests with nyc coverage report

# Run a single test suite by name
npx mocha --grep "Suite Name"   # e.g. --grep "Health API"
```

## Project context

Read `context.md` first: it holds the business rules (11 rooms / 17 beds, 1 ambulance, lab states, public vs. private data) that every endpoint must enforce in the backend. Branch and commit conventions are in `CONTRIBUTING.md`.

## Architecture

Express + TypeScript + Prisma (PostgreSQL/Supabase). Three-layer structure:

- **`src/presentation/[Entity]/`** — controller + routes per entity. Routes use a static `routes()` getter, controllers are classes with `public async` methods.
- **`src/services/`** — all business logic and DB access via Prisma. No logic in controllers.
- **`src/domain/`** — interfaces (`interfaces/`), Zod validators (`validators/`), CustomError (`errors/`).

All routes are registered in `src/presentation/routes.ts` (the single aggregator).

## Key Patterns

**Prisma client** — singleton imported from `src/config/prisma.ts`. Generated client is at `src/generated/prisma/client` (non-standard path). Run `npx prisma generate` after schema changes, never `prisma migrate` directly.

**Response format** — every endpoint returns `ApiResponse` from `src/domain/interfaces/api-response.interface.ts`:
```typescript
{ statusCode, success, message, data?, errors? }
```

**Error handling** — services throw `CustomError(message, statusCode)`. Controllers always catch with `handleError(error)` from `src/lib/errorHandler.ts` and return the same `ApiResponse` shape with `success: false`.

**Validation** — Zod schemas in `src/domain/validators/[entity].validator.ts`. Applied in routes via `validateBody(schema)` / `validateParams(schema)` middlewares. Validation errors return 400 with an `errors` array of `{ field, message }`.

**DB schema** — PostgreSQL with `public` and `auth` schemas (multi-schema Prisma). Any `BigInt` id must be wrapped with `Number()` before returning it in a response.

## Tests

Framework: **Mocha + Chai + Sinon + Supertest** (TDD UI: `suite` / `test` / `teardown`).

Tests live in `test/presentation/[entity].test.ts`. They are **HTTP-level tests** — they hit the full Express app and mock service methods with sinon stubs.

```typescript
suite('Entity API', () => {
  teardown(() => sinon.restore());

  suite('GET /api/entity', () => {
    test('deberia retornar 200 con lista', async () => {
      sinon.stub(EntityService.prototype, 'getItems').resolves(mockData);
      const res = await request(app).get('/api/entity');
      assert.equal(res.status, 200, 'mensaje descriptivo');
      assert.isTrue(res.body.success);
    });
  });
});
```

`test/setup.ts` injects fake env vars before app import. `test/helpers/app.ts` exports the Express app. Never test against a real DB.
