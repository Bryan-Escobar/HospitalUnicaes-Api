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
- `20261023222640_roles_cuatro.sql`: 4 roles (HUNI-36).
- `20261024164628_der_completo.sql` (HUNI-37): catálogo editable de tipos de personal, personal sin cuenta, pacientes desactivables, consultas que se cierran, turnos sin solape y citas sin doble reserva (exclusion constraints), y la vista `v_dashboard_summary`.

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

### Datos semilla (`supabase/seed.sql`)

Es **idempotente**: se puede correr las veces que sea sin duplicar datos. Carga:

- 11 habitaciones: `VIP-301`…`VIP-305` (3ª planta, 1 cama) y `HAB-201`…`HAB-206` (2ª planta, 2 camas) → 17 camas.
- La única ambulancia (`AMB-001`, disponible).
- Catálogos de especialidades y exámenes de laboratorio.
- 7 usuarios demo (abajo), 9 empleados (4 sin cuenta y 1 desactivado) y 6 pacientes con expediente (1 desactivado).
- **Agenda relativa al día en que corre** (HUNI-51): turnos de hoy − 7 a hoy + 14 que cubren las 24 horas
  (incluye un turno nocturno 19:00–07:00) y citas pasadas (atendidas, canceladas, no_asistio) y futuras
  (programadas y confirmadas), siempre dentro del turno del doctor.
- Una consulta cerrada con diagnóstico, receta y laboratorio; una orden pendiente; 2 hospitalizaciones activas;
  avisos (públicos e internos) y 2 servicios de ambulancia finalizados.

Los datos de prueba se agregan en el seed, no en cada cliente: si a tu pantalla le falta un caso, agrégalo aquí.

```bash
supabase db reset                  # local: migraciones + seed desde cero
supabase db push --include-seed    # remoto: migraciones pendientes + seed
```

| Rol | Email | Contraseña |
|---|---|---|
| administrador | `administrador@demo.hospitalunicaes.test` | `HospitalDemo2026` |
| doctor | `doctor@demo.hospitalunicaes.test` | `HospitalDemo2026` |
| recepcionista | `recepcion@demo.hospitalunicaes.test` | `HospitalDemo2026` |
| paciente | `paciente@demo.hospitalunicaes.test` | `HospitalDemo2026` |
| doctor (Pediatría, tarde y fines de semana) | `pediatria@demo.hospitalunicaes.test` | `HospitalDemo2026` |
| doctor (Emergencia, noche) | `emergencia@demo.hospitalunicaes.test` | `HospitalDemo2026` |
| paciente | `paciente2@demo.hospitalunicaes.test` | `HospitalDemo2026` |

> ⚠ Esta contraseña es pública (está en el repositorio). Cámbiala en el proyecto remoto antes de la demo final.

### Tests de base de datos

Tests pgTAP en `supabase/tests/database/` (seed, turnos sin solape, citas sin doble reserva, consultas cerradas, la vista del dashboard, inventario y, desde HUNI-51, el RLS y las RPC de turnos y citas simulando el JWT de cada rol). Requieren Supabase local:

```bash
supabase start
supabase test db
```

El CI los corre en el job `test-db`, que además aplica el seed tres veces para comprobar que es idempotente.

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

## Consultas e historial clínico (HUNI-57)

Endpoints de la API (detalle en `/docs`, etiqueta *Consultas* y *Laboratorio*):

| Qué | Endpoint | Quién |
|---|---|---|
| Abrir consulta (con o sin cita; p. ej. emergencia) | `POST /api/consultas` | Doctor: queda como médico tratante |
| Diagnóstico, receta, solicitud de exámenes | `POST /api/consultas/{id}/diagnosticos` · `/recetas` · `POST /api/laboratorio/ordenes` | Solo el doctor que abrió la consulta, mientras esté abierta |
| Editar y cerrar | `PATCH /api/consultas/{id}` · `POST /api/consultas/{id}/cerrar` | Ídem. Cerrada → todo responde 409 `CONSULTA_CERRADA` |
| Ver consultas y detalle | `GET /api/consultas` · `GET /api/consultas/{id}` | Admin: todas · doctor: las suyas / de pacientes que atiende · paciente: las propias |
| Historial clínico | `GET /api/pacientes/{id}/historial` | Médico tratante, el propio paciente y administración |
| Expediente (sangre, alergias, antecedentes) | `PATCH /api/pacientes/{id}/expediente` | Médico tratante |
| Catálogo de exámenes | `GET /api/laboratorio/examenes` | Admin, doctor y recepción |

- Recepción **no** ve información clínica (403). La administración solo lee.
- Cada diagnóstico, receta y orden guarda `registrado_por` (quién) y su fecha.
- La receta **no descuenta stock**: `item_id` es solo una referencia opcional al inventario.
- Paciente que no existe → 400 `REFERENCIA_INVALIDA`; desactivado → 422 `REGLA_DE_NEGOCIO`.

## Camas y hospitalizaciones (HUNI-66)

3ª planta: `VIP-301`…`VIP-305` (1 cama, 1 paciente). 2ª planta: `HAB-201`…`HAB-206` (2 camas, 2 pacientes).

| Qué | Endpoint | Quién |
|---|---|---|
| Mapa con ocupantes (y su `sexo`) | `GET /api/habitaciones` | Admin y recepción; el doctor solo ve a los pacientes que atiende |
| Camas / sugerencia | `GET /api/camas` · `GET /api/camas/sugerencia?tipo=vip\|semiprivada` | Admin y recepción |
| Ingreso (asignar cama) | `POST /api/hospitalizaciones` con `cama_id` o `tipo_habitacion` | Admin y recepción |
| Traslado / alta | `POST /api/hospitalizaciones/{id}/traslado` · `/alta` | Admin y recepción |
| Ver hospitalizaciones (con historial) | `GET /api/hospitalizaciones` · `GET /api/hospitalizaciones/{id}` | Admin, recepción, médico tratante y el paciente |
| Cama lista tras limpieza | `PATCH /api/camas/{id}/estado` (`disponible`, `limpieza`, `mantenimiento`) | Admin y recepción |

- La sugerencia elige primero una habitación **vacía**; si no hay, cualquier cama libre del tipo. No mezcla ni bloquea por sexo.
- Ingresar, trasladar y dar de alta son funciones de Postgres (`asignar_cama`, `trasladar_cama`, `dar_alta`) que bloquean la
  fila de la cama: dos solicitudes por la misma o la última cama → solo una gana (409 `CAMA_OCUPADA` / `SIN_CAMAS_DISPONIBLES`).
- Paciente que ya tiene cama → 409 `PACIENTE_YA_HOSPITALIZADO`. Tras el alta o un traslado, la cama queda en `limpieza`.
- Cada ingreso, traslado y alta queda en `movimientos_cama` (en el detalle, `movimientos`).
- **Tiempo real:** suscríbete a `postgres_changes` de `camas` (cualquier usuario con sesión; no trae pacientes) y de
  `hospitalizaciones` (solo quien puede verlas, por RLS).

## Laboratorio: órdenes y resultados (HUNI-62)

Cada examen sigue `pendiente → en_proceso → completado`; cualquier otra transición → 422 `TRANSICION_INVALIDA`
(lo valida la API y también la base de datos). El estado de la orden sale de sus exámenes.

| Qué | Endpoint | Quién |
|---|---|---|
| Listar / ver órdenes | `GET /api/laboratorio/ordenes` · `GET /api/laboratorio/ordenes/{id}` | Admin y recepción: todas · doctor: de pacientes que atiende · paciente: las suyas |
| Iniciar examen (toma de muestra) | `PATCH …/examenes/{orden_examen_id}/estado` con `{ "estado": "en_proceso" }` | Admin y recepción |
| Registrar resultado y completar | `PUT …/examenes/{orden_examen_id}/resultado` (`multipart/form-data`: `valor`, `unidad`, `rango_referencia`, `observaciones`, `archivo` PDF ≤ 10 MB) | Admin y recepción; sin valor ni PDF → 422 `RESULTADO_REQUERIDO` |
| Descargar el PDF | `GET …/examenes/{orden_examen_id}/resultado/archivo` → URL firmada (10 min) | Médico tratante, el paciente y admin (recepción no) |

- Los PDF viven en el bucket **privado** `resultados-laboratorio` de Supabase Storage; solo la API escribe y firma.
- **Tiempo real:** suscríbete con el SDK a `postgres_changes` de `orden_examenes` (o `ordenes_laboratorio`). El RLS hace que
  cada usuario reciba solo sus órdenes. El aviso trae el estado; para ver el resultado, vuelve a pedir la orden a la API.

```ts
supabase
  .channel('laboratorio')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orden_examenes' }, () => recargarOrdenes())
  .subscribe();
```

- Archivos de prueba para Postman: `test/fixtures/resultado-laboratorio.pdf` y `test/fixtures/no-es-pdf.txt`.

## Turnos y citas directo desde Supabase (HUNI-51)

Turnos y citas **no pasan por la API Express**: los clientes los leen y escriben con el SDK de Supabase,
con el `access_token` del usuario. Las reglas viven en la base (RLS + triggers + RPC), así que aplican igual
desde iOS, Android y Web.

| Qué | Cómo | Quién |
|---|---|---|
| Ver turnos (con nombre, tipo y especialidad) | `from('v_turnos').select()` | Cualquier usuario con sesión |
| Crear / editar turnos | `from('turnos_personal').insert(...)` / `.update(...)` | Administrador y recepcionista |
| Borrar turnos | `from('turnos_personal').delete()` | Administrador |
| Ver citas (con nombres de paciente y doctor) | `from('v_citas').select()` | Admin y recepción: todas · doctor: las suyas · paciente: las suyas |
| Crear cita | `rpc('crear_cita', { p_paciente_id, p_doctor_id, p_fecha_hora, p_duracion_minutos, p_motivo })` | Administrador y recepcionista |
| Doctores libres en una franja | `rpc('doctores_disponibles', { p_fecha_hora, p_duracion_minutos, p_especialidad_id?, p_excluir_cita_id? })` | Administrador y recepcionista |
| Cambiar doctor o fecha | `rpc('reprogramar_cita', { p_cita_id, p_fecha_hora?, p_doctor_id?, p_duracion_minutos? })` | Administrador y recepcionista |
| Cambiar estado | `from('citas').update({ estado }).eq('id', id)` | Paciente: solo `cancelada` · doctor: `confirmada`, `atendida`, `no_asistio` |

```ts
const { data, error } = await supabase.rpc('crear_cita', {
  p_paciente_id: pacienteId,
  p_doctor_id: doctorId,
  p_fecha_hora: '2026-11-03T09:00:00-06:00',
  p_duracion_minutos: 30,
});
if (error) {
  const code = error.message.split(':')[0]; // 'CITA_DUPLICADA', 'CITA_FUERA_DE_TURNO', ...
}
```

Los errores llegan como `{ code: 'PTxxx', message: 'CODIGO: detalle legible' }`. Decide con el `CODIGO` del inicio del
mensaje (mismo catálogo que `ERROR_CODES` de la API) y muestra el detalle si quieres; el HTTP coincide con el catálogo:

| Código | HTTP | Cuándo |
|---|---|---|
| `TURNO_SOLAPADO` | 409 | El empleado ya tiene otro turno que se cruza |
| `CITA_DUPLICADA` | 409 | El doctor o el paciente ya tiene una cita activa en ese horario |
| `CITA_FUERA_DE_TURNO` | 422 | El turno del doctor no cubre la cita completa (inicio y fin, hora de El Salvador) |
| `TRANSICION_INVALIDA` | 422 | Cambio de estado no permitido (o la cita ya no está programada/confirmada) |
| `ACCESO_DENEGADO` | 403 | El rol no puede hacer esa operación |

Nadie inserta en `citas` directo (403): se crean con `crear_cita()`. La colección de Postman
*HospitalUnicaes API · HUNI-51* prueba cada regla contra el proyecto remoto.

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
