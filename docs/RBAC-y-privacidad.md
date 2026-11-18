# Matriz RBAC y política de privacidad

Documento técnico del proyecto Hospital UNICAES (HUNI-75). Cubre dos entregables del enunciado (sección 4): la **Matriz de Control de Acceso por Rol (RBAC)** y la **Política de Privacidad de datos** (campos públicos vs. privados del expediente).

**Regla de este documento:** describe lo que está implementado hoy en `development` del repo API. Cada fila cita el archivo donde se aplica (ruta + guard, o política RLS). Lo que no coincide con el enunciado o con `context.md` está en la sección [9. Discrepancias y pendientes](#9-discrepancias-y-pendientes), no escondido.

Fuentes: `src/presentation/*/routes.ts`, `src/presentation/middlewares/auth.middleware.ts`, `src/services/*`, `supabase/migrations/*`, `supabase/tests/database/09_privacidad.test.sql`, `context.md` (§2, §3.4, §3.6), `README.md`, el PDF del enunciado y las tarjetas Jira HUNI-4, HUNI-74, HUNI-95 y HUNI-97. Para las vistas por plataforma se revisó `origin/development` de iOS, Android y Web (solo lectura).

## Contenido

1. [Cómo se aplica el control de acceso](#1-cómo-se-aplica-el-control-de-acceso)
2. [Roles: los permisos dependen solo del rol](#2-roles-los-permisos-dependen-solo-del-rol)
3. [Matriz de endpoints de la API](#3-matriz-de-endpoints-de-la-api)
4. [Matriz de acceso directo a Supabase (RLS y RPC)](#4-matriz-de-acceso-directo-a-supabase-rls-y-rpc)
5. [Inventario (HUNI-97)](#5-inventario-huni-97)
6. [Vistas por plataforma y rol](#6-vistas-por-plataforma-y-rol)
7. [Política de privacidad](#7-política-de-privacidad)
8. [Cómo se verifica](#8-cómo-se-verifica)
9. [Discrepancias y pendientes](#9-discrepancias-y-pendientes)

---

## 1. Cómo se aplica el control de acceso

Hay tres capas. Una fila de la matriz se cumple en la capa que la lista en la columna **Fuente**.

| Capa | Qué hace | Dónde vive |
|---|---|---|
| **API Express** | `authenticate` valida el JWT de Supabase (JWKS) y carga el rol desde `perfiles.rol` (no del token). `requireRole(...roles)` corta con `403 ACCESO_DENEGADO`. Los servicios aplican el alcance fino (lo propio, o los pacientes que atiende el doctor). | `src/presentation/middlewares/auth.middleware.ts`, `src/services/auth.service.ts`, `src/services/*.ts` |
| **RLS en PostgreSQL** | Políticas de lectura por rol para quien consulta Supabase con su `access_token` (Realtime y lectura directa). Las funciones `rol_actual()`, `paciente_actual_id()`, `es_medico_tratante()`, `puede_ver_historial()`, etc. deciden el acceso. | `supabase/migrations/*` |
| **RPC y triggers** | Los turnos y las citas se escriben directo desde los clientes con reglas en la base (`exigir_rol`, `validar_cita`). | `supabase/migrations/20261025235413_turnos_citas_rls_rpc.sql`, `20261113210000_solicitudes_atencion.sql` |

Códigos de error: sin token o token inválido → `401 NO_AUTENTICADO`. Cuenta desactivada → `403 CUENTA_INACTIVA`. Rol no permitido o recurso ajeno → `403 ACCESO_DENEGADO`.

Hechos que importan al leer la matriz:

- **La API conecta con Prisma (rol `postgres`) y salta el RLS.** Por eso la API repite las reglas en `requireRole` y en los servicios; el RLS protege a quien consulta Supabase directo.
- **Sin sesión (`anon`) no se lee ninguna tabla**, salvo los avisos públicos vigentes. Todo lo demás público sale de `estado_publico()` (`20261110180548_politicas_rls_privacidad_estado_publico.sql`, §1).
- **Las tablas privadas solo se escriben desde la API.** La misma migración revoca `INSERT/UPDATE/DELETE/TRUNCATE` a `anon` y `authenticated` en pacientes, expedientes, consultas, diagnósticos, recetas, perfiles, personal, catálogos, avisos, laboratorio, hospitalizaciones, camas y habitaciones (§4). Las funciones de camas y ambulancia solo las ejecuta `service_role`.
- **El filtrado se hace en el backend**, no en la UI (`context.md` §3.4).

---

## 2. Roles: los permisos dependen solo del rol

El sistema tiene **4 roles** (enum `rol_usuario`: `administrador`, `doctor`, `recepcionista`, `paciente`; migración `20261023222640_roles_cuatro.sql`, HUNI-95). El público sin sesión **no es un rol**: es el **Anónimo**, que solo ve ocupación general, médicos de turno y avisos.

**Los permisos dependen solo del rol** (`perfiles.rol`). El **tipo de personal** (doctor, enfermero, alergista, etc.) es una etiqueta del empleado: se usa en turnos, filtros, especialidad y para sugerir el rol al crear su cuenta. **No da ni quita permisos.** Una enfermera y una recepcionista tienen los mismos permisos porque comparten el rol Recepcionista/Asistente. Ningún `requireRole` ni política RLS consulta `tipos_personal` para autorizar.

### Tipos de personal → rol

Fuente de la regla: HUNI-4 y HUNI-95. Fuente en código: columna `tipos_personal.rol_sugerido` (`supabase/migrations/20261024164628_der_completo.sql`, §1) y `src/services/personal.service.ts` (`crear`).

| Tipo de personal | Rol de la cuenta | ¿Está en el catálogo semilla? |
|---|---|---|
| Doctor | Doctor | Sí |
| Alergista | Doctor | Sí |
| Médico de emergencia | Doctor | Sí |
| Recepcionista | Recepcionista/Asistente | Sí |
| Asistente | Recepcionista/Asistente | Sí |
| Enfermero/a | Recepcionista/Asistente | Sí |
| Administrador | Administrador | **No** (el catálogo trae "Administrativo"; ver sección 9) |
| Jefe de Operaciones | Administrador (misma cuenta y permisos) | **No** (ver sección 9) |
| Administrativo | Administrador | Sí |
| (otros: el catálogo es abierto, "entre otros") | `rol_sugerido` del tipo, o `null` | n/a |
| Paciente | Paciente (no es personal; se registra con `POST /api/auth/registro` o en recepción) | n/a |

Reglas del alta de personal (`POST /api/personal`, solo administrador):

- La cuenta de acceso es **opcional**: sin `email` el empleado solo aparece en turnos.
- Con `email`, el rol es el `rol` enviado o, si se omite, el `rol_sugerido` del tipo. Si el tipo no sugiere rol y no se envía `rol`, responde `400`. El validador solo admite `administrador`, `doctor` o `recepcionista` (nunca `paciente`).
- El administrador no puede desactivarse ni quitarse el rol a sí mismo (`impedirAutoBloqueo`).
- El rol **no** se puede cambiar desde `PATCH /api/auth/me` (el schema solo admite nombres, apellidos, teléfono y avatar) y la tabla `perfiles` no tiene escritura directa para `authenticated`.
- El alta pública solo crea pacientes: `POST /api/auth/registro` no recibe rol y fija `paciente` (`src/services/auth.service.ts`, `registrarPaciente`); el rol por defecto de `perfiles` también es `paciente`.

Dónde el tipo de personal **sí** interviene sin ser un permiso: `tipos_personal.es_medico` decide quién sale en "médicos de turno" del endpoint público y qué empleados pueden recibir una cita (`validar_cita`). Es una regla de negocio, no de acceso.

### Rol → plataforma

| Rol | Plataforma principal | Fuente |
|---|---|---|
| Administrador (incluye Jefe de Operaciones) | Web | `context.md` §2; Web `ProtectedRoute` exige rol Administrador |
| Doctor | iOS y Android | `context.md` §2; iOS `usesIOSApp`, Android `destinoPara` |
| Recepcionista/Asistente (incluye enfermeros) | Android | Android `destinoPara` |
| Paciente | iOS | iOS `usesIOSApp` |
| Anónimo | Pantalla de login (iOS/Android) y botón "Solicitar ambulancia" | `src/presentation/Publico/routes.ts`, `Ambulancia/routes.ts` |

---

## 3. Matriz de endpoints de la API

**Leyenda.** `L` = lectura · `E` = escritura (crear, modificar, cambiar estado, desactivar o borrar) · `LE` = ambas · `—` = sin acceso (`403`; para el Anónimo, `401`).
Alcance: `(p)` = solo lo propio · `(t)` = solo pacientes que atiende (médico tratante; ver [7.3](#73-quién-es-el-médico-tratante)).
Roles: **Adm** Administrador · **Doc** Doctor · **Rec** Recepcionista/Asistente · **Pac** Paciente · **Anón** Anónimo.

La columna **Fuente** cita el archivo de rutas (`src/presentation/<Módulo>/routes.ts`); el alcance fino `(p)`/`(t)` está en el servicio indicado.

### 3.1 Infraestructura, sesión y catálogos

| Endpoint | Adm | Doc | Rec | Pac | Anón | Fuente |
|---|---|---|---|---|---|---|
| `GET /health`, `POST /health/echo` | L | L | L | L | L | `Health/routes.ts` (sin guard; sin datos del hospital) |
| `GET /docs`, `GET /docs.json` | L | L | L | L | L | `presentation/server.ts` (sin guard) |
| `POST /api/auth/registro` | E | E | E | E | E | `Auth/routes.ts` (público; crea cuenta `paciente`) |
| `GET /api/auth/me` | L | L | L | L | — | `Auth/routes.ts`: `authenticate` + `requireRole(...ROLES)` |
| `PATCH /api/auth/me` (nombres, apellidos, teléfono, avatar propios) | E | E | E | E | — | `Auth/routes.ts` |
| `GET /api/especialidades` | L | L | L | L | — | `Personal/routes.ts` (`EspecialidadesRoutes`) |
| `GET /api/tipos-personal` | L | L | L | L | — | `Personal/routes.ts` (`TiposPersonalRoutes`). Solo lectura: no hay alta ni edición por API |

### 3.2 Personal y dashboard

| Endpoint | Adm | Doc | Rec | Pac | Anón | Fuente |
|---|---|---|---|---|---|---|
| `GET /api/personal`, `GET /api/personal/:id` | L | — | L | — | — | `Personal/routes.ts` (`verPersonal`) |
| `POST /api/personal`, `PATCH /api/personal/:id`, `DELETE /api/personal/:id` (desactiva) | E | — | — | — | — | `Personal/routes.ts` (`gestionarPersonal`) |
| `GET /api/dashboard/resumen` | L | — | — | — | — | `Dashboard/routes.ts` |

### 3.3 Pacientes, expediente y consultas

| Endpoint | Adm | Doc | Rec | Pac | Anón | Fuente |
|---|---|---|---|---|---|---|
| `GET /api/pacientes` | L | L (t) | L | — | — | `Pacientes/routes.ts`; filtro `tratadosPor` en `services/pacientes.service.ts` (`listar`) |
| `POST /api/pacientes` (registro en recepción) | E | — | E | — | — | `Pacientes/routes.ts` |
| `GET /api/pacientes/:id` (datos personales + n.º de expediente) | L | L (t) | L | L (p) | — | `Pacientes/routes.ts`; `pacientes.service.ts` (`buscarConAcceso`) |
| `PATCH /api/pacientes/:id` | E | — | E | E (p) | — | `Pacientes/routes.ts`; el paciente no puede enviar `activo` |
| `DELETE /api/pacientes/:id` (desactiva) | E | — | E | — | — | `Pacientes/routes.ts` |
| `GET /api/pacientes/:id/historial` (expediente + consultas) | L | L (t) | — | L (p) | — | `Pacientes/routes.ts`; `services/consultas.acceso.ts` (`exigirLecturaDeExpediente`) |
| `PATCH /api/pacientes/:id/expediente` (tipo de sangre, alergias, antecedentes, crónicas) | — | E (t) | — | — | — | `Pacientes/routes.ts`; `consultas.service.ts` (`pacienteVisible`) |
| `POST /api/consultas` | — | E | — | — | — | `Consultas/routes.ts` |
| `GET /api/consultas`, `GET /api/consultas/:id` | L | L (t)¹ | — | L (p) | — | `Consultas/routes.ts`; `consultas.service.ts` |
| `PATCH /api/consultas/:id`, `POST /api/consultas/:id/diagnosticos`, `POST /api/consultas/:id/recetas`, `POST /api/consultas/:id/cerrar` | — | E² | — | — | — | `Consultas/routes.ts` |

¹ La lista del doctor trae las consultas que él registró; el detalle exige que sea médico tratante del paciente.
² Solo el doctor que registró la consulta, y solo mientras esté abierta (`exigirAutorDeConsultaAbierta`; la base también lo impide). La receta **no** descuenta inventario.

La administración tiene lectura completa del historial y **ninguna escritura clínica**. Recepción no entra a información clínica (`LECTORES` en `Consultas/routes.ts`).

### 3.4 Laboratorio

| Endpoint | Adm | Doc | Rec | Pac | Anón | Fuente |
|---|---|---|---|---|---|---|
| `GET /api/laboratorio/examenes` (catálogo) | L | L | L | — | — | `Laboratorio/routes.ts` |
| `POST /api/laboratorio/ordenes` | — | E | — | — | — | `Laboratorio/routes.ts` |
| `GET /api/laboratorio/ordenes`, `GET /api/laboratorio/ordenes/:id` | L | L (t) | L³ | L (p) | — | `Laboratorio/routes.ts`; `laboratorio.service.ts` (`exigirAccesoOrden`) |
| `PATCH …/ordenes/:id/examenes/:orden_examen_id/estado` (iniciar examen) | E | — | E | — | — | `Laboratorio/routes.ts` (`procesan`) |
| `PUT …/ordenes/:id/examenes/:orden_examen_id/resultado` (registrar resultado, PDF o imagen) | E† | — | E† | — | — | `Laboratorio/routes.ts` (`procesan`) |
| `GET …/resultado/archivo` (URL firmada de 10 min) | L | L (t) | — | L (p) | — | `Laboratorio/routes.ts`; `laboratorio.service.ts` |

³ Recepción ve la orden **incluido el valor del resultado**; solo el archivo está vedado. Ver D-1 en la sección 9.
† Quien registra el resultado debe tener ficha en `personal` (se guarda como `validado_por`); si no, `403 PERFIL_INCOMPLETO` (`laboratorio.service.ts`, `registrarResultado`; `consultas.acceso.ts`, `personalDelDoctor`).

Estados: `pendiente → en_proceso → completado`, solo hacia adelante (trigger en BD).

### 3.5 Habitaciones, camas y hospitalizaciones

| Endpoint | Adm | Doc | Rec | Pac | Anón | Fuente |
|---|---|---|---|---|---|---|
| `GET /api/habitaciones` (mapa con ocupantes) | L | L⁴ | L | — | — | `Habitaciones/routes.ts`; `habitaciones.service.ts` (`mapa`) |
| `GET /api/camas`, `GET /api/camas/sugerencia` | L | — | L | — | — | `Habitaciones/routes.ts` (`gestionan`) |
| `PATCH /api/camas/:id/estado` (limpieza, mantenimiento, disponible) | E | — | E | — | — | `Habitaciones/routes.ts` |
| `POST /api/hospitalizaciones` (ingreso y asignación de cama) | E | — | E | — | — | `Habitaciones/routes.ts` |
| `GET /api/hospitalizaciones`, `GET /api/hospitalizaciones/:id` | L | L (t) | L | L (p) | — | `Habitaciones/routes.ts`; `habitaciones.service.ts` |
| `POST /api/hospitalizaciones/:id/alta`, `POST …/:id/traslado` | E | — | E | — | — | `Habitaciones/routes.ts` |

⁴ El doctor ve el mapa completo, pero el nombre del ocupante solo en las camas de sus pacientes; en las demás la cama sale `ocupada` con `ocupante: null`.

No se crean ni eliminan habitaciones por la API (11 habitaciones y 17 camas son seed).

### 3.6 Ambulancia

| Endpoint | Adm | Doc | Rec | Pac | Anón | Fuente |
|---|---|---|---|---|---|---|
| `GET /api/ambulancia` (estado) | L | L | L | L⁵ | — | `Ambulancia/routes.ts` (`todos`) |
| `PATCH /api/ambulancia/estado` (Disponible ⇄ En Mantenimiento) | E | — | — | — | — | `Ambulancia/routes.ts` |
| `GET /api/ambulancia/bitacora` | L | L | L | — | — | `Ambulancia/routes.ts` |
| `POST /api/ambulancia/solicitudes` | — | E | E | E (p) | — | `Ambulancia/routes.ts`; el paciente pide a su nombre, una abierta a la vez |
| `GET /api/ambulancia/solicitudes`, `GET …/solicitudes/:id` | L | L⁶ | L | L (p) | — | `Ambulancia/routes.ts`; `ambulancia.service.ts` |
| `PATCH /api/ambulancia/solicitudes/:id` | E | — | E | — | — | `Ambulancia/routes.ts` |
| `POST …/solicitudes/:id/despachar`, `…/en-curso`, `…/cerrar` | — | — | E | — | — | `Ambulancia/routes.ts` (`recepcion`) |
| `POST …/solicitudes/:id/cancelar` | E | — | E | E (p) | — | `Ambulancia/routes.ts` |
| `POST /api/publico/ambulancia/solicitudes` (botón del login; 3 por IP cada 15 min y tope global de 5 pendientes públicas) | E | E | E | E | E | `Ambulancia/routes.ts` (`AmbulanciaPublicaRoutes`, `limiteSolicitudPublica`); `ambulancia.service.ts` (`MAX_PENDIENTES_PUBLICAS = 5`, `429 LIMITE_SOLICITUDES`) |
| `GET /api/publico/ambulancia/solicitudes/:codigo` (solo estado y horas) | L | L | L | L | L | `Ambulancia/routes.ts`; `SeguimientoSolicitudPublicaSchema` |
| `PATCH …/solicitudes/:codigo`, `POST …/solicitudes/:codigo/cancelar` | E | E | E | E | E | `Ambulancia/routes.ts` (se opera con el código de seguimiento) |

⁵ El paciente ve el estado de la ambulancia, pero `solicitud_activa` (a dónde va) solo si el servicio es suyo.
⁶ El doctor ve las solicitudes y la bitácora de **cualquier** paciente, sin relación de tratante. Ver D-3 en la sección 9.

Las rutas `/api/publico/ambulancia/*` no usan `authenticate` ni `requireRole` (`AmbulanciaPublicaRoutes`): cualquier llamada, con o sin sesión, recibe el mismo trato; por eso las cinco columnas coinciden. Las usa el Anónimo desde el login. El límite por IP (3 cada 15 min) vive en memoria del proceso: solo es fiable con una sola instancia de la API.

### 3.7 Avisos e información pública

| Endpoint | Adm | Doc | Rec | Pac | Anón | Fuente |
|---|---|---|---|---|---|---|
| `GET /api/avisos`, `GET /api/avisos/:id` | L (todos, también programados y vencidos) | L (vigentes, públicos e internos) | L (vigentes, públicos e internos) | L (solo públicos vigentes) | — | `Avisos/routes.ts`; `avisos.service.ts` (`puedeVer`) |
| `POST /api/avisos`, `PATCH /api/avisos/:id`, `DELETE /api/avisos/:id` | E | — | — | — | — | `Avisos/routes.ts` (`gestionar`) |
| `GET /api/publico/estado` (ocupación agregada, médicos de turno ahora, avisos públicos vigentes) | L | L | L | L | L | `Publico/routes.ts` (sin guard); función `estado_publico()` |

### 3.8 Inventario, proveedores y activos

Ver el detalle en la [sección 5](#5-inventario-huni-97).

---

## 4. Matriz de acceso directo a Supabase (RLS y RPC)

Estos accesos **no pasan por Express**. Los clientes usan el SDK de Supabase con el `access_token` del usuario. Los turnos, las citas y las solicitudes de atención se escriben así por diseño (HUNI-51, HUNI-56; ver `README.md`, "Turnos y citas directo desde Supabase"). Por eso **no aparecen en `/docs`**. Las demás filas son políticas de lectura que protegen a quien consulta con su token (por ejemplo Realtime).

### 4.1 Tablas y vistas

| Tabla / vista | Adm | Doc | Rec | Pac | Anón | Política (migración) |
|---|---|---|---|---|---|---|
| `pacientes` (datos personales) | L | L (t) | L | L (p) | — | `pacientes_leer` (`20261110180548`) |
| `expedientes`, `consultas`, `diagnosticos`, `recetas`, `receta_detalles` | L | L (t) | — | L (p) | — | `expedientes_leer`, `consultas_leer`, `diagnosticos_leer`, `recetas_leer`, `receta_detalles_leer` vía `puede_ver_historial()` / `puede_ver_consulta()` (`20261110180548`) |
| `ordenes_laboratorio`, `orden_examenes` | L | L (t) | L | L (p) | — | `ordenes_laboratorio_leer`, `orden_examenes_leer` vía `puede_ver_orden()` (`20261026012327`) |
| `resultados_laboratorio` | — | — | — | — | — | Sin política de lectura: el valor y el PDF los entrega solo la API (`20261026012327`, `20261110180548`) |
| `hospitalizaciones` | L | L (t) | L | L (p) | — | `hospitalizaciones_leer` (`20261026172234`) |
| `camas`, `habitaciones` | L | L | L | L | — | `camas_leer`, `habitaciones_leer`: cualquier usuario con sesión; no traen datos del paciente (`20261026172234`) |
| `perfiles` | L | L (p) | L | L (p) | — | `perfiles_leer` (`20261110180548`) |
| `personal` | L | L (p) | L | — | — | `personal_leer` (`20261110180548`) |
| `especialidades`, `tipos_personal`, `examenes_catalogo` | L | L | L | L | — | `*_leer`: cualquier usuario con sesión (`20261110180548`) |
| `avisos` | L (todos) | L (vigentes) | L (vigentes) | L (públicos vigentes) | L (públicos vigentes) | `avisos_publicos_leer` (anon + authenticated), `avisos_internos_leer` (solo personal), `avisos_administrador_leer` (`20261110180548`) |
| `turnos_personal`, `v_turnos` | LE | L | LE⁷ | L | — | `turnos_leer`, `turnos_crear`, `turnos_editar`, `turnos_borrar` (`20261025235413`). Borrar solo el administrador. El área debe ser una activa de `areas_hospital` (`validar_area_turno`, `20261117180000`) |
| `areas_hospital` (áreas de los turnos) | LE | L | L | L | — | `areas_hospital_leer` (activas; el administrador también las desactivadas), `areas_hospital_crear`, `areas_hospital_editar` (`20261117180000`). Nadie las borra: se desactivan |
| `citas`, `v_citas` | L, E | L (p), E⁸ | L, E | L (p), E⁹ | — | `citas_leer`, `citas_editar`, `citas_borrar` y `validar_cita()` (`20261025235413`) |
| `solicitudes_atencion`, `v_solicitudes_atencion` | L | — | L | L (p) | — | `solicitudes_atencion_leer` (`20261113210000`) |
| `ambulancias` | L | L | L | L | — | `ambulancias_leer` (`20261028193842`) |
| `solicitudes_ambulancia` | L | L | L | L (p) | — | `solicitudes_ambulancia_leer` (`20261028193842`) |
| `bitacora_ambulancia` | L | L | L | — | — | `bitacora_ambulancia_leer` (`20261028193842`) |
| Inventario (`inventario_items`, `lotes_inventario`, `activos`, `proveedores`, `movimientos_inventario`) | — | — | — | — | — | RLS habilitado y **sin política**: denegado por defecto. Solo la API |
| `movimientos_cama`, `v_dashboard_summary`, `v_lotes_por_vencer` | — | — | — | — | — | `movimientos_cama`: RLS habilitado y `revoke all` a `anon` y `authenticated` (`20261026172234`). Las dos vistas: `revoke all` a `anon` y `authenticated` (`20261024172312`). Solo la API (dashboard y lotes por vencer) |

⁷ Recepción crea y edita turnos (`turnos_crear`, `turnos_editar`); no los borra.
⁸ El doctor solo cambia el **estado** de sus propias citas, a `confirmada`, `atendida` o `no_asistio` (`validar_cita`). No cambia fecha, doctor ni motivo.
⁹ El paciente solo **cancela** sus propias citas.

Escrituras directas: ningún rol (ni siquiera el administrador) escribe con su token en pacientes, expediente, consultas, laboratorio, camas, hospitalizaciones, ambulancia, avisos, personal ni perfiles. Esas escrituras solo pasan por la API. En `citas` nadie hace `INSERT` directo.

### 4.2 Funciones RPC

| RPC | Adm | Doc | Rec | Pac | Anón | Control |
|---|---|---|---|---|---|---|
| `crear_cita(...)` | E | — | E | — | — | `exigir_rol(['administrador','recepcionista'])` (`20261025235413`) |
| `doctores_disponibles(...)` | L | — | L | — | — | `exigir_rol(['administrador','recepcionista'])` |
| `reprogramar_cita(...)` | E | — | E | — | — | `exigir_rol(['administrador','recepcionista'])` |
| `crear_solicitud_atencion(...)` (máx. 3 pendientes) | — | — | — | E (p) | — | `exigir_rol(['paciente'])` (`20261113210000`) |
| `responder_solicitud_atencion(...)` | E | — | E | — | — | `exigir_rol(['administrador','recepcionista'])` |
| `estado_publico()` | L | L | L | L | L | `grant execute ... to anon, authenticated, service_role` (`20261110180548`, §5) |

`exigir_rol` deja pasar sin comprobar rol cuando no hay JWT de usuario (la API con Prisma o la llave `service_role`): se considera backend de confianza.

---

## 5. Inventario (HUNI-97)

Regla (`context.md` §3.6, HUNI-97): **solo el Administrador, desde la Web**, registra entradas, salidas, ajustes, activos y proveedores. Doctor y Recepcionista/Asistente **solo consultan existencias**. Paciente y Anónimo no tienen acceso. No hay rol de farmacia.

Todo el inventario va por la API (`HUNI-98`): no hay política RLS para ningún rol, así que un token de usuario no lee estas tablas directo.

| Endpoint / vista | Adm | Doc | Rec | Pac | Anón | Fuente |
|---|---|---|---|---|---|---|
| `GET /api/inventario`, `GET /api/inventario/:id` (existencias de ítems) | L | L | L | — | — | `Inventario/routes.ts` (`leen`) |
| `GET /api/inventario/:id/lotes` (lotes y caducidad) | L | L | L | — | — | `Inventario/routes.ts` (`leen`) |
| Ítems desactivados (`activo=false`) | L | — | — | — | — | `inventario.service.ts` (`403` para no administradores; el detalle responde `404`) |
| `POST /api/inventario`, `PATCH /api/inventario/:id`, `DELETE /api/inventario/:id` (crear, editar, desactivar ítem) | E | — | — | — | — | `Inventario/routes.ts` (`admin`) |
| **Entradas:** `POST /api/inventario/:id/entradas` | E | — | — | — | — | `Inventario/routes.ts` (`admin`) |
| **Salidas:** `POST /api/inventario/:id/salidas` | E | — | — | — | — | `Inventario/routes.ts` (`admin`) |
| **Ajustes:** `POST /api/inventario/:id/ajustes` | E | — | — | — | — | `Inventario/routes.ts` (`admin`) |
| `GET /api/inventario/movimientos`, `GET /api/inventario/lotes-por-vencer` | L | — | — | — | — | `Inventario/routes.ts` (`admin`) |
| **Activos (equipos por n.º de serie):** `GET/POST /api/activos`, `GET/PATCH /api/activos/:id` | LE | — | — | — | — | `Activos/routes.ts` (`router.use(authenticate, requireRole('administrador'))`) |
| **Proveedores:** `GET/POST /api/proveedores`, `GET/PATCH/DELETE /api/proveedores/:id` (desactiva, no borra) | LE | — | — | — | — | `Proveedores/routes.ts` (`router.use(authenticate, requireRole('administrador'))`) |
| Contadores de caducidad en `GET /api/dashboard/resumen` (`lotes_por_vencer`, `inventario_bajo_minimo`) | L | — | — | — | — | `Dashboard/routes.ts` |

**"Solo desde la Web" se cumple por el cliente, no por la API.** La API valida el rol, no la plataforma. Web solo admite Administrador, y Android e iOS no dan acceso al Administrador (sección 6); un token de administrador funcionaría contra la API desde cualquier cliente. Ver D-5.

---

## 6. Vistas por plataforma y rol

La API es la autoridad: ocultar una pantalla no concede ni quita permisos. Esta sección describe qué pantallas tiene cada cliente en `origin/development` y qué endpoint o política de las secciones 3 a 5 corresponde a cada una. La columna "Respaldo" indica el permiso que la vista necesita, no que la pantalla ya esté conectada: eso varía por ticket en cada cliente.

### 6.1 Quién entra a cada app

| Plataforma | Adm | Doc | Rec | Pac | Anón | Fuente |
|---|---|---|---|---|---|---|
| **Web** (React + Vite) | Panel completo | Acceso denegado | Acceso denegado | Acceso denegado | Solo login y recuperar contraseña | `src/components/auth/ProtectedRoute.tsx`: exige sesión, rol Administrador y cuenta activa |
| **iOS** (SwiftUI) | Pantalla "Acceso no disponible" | Tabs del doctor | Pantalla "Acceso no disponible" | Tabs del paciente | Login, registro, información pública | `App/RootView.swift`, `me.rol.usesIOSApp` |
| **Android** (Kotlin) | `SinAccesoRuta` | Tabs del doctor | Tabs de recepción | `SinAccesoRuta` | Login y botón de ambulancia | `ui/navigation/DestinoPorRol.kt` |

### 6.2 Vistas por rol

**Administrador (Web).** Menú de la barra lateral (`components/layout/Sidebar.tsx`):

| Vista | Respaldo en la API |
|---|---|
| Dashboard | `GET /api/dashboard/resumen` |
| Usuarios y personal | `/api/personal` (LE), `/api/tipos-personal`, `/api/especialidades` |
| Pacientes | `/api/pacientes` (LE) |
| Turnos | `turnos_personal`, `v_turnos`, `areas_hospital` (LE) (Supabase directo) |
| Mapa de plantas | `/api/habitaciones`, `/api/camas`, `/api/hospitalizaciones` |
| Inventario y recursos | `/api/inventario`, `/api/activos`, `/api/proveedores` (sección 5) |
| Laboratorio | `/api/laboratorio/ordenes` (L); el rol también puede procesar exámenes por API |
| Ambulancia | `GET /api/ambulancia`, `PATCH /api/ambulancia/estado` (mantenimiento), solicitudes |
| Bitácora | `GET /api/ambulancia/bitacora` |
| Avisos | `/api/avisos` (LE) |
| Reportes y métricas | `/api/dashboard/resumen` (el origen de datos de esta pantalla no se revisó) |
| Perfil | `/api/auth/me` |

**Doctor (iOS y Android).**

| Vista | Plataforma | Respaldo en la API |
|---|---|---|
| Inicio (iOS), Agenda | iOS, Android | `v_citas` (solo las suyas) |
| Pacientes y Expediente | iOS, Android | `/api/pacientes` (t), `/api/pacientes/:id/historial` (t) |
| Nueva consulta, receta, orden de laboratorio | iOS | `/api/consultas`, `/api/laboratorio/ordenes` (E) |
| Turnos | iOS, Android | `v_turnos` |
| Perfil | iOS, Android | `/api/auth/me` |

**Recepcionista/Asistente (Android).** Tabs: Inicio, Pacientes, Citas, Camas, Más (Laboratorio, Ambulancia, Turnos, Perfil) (`ui/recepcion/RecepcionHomeScreen.kt`, `MasScreen.kt`).

| Vista | Respaldo en la API |
|---|---|
| Pacientes (registro y ficha) | `/api/pacientes` (L y E) |
| Citas | `v_citas`, RPC `crear_cita`, `doctores_disponibles`, `reprogramar_cita`, `responder_solicitud_atencion` |
| Camas, ingreso, traslado y alta | `/api/habitaciones`, `/api/camas`, `/api/hospitalizaciones` (L y E) |
| Laboratorio (procesar exámenes) | `/api/laboratorio/ordenes` (L), iniciar examen y registrar resultado (E) |
| Ambulancia (verificar, despachar, cerrar) | `/api/ambulancia/solicitudes`, `…/despachar`, `…/en-curso`, `…/cerrar` |
| Turnos del personal | `turnos_personal` (LE), `v_turnos`, `areas_hospital` (L) |
| Inventario | Permiso de solo consulta de existencias (`/api/inventario`, L). Android no tiene pantalla de inventario en `development` |

**Paciente (iOS).** Tabs: Inicio, Citas, Mi salud, Ambulancia, Perfil (`Features/Shell/RoleTabView.swift`).

| Vista | Respaldo en la API |
|---|---|
| Citas y solicitud de atención | `v_citas` (p), RPC `crear_solicitud_atencion`, cancelar la propia cita |
| Mi salud: historial | `/api/pacientes/:id/historial` (p), `/api/consultas` (p) |
| Mi salud: laboratorio | `/api/laboratorio/ordenes` (p) y archivo (p) |
| Mi habitación asignada | `/api/hospitalizaciones` (p) |
| Ambulancia | `/api/ambulancia`, `POST /api/ambulancia/solicitudes` (p), cancelar la propia |
| Información pública y turnos del personal | `GET /api/publico/estado`, `v_turnos` |
| Perfil | `/api/auth/me` |

**Anónimo (login de iOS y Android).** Solo `GET /api/publico/estado`, el botón "Solicitar ambulancia" (`/api/publico/ambulancia/*`) y el registro de paciente (`POST /api/auth/registro`).

---

## 7. Política de privacidad

Fuente de la regla: enunciado (sección 1, regla 4) y `context.md` §3.4. Implementada en HUNI-74 (`20261110180548_politicas_rls_privacidad_estado_publico.sql`) y verificada con `supabase/tests/database/09_privacidad.test.sql`.

### 7.1 Información pública y privada

| Pública (cualquier usuario, incluso sin sesión) | Privada / sensible |
|---|---|
| Estado general de ocupación del hospital (solo cantidades) | Expediente médico |
| Médicos de turno ahora | Resultados de laboratorio |
| Avisos generales | Asignación específica de habitación de un paciente |
| | Información personal del paciente |

**Acceso a datos privados:** el **médico tratante**, el **propio paciente** y la **administración**. El código añade dos excepciones operativas para Recepción, ver 7.4 y D-1/D-2.

### 7.2 Campos públicos (campo por campo)

Los entrega **únicamente** `GET /api/publico/estado` o la RPC `estado_publico()`. El servicio copia campo por campo (`src/services/publico.service.ts`, `toEstadoPublico`, sin `spread`): si la función agregara algo, no se filtra a la respuesta.

| Bloque | Campos públicos | Nunca incluye |
|---|---|---|
| `ocupacion` | Por tipo (`vip`, `semiprivada`, `total`): `ocupadas`, `disponibles`, `total` | Códigos de habitación o cama, nombres de pacientes |
| `medicos_de_turno` | `nombres`, `apellidos`, `tipo`, `especialidad`, `area`, `hora_inicio`, `hora_fin`. Solo tipos con `es_medico`, en turno en este momento (hora de El Salvador) | Teléfono, correo, código de empleado, licencia; personal que no es médico |
| `avisos` | `id`, `titulo`, `contenido`, `fecha_publicacion`, `fecha_expiracion`. Solo avisos con `es_publico`, ya publicados y no vencidos | Avisos internos, programados o vencidos |
| `actualizado_en` | Marca de tiempo | n/a |

Seguimiento de ambulancia sin cuenta (`GET /api/publico/ambulancia/solicitudes/:codigo`): solo `codigo_seguimiento`, `estado`, `tiene_contacto` y las horas de solicitud, despacho, en curso y cierre. No devuelve ubicación, teléfono ni nombres. Quien la pide sin cuenta entrega ubicación (y opcionalmente teléfono y nombre de contacto) al hospital; eso es dato privado una vez guardado (solo lo leen Adm, Doc y Rec).

### 7.3 Quién es el médico tratante

Relación explícita doctor-paciente (`es_medico_tratante()` en `20261026012327_laboratorio_estados_resultados_realtime.sql`): el rol de la sesión es `doctor` y existe al menos una de estas relaciones con el `personal` del doctor:

- una **cita** del paciente con ese doctor que no esté `cancelada`,
- una **consulta** que ese doctor registró para el paciente,
- una **hospitalización** del paciente con ese doctor como tratante.

La API usa la misma regla (`pacientes.repository.esTratante`). Un doctor **no** ve datos privados de pacientes que no atiende; con el rol `doctor` pero sin ficha en `personal`, responde `403 PERFIL_INCOMPLETO`. Observación: una cita programada ya cuenta como relación, y da acceso al historial completo del paciente, incluidas las consultas de otros doctores. También una consulta nueva crea la relación (D-12).

### 7.4 Campos del paciente y su expediente

Esquemas: `src/domain/dtos/pacientes.dto.ts`, `consultas.dto.ts`, `laboratorio.dto.ts`, `habitaciones.dto.ts`. Todos son **privados**. Lo que cambia es quién los lee.

| Grupo | Campos | Adm | Doc (t) | Rec | Pac (p) | Anón |
|---|---|---|---|---|---|---|
| **Datos personales** | `nombres`, `apellidos`, `documento_identidad`, `fecha_nacimiento`, `sexo`, `telefono`, `direccion`, `contacto_emergencia`, `telefono_emergencia`, `numero_expediente`, `activo`, `perfil_id` | Sí | Sí | Sí | Sí | No |
| **Expediente** | `tipo_sangre`, `alergias`, `antecedentes`, `enfermedades_cronicas`, `numero_expediente` (solo en `/historial`) | Sí | Sí | No | Sí | No |
| **Consultas** | `fecha`, `motivo_consulta`, `signos_vitales`, `examen_fisico`, `notas`, `cerrada_en`, `doctor` | Sí | Sí | No | Sí | No |
| **Diagnósticos** | `codigo_cie10`, `descripcion`, `tipo`, `registrado_por` | Sí | Sí | No | Sí | No |
| **Recetas** | `indicaciones`, `fecha_emision`, `detalles` (`medicamento`, `dosis`, `frecuencia`, `duracion`, `cantidad`) | Sí | Sí | No | Sí | No |
| **Laboratorio: órdenes** | `prioridad`, `estado`, exámenes, fechas | Sí | Sí | Sí | Sí | No |
| **Laboratorio: resultados** | `valor`, `unidad`, `rango_referencia`, `observaciones`, `validado_por` | Sí | Sí | **Sí (ver D-1)** | Sí | No |
| **Laboratorio: archivo** (PDF o imagen) | URL firmada de 10 minutos | Sí | Sí | No | Sí | No |
| **Habitación asignada** | `cama`, `habitacion`, `doctor_tratante`, `fecha_ingreso`, `fecha_alta`, `motivo_ingreso`, `notas_alta`, movimientos de cama | Sí | Sí | Sí | Sí | No |
| **Cuenta** (`perfiles`) | `email`, `telefono`, `avatar_url`, `rol`, `activo` | Sí | Solo la propia | Sí | Solo la propia | No |

Resumen de acceso a lo privado:

| Rol | Datos personales | Expediente e historial | Laboratorio | Habitación asignada |
|---|---|---|---|---|
| Administrador | Sí | Sí (solo lectura) | Sí | Sí |
| Doctor | Solo pacientes que atiende | Solo pacientes que atiende | Solo pacientes que atiende | Solo pacientes que atiende |
| Recepcionista/Asistente | Sí (registra e ingresa pacientes) | **No** | Órdenes y valores sí; archivo no | Sí (hace ingresos, traslados y altas) |
| Paciente | Solo el propio | Solo el propio | Solo el propio | Solo la propia |
| Anónimo | No | No | No | No |

Otras reglas de privacidad en el código:

- Un paciente no puede averiguar qué ids existen: pedir un recurso ajeno o inexistente responde `403` igual (`pacientes.service.ts`, `consultas.service.ts`, `laboratorio.service.ts`).
- Ambulancia: el paciente no ve a dónde va la ambulancia si el servicio no es suyo (`ambulancia.service.ts`, `estado`).
- Logs: no se registran datos privados del paciente (`CLAUDE.md`, Logging).
- Realtime: solo se publican tablas cuyo RLS decide quién recibe cada cambio; los resultados de laboratorio no se publican.

---

## 8. Cómo se verifica

| Qué | Dónde |
|---|---|
| Anónimo solo ve agregados; el paciente A no lee nada del paciente B; el doctor tratante sí y el que no atiende no; recepción ve datos personales y cama pero no información clínica; administración lee todo; las escrituras directas se rechazan (65 aserciones pgTAP) | `supabase/tests/database/09_privacidad.test.sql` |
| RLS y RPC de turnos y citas con el JWT de cada rol | `supabase/tests/database/04_turnos_citas.test.sql` |
| Catálogo de áreas de los turnos (`AREA_INVALIDA`, RLS por rol) | `supabase/tests/database/12_areas_turnos.test.sql` |
| RLS de solicitudes de atención | `supabase/tests/database/11_solicitudes_atencion.test.sql` |
| Laboratorio, camas y ambulancia (lectura por rol y reglas de estado) | `06_laboratorio.test.sql`, `07_camas.test.sql`, `08_ambulancia.test.sql` |
| Respuestas HTTP por ruta (401, 403, alcance) con servicios simulados | `test/presentation/*.test.ts` |
| El contrato `/docs` coincide con la API real | `test/docs/contrato.test.ts` |

Los tests pgTAP corren con `supabase test db` (job `test-db` de CI).

---

## 9. Discrepancias y pendientes

Cada punto es una diferencia entre lo implementado y lo que piden el enunciado, `context.md` o Jira. Ninguno se corrigió en este documento: requieren decisión del equipo.

| # | Tema | Qué pasa en el código | Qué pide la regla | Sugerencia |
|---|---|---|---|---|
| **D-1** | Recepción lee los **valores** de laboratorio | `GET /api/laboratorio/ordenes[/:id]` devuelve `valor`, `unidad`, `rango_referencia` y `observaciones` a Recepcionista (`toOrdenExamen` no depende del rol). La política `puede_ver_orden()` también incluye a Recepción. Solo el archivo (PDF o imagen) está vedado (`Laboratorio/routes.ts`, comentario de HUNI-62). | Enunciado y `context.md` §3.4: resultados de laboratorio privados; acceso "exclusivo para el médico tratante, el propio paciente y la administración autorizada". `context.md` §6 y su registro de decisiones del 2026-10-26 ya conceden a Recepción ver y actualizar estado y resultado (sin PDF), así que el choque es con §3.4 y el enunciado. | Decidir: ocultar `valor`, `unidad`, `rango_referencia` y `observaciones` para Recepción (que solo vea estado), o documentarlo como excepción operativa. Recepción procesa los exámenes (HUNI-62). |
| **D-2** | Recepción ve datos personales y habitación asignada | `pacientes_leer` y `hospitalizaciones_leer` incluyen `recepcionista`; la API igual. El expediente y el historial no. | `context.md` §3.4: acceso a datos privados "exclusivo para el médico tratante, el propio paciente y la administración autorizada". `context.md` §6 ya concede a Recepción crear, leer y actualizar en Pacientes (datos personales) y en Habitaciones (asignación por paciente), así que el choque es solo con la regla del enunciado y de §3.4. | Es necesario para registrar e ingresar pacientes (HUNI-95, `context.md` §2). Dejarlo como excepción operativa aceptada y anotarlo en la defensa. |
| **D-3** | El doctor ve ambulancia de **cualquier** paciente | `solicitudes_ambulancia_leer` y `GET /api/ambulancia/solicitudes` y `/bitacora` dan al doctor todas las solicitudes, con paciente, dirección y descripción de la emergencia, sin relación de tratante. | `context.md` §3.4: un doctor no ve datos de pacientes que no atiende. | Decidir si el doctor necesita la bitácora completa; si no, filtrar por pacientes tratados o quitar el nombre del paciente. |
| **D-4** | Tipos de personal "Administrador" y "Jefe de Operaciones" no existen en el catálogo | La semilla de `tipos_personal` trae "Administrativo → administrador". HUNI-4 y HUNI-95 hablan de "Administrador" y "Jefe de Operaciones" como tipos que agrupa el rol Administrador. | HUNI-4: Administrador y Jefe de Operaciones → rol Administrador. | Agregar los dos tipos (migración o seed) o actualizar HUNI-4 y esta tabla para que digan "Administrativo". El catálogo es abierto. Hoy el administrador puede darse de alta con cualquier tipo y `rol: administrador`. |
| **D-5** | "Solo desde la Web" no lo impone la API | Inventario, activos y proveedores validan el rol Administrador, no la plataforma. La restricción vive en los clientes (Web admite solo Administrador; iOS y Android no dan acceso al Administrador). | HUNI-97 y `context.md` §3.6: el Administrador registra movimientos solo desde la Web. | Aceptable si el equipo lo asume. Si se quiere forzar, haría falta distinguir plataforma (header o claim); hoy no existe. |
| **D-6** | Turnos, citas y solicitudes de atención no pasan por la API | Se leen y escriben directo en Supabase con RLS y RPC (HUNI-51, HUNI-56). No están en `/docs` ni en `test/docs/contrato.test.ts`. | `CLAUDE.md` y HUNI-36 dicen que `/docs` es el contrato v1 de los clientes. | La matriz de la sección 4 los cubre. Mantenerla sincronizada con las migraciones cuando cambien. |
| **D-7** | Nombre del endpoint público | HUNI-74 pedía `GET /public/status`; se implementó `GET /api/publico/estado` (y la RPC `estado_publico()`). | Criterio de HUNI-74. | Es solo el nombre; actualizar la tarjeta. |
| **D-8** | "Administración autorizada" sin distinción | Cualquier `administrador` activo lee todo el historial clínico y el laboratorio. No existe un subrol o permiso adicional de "autorizada". | Enunciado: "administración autorizada". | Con 4 roles fijos (HUNI-95) el rol Administrador **es** la administración autorizada. Anotarlo así en la defensa. |
| **D-9** | Rate limit solo en la creación de solicitudes públicas de ambulancia | `POST /api/publico/ambulancia/solicitudes` tiene 3 por IP cada 15 min, y además un tope global de 5 solicitudes públicas pendientes (`MAX_PENDIENTES_PUBLICAS`, `429 LIMITE_SOLICITUDES`, `ambulancia.service.ts`). El límite por IP vive en memoria del proceso (`rate-limit.middleware.ts`): con varias instancias no se comparte. `GET`, `PATCH` y `POST …/cancelar` por código no tienen límite por IP; la protección es el código de seguimiento. | No definido. | Evaluar un límite por IP en las rutas por código y mover el contador a la BD o a Redis si se escala a más de una instancia. |
| **D-10** | Registro directo en Supabase Auth | `config.toml` tiene `enable_signup = true` (entorno local). Quien tenga la anon key puede crear un usuario Auth; el trigger `handle_new_user` le crea un perfil con rol `paciente` (por defecto) **sin ficha de paciente**. No escala privilegios, pero deja una cuenta que responde `PERFIL_INCOMPLETO` en los endpoints que necesitan ficha. | No definido. | Revisar la configuración del proyecto remoto y limpiar cuentas huérfanas, o desactivar el registro directo y dejar solo `POST /api/auth/registro`. |
| **D-11** | Catálogo de tipos de personal solo de lectura | `GET /api/tipos-personal` es la única ruta; alta y edición del catálogo siguen pendientes (comentario en `Personal/routes.ts`) y las tablas no admiten escritura directa. | HUNI-4 y HUNI-95: el catálogo es abierto ("entre otros"). | Agregar tipos nuevos hoy requiere una migración. |
| **D-12** | El doctor se vuelve médico tratante al abrir una consulta | `POST /api/consultas` acepta a cualquier paciente activo con expediente, sin cita ni hospitalización previas (`consultas.service.ts`, `crear`, comentario "emergencias, pacientes sin cita"). Esa consulta cuenta en `tratadoPor` (`pacientes.repository.ts`) y en `es_medico_tratante()` (`20261026012327`), y desde ese momento el doctor lee el historial completo, el laboratorio y la habitación del paciente. | `context.md` §3.4: un doctor no ve expedientes de pacientes que no atiende; la relación debe ser explícita (cita, consulta o ingreso). Es coherente con la letra (la consulta es una relación), pero cualquier doctor puede crearse acceso a cualquier paciente. `context.md` §6 lo respalda ("C (paciente activo)"). | Decidir si se acepta (urgencias, pacientes sin cita) o se exige cita u hospitalización previa; si se acepta, anotarlo en la defensa y valorar un registro de auditoría de esas aperturas. |

Nota sobre el alcance de la lista del doctor: `GET /api/consultas` devuelve las consultas que el doctor registró, mientras que el detalle y el historial permiten a cualquier médico tratante (cita, consulta u hospitalización). No es una fuga, pero conviene recordarlo al probar con dos doctores.
