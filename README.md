# HospitalUnicaes-Api

Backend unificado del sistema de gestión del Hospital Universitario Central (HospitalUnicaes). Lo consumen la app iOS, la app Android y el panel web.

Construido con **Node.js**, **Express**, **TypeScript** y **Prisma ORM** sobre PostgreSQL (Supabase).

- Reglas de negocio y privacidad: [`context.md`](./context.md)
- Ramas, commits y Pull Requests: [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## Requisitos Previos

- **Node.js** >= 18.x
- **npm** >= 9.x
- **PostgreSQL**

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
npm run dev          # Servidor en desarrollo con hot reload
npm run build        # Compila TypeScript → dist/
npm start            # Build + ejecuta el compilado
npm test             # Tests con Mocha
npm run test:coverage  # Tests con reporte de cobertura (nyc)
```

## Estructura del Proyecto

```
src/
├── app.ts                        # Punto de entrada
├── config/
│   ├── envs.ts                   # Variables de entorno (env-var)
│   └── prisma.ts                 # Singleton del cliente Prisma
├── domain/
│   ├── errors/
│   │   ├── CustomError.ts        # Error tipado con statusCode
│   │   └── errorHandler.interface.ts
│   ├── interfaces/
│   │   └── api-response.interface.ts  # Forma estándar de respuesta
│   └── validators/
│       └── health.validator.ts   # Ejemplo de schema Zod
├── lib/
│   └── errorHandler.ts           # Helper centralizado de errores
├── presentation/
│   ├── routes.ts                 # Agregador de rutas
│   ├── server.ts                 # Clase Server (Express)
│   ├── middlewares/
│   │   └── validation.middleware.ts  # validateBody / validateQuery / validateParams
│   └── Health/
│       ├── health.controller.ts
│       └── routes.ts
└── services/
    └── health.service.ts

test/
├── setup.ts                      # Inyecta env vars antes de importar la app
├── helpers/
│   └── app.ts                    # Exporta la instancia Express para supertest
└── presentation/
    └── health.test.ts
```

## Patrones Clave

**Respuesta estándar** — todos los endpoints devuelven `ApiResponse`:
```typescript
{ statusCode, success, message, data?, errors? }
```

**Errores** — los servicios lanzan `CustomError(message, statusCode)`. Los controladores siempre capturan con `handleError(error)`.

**Validación** — schemas Zod en `src/domain/validators/`. Se aplican en las rutas con los middlewares `validateBody`, `validateQuery` o `validateParams`.

**Prisma** — cliente singleton en `src/config/prisma.ts`. El cliente generado vive en `src/generated/prisma/client`.

## Endpoint de ejemplo

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servidor |
| POST | `/api/health/echo` | Eco del body (demuestra validación Zod) |

## Tests

Framework: **Mocha + Chai + Sinon + Supertest** (TDD con `suite` / `test` / `teardown`).

Los tests son HTTP-level: golpean el Express app completo y mockean los métodos del servicio con stubs de Sinon. Nunca se conectan a una base de datos real.

```bash
npm test
npm run test:coverage
```

## Dependencias Principales

| Paquete | Uso |
|---------|-----|
| `express` | Framework web |
| `typescript` | Tipado estático |
| `prisma` / `@prisma/client` | ORM |
| `zod` | Validación de esquemas |
| `cors` | Política de origen cruzado |
| `dotenv` / `env-var` | Variables de entorno |

## Ramas

| Rama | Uso |
|---|---|
| `prod` | Producción |
| `staging` | Pruebas e integración |
| `development` | Integración diaria; todo PR de tarea apunta aquí |

Ramas de tarea: `HUNI-<n>-<titulo-en-kebab>` (ej. `HUNI-15-repositorios-github`). Detalle en `CONTRIBUTING.md`.
