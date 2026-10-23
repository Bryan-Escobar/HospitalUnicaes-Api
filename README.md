# HospitalUnicaes-Api

Backend unificado del sistema de gestión del Hospital Universitario Central (HospitalUnicaes). Lo consumen la app iOS, la app Android y el panel web.

Construido con **Node.js**, **Express**, **TypeScript** y **Prisma ORM** sobre PostgreSQL (Supabase).

- Reglas de negocio y privacidad: [`context.md`](./context.md)
- Ramas, commits y Pull Requests: [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## Requisitos Previos

- **Node.js** 20 (ver `.nvmrc`; con nvm: `nvm use`)
- **npm** >= 10
- **Docker** (opcional: imagen de la API y Supabase local)
- **Supabase CLI** (para migraciones)

## Instalación

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/Bryan-Escobar/HospitalUnicaes-Api.git
cd HospitalUnicaes-Api
git checkout development
npm install
```

### 2. Variables de entorno

Copia `.env.example` a `.env` en la raíz del proyecto y completa los valores (Supabase Dashboard > Project Settings):

| Variable | Uso |
|---|---|
| `PORT` | Puerto del servidor Express |
| `NODE_ENV` | `development` \| `test` \| `production` (por defecto `development`) |
| `LOG_LEVEL` | Nivel del logger: `fatal`…`trace` o `silent` (por defecto `info`) |
| `CORS_ORIGINS` | Orígenes permitidos separados por coma, `*` = cualquiera (por defecto `http://localhost:5173`) |
| `DATABASE_URL` | Conexión con pooler en modo transacción (puerto 6543) para las consultas de Prisma |
| `DIRECT_URL` | Conexión con pooler en modo sesión (puerto 5432) para introspección (`prisma db pull`) |
| `SUPABASE_URL` | URL del proyecto (`https://<project-ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | Llave pública (anon/publishable); respeta RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave de servicio; **salta RLS**, solo para el backend |
| `SUPABASE_DB_PASSWORD` | Opcional: contraseña de la BD para la CLI de Supabase sin prompt |

> Ninguna llave (anon ni service role) ni contraseña se sube al repositorio. `.env` y `.env.*` están en `.gitignore`.

### 3. Generar el cliente de Prisma

```bash
npx prisma generate
```

> Ejecutar siempre después de cambios en `prisma/schema.prisma`.

## Base de datos y migraciones (Supabase CLI)

El esquema de la base de datos se versiona con la **Supabase CLI** en `supabase/migrations/` (SQL). Es la única fuente de verdad del esquema: **no usar `prisma migrate`**. Prisma solo se usa como cliente (`prisma db pull` + `prisma generate`).

- Proyecto remoto: **Hospital UNICAES** (ref `idhxyneffsmyekrvpyfg`, Postgres 17).
- Auth: email/contraseña habilitado (mínimo 8 caracteres con mayúsculas, minúsculas y dígitos; ver `supabase/config.toml`).
- Migración inicial: `20261022011429_esquema_inicial.sql`, capturada con `supabase db pull` desde el proyecto remoto (tablas del ERD, enums, triggers e índices).

### Configuración inicial (una vez por máquina)

Requiere [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) y, para el entorno local, Docker.

```bash
supabase login
supabase link --project-ref idhxyneffsmyekrvpyfg
```

### Flujo para cambios de esquema

```bash
supabase migration new <descripcion>   # crea supabase/migrations/<timestamp>_<descripcion>.sql
supabase start                         # levanta Supabase local y aplica todas las migraciones desde cero
supabase db reset                      # vuelve a aplicar todo desde cero tras editar una migración
supabase db push --dry-run             # muestra qué migraciones faltan en el remoto
supabase db push                       # aplica las migraciones pendientes al proyecto remoto
npx prisma db pull && npx prisma generate   # actualiza el cliente de Prisma
```

> Nunca cambies el esquema desde el Dashboard sin crear su migración. Si alguien lo hizo, captura el cambio con `supabase db pull <descripcion>`.
>
> Los datos semilla (11 habitaciones, 17 camas, 1 ambulancia, usuarios demo) se agregan en HUNI-37 (`supabase/seed.sql`).

## Scripts

```bash
npm run dev            # Servidor en desarrollo con hot reload (http://localhost:3000)
npm run build          # Compila TypeScript → dist/
npm start              # Ejecuta el compilado (dist/app.js)
npm test               # Tests con Jest + supertest
npm run test:watch     # Tests en modo watch
npm run test:coverage  # Tests con reporte de cobertura
npm run typecheck      # Verificación de tipos (src + test)
npm run lint           # ESLint (lint:fix para corregir)
npm run format         # Prettier (format:check solo verifica)
```

El CI (`.github/workflows/tests.yml`) corre lint, formato, typecheck, tests y build en cada PR.

## Endpoints base

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor. Siempre 200 si el proceso vive; `data.database` indica `up`/`down` |
| POST | `/health/echo` | Eco del body (ejemplo de validación con zod) |
| GET | `/docs` | Documentación interactiva (Swagger UI) |
| GET | `/docs.json` | Especificación OpenAPI 3 en JSON (para Postman, Kotlin, Swift) |

Los endpoints de negocio se montan bajo `/api` en `src/presentation/routes.ts`.

## Contrato de API v1 (HUNI-36)

El contrato completo vive en **`/docs`** (y en JSON en `/docs.json`). Cubre auth/me, pacientes, personal, consultas, laboratorio, habitaciones, ambulancia, dashboard y público. Cada endpoint indica:

- **Roles** que pueden usarlo (o si es público).
- **Estado:** `(pendiente)` si todavía no responde, con el ticket que lo implementa.
- **Códigos de error** posibles por status.

Los clientes pueden trabajar en paralelo simulando los endpoints pendientes con el contrato:

```bash
npx @stoplight/prism-cli mock http://localhost:3000/docs.json
```

o importando `/docs.json` en Postman (Mock server).

Al implementar un endpoint, pon `estado: 'implementado'` en su `src/docs/paths/<modulo>.docs.ts`. Un test (`test/docs/contrato.test.ts`) falla si el estado documentado no coincide con lo que responde la API.

## Estructura del Proyecto

```
src/
├── app.ts                         # Punto de entrada: arranca el servidor y apagado ordenado (SIGTERM)
├── config/
│   ├── envs.ts                    # Variables de entorno validadas (env-var)
│   ├── logger.ts                  # Logger (pino; legible en desarrollo, JSON en producción)
│   └── prisma.ts                  # Singleton del cliente Prisma
├── docs/
│   ├── registry.ts                # Registro OpenAPI y helpers (apiResponse, errorResponse)
│   ├── openapi.ts                 # Genera el documento servido en /docs
│   └── paths/                     # Documentación por módulo (<entidad>.docs.ts)
├── domain/
│   ├── dtos/                      # Schemas zod de respuesta (contrato) y enums de la BD
│   ├── errors/                    # CustomError y catálogo de códigos de error (error-codes.ts)
│   ├── interfaces/                # ApiResponse y tipos de dominio
│   └── validators/                # Schemas zod de entrada (validan y documentan)
├── lib/
│   ├── errorHandler.ts            # Traduce errores (CustomError, zod, Prisma) a statusCode + mensaje
│   └── zod.ts                     # zod extendido con .openapi(): importar z desde aquí
├── presentation/
│   ├── server.ts                  # App Express: logger HTTP, CORS, /docs, rutas, 404 y errores
│   ├── routes.ts                  # Agregador de rutas
│   ├── middlewares/               # validación (zod) y manejo global de errores
│   └── Health/                    # routes + controller por entidad
├── services/                      # Lógica de negocio
└── repositories/                  # Acceso a datos (único lugar que usa Prisma)

test/
├── setup.ts                       # Env vars falsas antes de importar la app
├── helpers/app.ts                 # App Express sin abrir puerto, para supertest
└── presentation/                  # Tests HTTP por entidad
```

## Patrones Clave

**Capas** — `routes` → `controller` → `service` → `repository`. Los controladores no tienen lógica; los servicios tienen las reglas de negocio y los repositorios son los únicos que usan Prisma.

**Respuesta estándar** — todos los endpoints devuelven `ApiResponse`:
```typescript
// Éxito
{ statusCode, success: true, message, data }
// Error
{ statusCode, success: false, code, message, errors? }
```

- `statusCode`: código HTTP (la categoría del error).
- `code`: la causa exacta, legible por máquina (p. ej. `CAMA_OCUPADA`). Los clientes deciden con este campo, nunca comparando `message`.
- `message`: texto para el usuario. `errors`: detalle por campo cuando `code` es `VALIDACION`.

**Errores** — los servicios lanzan `CustomError.fromCode('CAMA_OCUPADA', 'La cama HAB-201-A ya está ocupada')`; el status sale del catálogo `src/domain/errors/error-codes.ts`. Para agregar un código nuevo, súmalo al catálogo: aparece solo en `/docs`. Un código publicado no se renombra ni se borra. Los controladores responden con `toErrorResponse(error)`. Un middleware global responde 404 (`RUTA_NO_ENCONTRADA`), 400 (`JSON_INVALIDO`) y 500 (`ERROR_INTERNO`) sin exponer detalles internos.

**Validación** — schemas zod en `src/domain/validators/` (importando `z` desde `src/lib/zod`). Se aplican en las rutas con `validateBody`, `validateQuery` o `validateParams`; si fallan, responden 400 con `errors: [{ field, message }]`.

**Documentación** — cada módulo registra sus rutas en `src/docs/paths/<modulo>.docs.ts` con `registerEndpoint` (roles, ticket, estado y códigos de error), reutilizando los schemas de `validators` (entrada) y `dtos` (salida). Así Swagger no se desfasa de la validación.

**Nombres** — rutas y campos JSON en español con `snake_case`, igual que la base de datos.

**Logger** — usar `logger` (`src/config/logger.ts`) o `req.log`, nunca `console.log`. Cada petición lleva un `X-Request-Id`. No registrar datos privados de pacientes.

## Tests

Framework: **Jest + supertest** (`describe` / `test` / `expect`).

Los tests son HTTP-level: golpean la app de Express completa y simulan servicios o repositorios con `jest.spyOn`. Nunca se conectan a una base de datos real.

```bash
npm test
npm test -- -t "Health API"   # filtra por nombre
npm run test:coverage
```

## Docker

```bash
docker build -t hospitalunicaes-api .
docker run --rm -p 3000:3000 --env-file .env hospitalunicaes-api
```

Imagen multi-etapa sobre `node:20-alpine`, sin dependencias de desarrollo, con usuario sin privilegios y `HEALTHCHECK` contra `/health`. El `.dockerignore` excluye `.env` y artefactos locales.

## Dependencias Principales

| Paquete | Uso |
|---------|-----|
| `express` | Framework web |
| `typescript` | Tipado estático |
| `prisma` / `@prisma/client` | Cliente de base de datos |
| `zod` | Validación de esquemas |
| `@asteasolutions/zod-to-openapi` + `swagger-ui-express` | Documentación OpenAPI en `/docs` |
| `pino` / `pino-http` | Logger |
| `cors` | Política de origen cruzado |
| `dotenv` / `env-var` | Variables de entorno |
| `jest` / `ts-jest` / `supertest` | Tests |
| `eslint` / `typescript-eslint` / `prettier` | Lint y formato |

## Ramas

| Rama | Uso |
|---|---|
| `prod` | Producción |
| `staging` | Pruebas e integración |
| `development` | Integración diaria; todo PR de tarea apunta aquí |

Ramas de tarea: `HUNI-<n>-<titulo-en-kebab>` (ej. `HUNI-15-repositorios-github`). Detalle en `CONTRIBUTING.md`.
