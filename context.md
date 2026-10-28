# HospitalUnicaes: Contexto del Proyecto

> Documento de contexto para el equipo y para asistentes de IA (Claude, Copilot, etc.).
> Colócalo en la raíz de cada repositorio (`/context.md`) y mantenlo actualizado cuando cambie una decisión.
> Las secciones marcadas con **[POR DEFINIR]** todavía no tienen una decisión del equipo; no asumas una respuesta.

---

## 1. Resumen

**Nombre:** HospitalUnicaes, Sistema de Gestión para Hospital Universitario ("Hospital Universitario Central").
**Tipo:** Proyecto final integrador de la materia *Desarrollo de Aplicaciones Móviles Avanzadas*.
**Docente:** Ing. Herberth Contreras.
**Periodo:** 17 de octubre – 21 de noviembre de 2026 (6 sprints semanales).

**Objetivo:** construir un ecosistema multiplataforma para la gestión operativa y clínica de un hospital universitario, con:

| Plataforma | Tecnología obligatoria | Usuarios principales | Enfoque |
|---|---|---|---|
| App iOS | Xcode + Swift / SwiftUI | Doctores y Pacientes | Experiencia del usuario móvil y profesional |
| App Android | Android Studio + Kotlin (Gradle) | Recepcionistas, Asistentes/Enfermeros, Doctores | Operaciones en punto de atención |
| Web Administrativa | React + Vite | Administradores y Jefes de Operaciones | Panel central, dashboard y métricas |
| Backend | Node.js + TypeScript + Prisma | Todas las plataformas | Backend unificado (una sola API / BD para los 3 clientes) |

Detalle completo del stack en §4.3.

Las tres plataformas consumen **un mismo backend unificado**. Ningún cliente tiene su propia base de datos de negocio.

---

## 2. Roles de usuario

| # | Rol | Responsabilidades | Plataformas |
|---|---|---|---|
| 1 | **Administrador** | Gestión de usuarios, asignación de espacios (habitaciones), control de recursos/inventario y métricas | Web (principal) |
| 2 | **Doctor** | Consulta general, emisión de órdenes de laboratorio, revisión de expedientes e historial clínico | iOS, Android |
| 3 | **Recepcionista / Asistente** (incluye enfermeros) | Asignación de citas, control de turnos, registro e ingreso de pacientes | Android |
| 4 | **Paciente** | Consulta de turnos/citas, estado de laboratorio, visualización de su historial y solicitudes de atención | iOS |

> "Jefe de Operaciones" aparece como usuario de la Web. **[POR DEFINIR]**: si es un rol propio o una variante del Administrador.

---

## 3. Reglas de negocio (fuente de verdad)

### 3.1 Infraestructura hospitalaria: habitaciones

| Planta | Tipo | Habitaciones | Camas por habitación | Total camas |
|---|---|---|---|---|
| 3ª planta | **VIP (individual)** | `VIP-301`, `VIP-302`, `VIP-303`, `VIP-304`, `VIP-305` (exactamente 5) | 1 | 5 |
| 2ª planta | **Semiprivada (compartida)** | `HAB-201`, `HAB-202`, `HAB-203`, `HAB-204`, `HAB-205`, `HAB-206` (exactamente 6) | 2 | 12 |
| **Total** | | **11 habitaciones** | | **17 camas** |

Reglas obligatorias:
- **Capacidad fija.** No se crean ni eliminan habitaciones desde la app; los 11 registros se cargan como datos semilla (seed).
- **Sin sobrecupo:** una habitación VIP nunca tiene más de 1 paciente; una semiprivada nunca más de 2.
- **Sin doble asignación:** una cama no puede tener dos pacientes activos, y un paciente no puede ocupar dos camas a la vez.
- La validación debe hacerse **en el backend** (no solo en la UI) y ser segura ante **concurrencia** (dos recepcionistas asignando la misma cama al mismo tiempo). Usar transacciones, restricciones únicas o bloqueo a nivel de BD.
- Recomendación de modelado: entidad `Cama` (17 registros) relacionada a `Habitacion`, con una asignación activa única por cama (`UNIQUE` parcial sobre asignaciones activas).
- Incluye **administración de recursos e inventarios** del hospital.

### 3.2 Control de turnos del personal
- Registro y visualización de horarios para: doctores, enfermeras, alergistas, emergencia, asistentes, recepcionistas, entre otros.
- La lista de especialidades/áreas no es cerrada: modelarla como catálogo, no como enum rígido.
- "Médicos de turno" es **información pública** (ver §3.4).

### 3.3 Consulta general y laboratorio
- Registro de **diagnósticos**, **recetas** y **solicitudes de exámenes**.
- Información de **citas** de pacientes.
- Resultados de laboratorio con exactamente estos estados:

```
Pendiente → En Proceso → Completado
```

Transiciones esperadas: solo hacia adelante (la base de datos lo garantiza desde HUNI-62). **[POR DEFINIR]**: si se permite cancelar una orden.

### 3.4 Política de privacidad: información pública vs. privada

| Pública (cualquier usuario, incluso sin sesión) | Privada / sensible |
|---|---|
| Estado general de ocupación del hospital (cantidades, no nombres) | Expediente médico |
| Médicos de turno | Resultados de laboratorio |
| Avisos generales | Asignación específica de habitación de un paciente |
| | Información personal del paciente |

**Acceso a datos privados:** exclusivo para el **médico tratante**, el **propio paciente** y la **administración autorizada**.

Implicaciones técnicas:
- La ocupación pública se expone como agregados (ej. "VIP: 3/5 ocupadas"), nunca con identidad del paciente.
- "Médico tratante" implica relación explícita doctor-paciente (por cita, consulta o ingreso). Un doctor **no** ve expedientes de pacientes que no atiende.
- El filtrado se hace **en el backend**. Ocultar campos solo en la UI no cuenta como privacidad.
- Debe documentarse campo por campo qué es público y qué es privado (entregable obligatorio, §6).

### 3.5 Recurso crítico: ambulancia
- El hospital tiene **exactamente 1 ambulancia privada**.
- Módulo de **solicitud/despacho en tiempo real**.
- Estados:

```
Disponible ⇄ En Servicio
Disponible ⇄ En Mantenimiento
```

- Solo se puede despachar si está **Disponible**. Dos solicitudes simultáneas no pueden despacharla dos veces (control de concurrencia).
- Debe mantener una **bitácora** de las emergencias atendidas, consultable con **filtros** (fecha, tipo, estado, etc.).
- "Tiempo real": los cambios de estado se ven en las 3 plataformas sin recargar por **Supabase Realtime** (tablas `ambulancias` y `solicitudes_ambulancia`, con RLS). Quien la pide sin cuenta consulta su estado por código cada ~10 s (HUNI-70).
- **Pedirla:** el paciente desde iOS (a su nombre, una abierta a la vez), recepción y doctores desde la app, y **cualquiera sin cuenta** con el botón "Solicitar ambulancia" del login, que solo exige la ubicación (GPS o dirección). Recepción verifica (devuelve la llamada si hay teléfono) y decide el despacho; si no logra verificar, se recomienda despachar (HUNI-70).

### 3.6 Inventario: lotes, activos y proveedores (cambio de alcance 2026-10-24)
- **Medicamentos e insumos se controlan por lote.** Cada lote tiene número de lote, **fecha de caducidad** y cantidad. El stock de un ítem es la suma de sus lotes. Se entrega por unidades: una salida de 1 unidad descuenta 1 del lote elegido, nunca el lote completo.
- **Equipos se controlan por número de serie** (activos), uno por uno. Estados: `disponible`, `en_uso`, `en_mantenimiento`, `dado_de_baja` (definitivo). Ubicación en texto libre. Sin garantía ni fecha de compra: solo el registro del activo.
- **Proveedores:** nombre, NIT, NRC, contacto, teléfono, correo y dirección. No se borran, se desactivan. Toda entrada (lote o activo) se registra con su proveedor activo. Sin órdenes de compra.
- **Salidas:** el usuario elige el lote; el cliente los muestra ordenados **FEFO** (primero el que vence antes). Un lote **vencido no admite entradas ni salidas**; solo un ajuste para descartarlo.
- **Alertas de caducidad:** lotes con existencias que vencen en ≤ 15 días y en 16–30 días (vista `v_lotes_por_vencer` y contadores en el dashboard). Cómo se muestran lo decide cada cliente.
- **Concurrencia:** dos salidas simultáneas del mismo lote no pueden dejarlo en negativo (lo garantiza la BD).
- **Recetas e inventario van separados:** la receta no descuenta stock, porque el paciente puede comprar sus medicamentos donde quiera.
- La **ambulancia no es un activo del inventario**: sigue en su propio módulo (§3.5).
- **Quién mueve el inventario:** solo el **administrador**, desde la Web, registra entradas, salidas, ajustes, activos y proveedores. No hay rol de farmacia; doctor y recepcionista solo consultan existencias.

---

## 4. Arquitectura

### 4.1 Requisitos de calidad evaluados
- **MVVM** en iOS y Android.
- Asincronía eficiente:
  - Android: **Kotlin Coroutines** (+ Flow recomendado).
  - iOS: **async/await** o **Combine**.
- Consumo eficiente de APIs (sin llamadas redundantes, manejo de errores y estados de carga).

### 4.2 Diagrama general

```
 ┌──────────────┐   ┌──────────────────┐   ┌────────────────────┐
 │ iOS (SwiftUI)│   │ Android (Kotlin) │   │ Web Admin (SPA)    │
 │ Doctor,      │   │ Recepción,       │   │ Administrador,     │
 │ Paciente     │   │ Asistente, Doctor│   │ Jefe Operaciones   │
 └──────┬───────┘   └────────┬─────────┘   └─────────┬──────────┘
        │  HTTPS / JSON + canal en tiempo real        │
        └────────────────────┼────────────────────────┘
                             ▼
                 ┌─────────────────────────┐
                 │   BACKEND UNIFICADO     │
                 │ Auth + RBAC · API REST  │
                 │ Reglas de negocio       │
                 │ Tiempo real (ambulancia)│
                 └───────────┬─────────────┘
                             ▼
                     ┌───────────────┐
                     │ Base de datos │
                     └───────────────┘
```

### 4.3 Stack tecnológico

#### Decidido (2026-10-17)
| Capa | Tecnología | Notas |
|---|---|---|
| **Backend** | **Node.js + TypeScript** | API REST unificada para iOS, Android y Web |
| **ORM** | **Prisma** | Solo como cliente: `prisma db pull` + `prisma generate`. Sin `prisma migrate` |
| **Autenticación** | **Supabase Auth** (email/contraseña) | Los clientes inician sesión con el SDK de Supabase y envían el `access_token` como `Bearer`; la API lo valida con el JWKS del proyecto (ES256) y toma el rol de `perfiles` (2026-10-24, HUNI-38) |
| **Base de datos** | **PostgreSQL 17 en Supabase** | Auth email/contraseña; migraciones SQL con Supabase CLI en `supabase/migrations` (2026-10-21, HUNI-16) |
| **Web administrativa** | **React + Vite** | SPA del panel de Administrador / Jefe de Operaciones |
| **App Android** | **Android Studio + Kotlin** (Gradle) | MVVM + Coroutines (+ Flow) |
| **App iOS** | **Xcode + Swift** (SwiftUI) | MVVM + async/await (o Combine) |
| **Repositorio** | Monorepo en GitHub | `/backend`, `/web`, `/android`, `/ios`, `/docs` |

Implicaciones para el código:
- **Concurrencia (camas y ambulancia):** usar `prisma.$transaction` con nivel de aislamiento `Serializable` o restricciones únicas en BD (ej. índice único parcial sobre asignaciones activas) para que el backend rechace sobrecupos y despachos dobles. Validar solo en la UI no es suficiente.
- **Enums de Prisma** para estados fijos: `EstadoLaboratorio` (`PENDIENTE`, `EN_PROCESO`, `COMPLETADO`), `EstadoAmbulancia` (`DISPONIBLE`, `EN_SERVICIO`, `EN_MANTENIMIENTO`), `TipoHabitacion` (`VIP`, `SEMIPRIVADA`), `Rol`.
- **Seed obligatorio** (`prisma/seed.ts`): 5 habitaciones VIP (1 cama c/u), 6 semiprivadas (2 camas c/u), 1 ambulancia `DISPONIBLE`, 1 administrador.
- **Contrato compartido:** los DTO/respuestas de la API deben documentarse (ej. OpenAPI/Swagger) porque Kotlin y Swift no comparten los tipos de TypeScript.

#### Aún **[POR DEFINIR]**
| Tema | Opciones | Decisión |
|---|---|---|
| Framework HTTP en Node | Express / Fastify / NestJS | — |
| Tiempo real (ambulancia, ocupación) | Socket.IO / WebSockets nativos / SSE / polling | Supabase Realtime con RLS (HUNI-62, HUNI-66, HUNI-70) |
| Validación de entrada | Zod / class-validator / otra | — |
| UI de la web | Librería de componentes (MUI, shadcn/ui, Tailwind…) | — |
| Cliente HTTP Android | Retrofit / Ktor Client | — |
| Hosting backend, BD y web | — | — |

> Cuando se tome una decisión, moverla a la tabla de "Decidido" con la fecha.

### 4.4 Estructura sugerida del repositorio

```
HospitalUnicaes/
├── README.md            # instalación, variables de entorno y ejecución de las 3 plataformas
├── context.md           # este archivo
├── docs/                # Documento de arquitectura (PDF), diagramas, ERD, RBAC, privacidad
├── backend/             # Node.js + TypeScript + Prisma
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts      # 11 habitaciones, 17 camas, 1 ambulancia, admin
│   └── src/             # rutas, controladores, servicios, middlewares (auth/RBAC)
├── web/                 # React + Vite (panel administrativo)
├── android/             # Android Studio, Kotlin, Gradle, MVVM
└── ios/                 # Xcode, Swift/SwiftUI, MVVM
```

Arquitectura interna sugerida por cliente móvil:
```
View (SwiftUI / Compose o XML) → ViewModel → Repository → API Service (red) / caché local
```

---

## 5. Modelo de datos (borrador)

Entidades mínimas que el documento exige: Doctores, Pacientes, Turnos, Habitaciones (VIP/Semiprivadas), Administración, Laboratorio y Ambulancia. Borrador, a validar en el Sprint 1:

| Entidad | Campos clave (borrador) |
|---|---|
| `Usuario` | id, email, password_hash / auth_id, rol, activo, creado_en |
| `Personal` | id, usuario_id, nombre, tipo (doctor, enfermera, alergista, emergencia, asistente, recepcionista…), especialidad |
| `Paciente` | id, usuario_id (opcional), nombre, documento, fecha_nacimiento, teléfono, contacto_emergencia, alergias |
| `Turno` | id, personal_id, área, fecha, hora_inicio, hora_fin |
| `Cita` | id, paciente_id, doctor_id, fecha_hora, motivo, estado |
| `Consulta` | id, cita_id / paciente_id, doctor_id, diagnóstico, notas, fecha |
| `Receta` | id, consulta_id, medicamento, dosis, indicaciones |
| `OrdenLaboratorio` | id, consulta_id, paciente_id, doctor_id, tipo_examen, estado (`PENDIENTE`, `EN_PROCESO`, `COMPLETADO`), resultado, fechas |
| `Habitacion` | id, código (`VIP-301`… / `HAB-201`…), planta (2 o 3), tipo (`VIP`, `SEMIPRIVADA`), capacidad (1 o 2) |
| `Cama` | id, habitacion_id, número |
| `AsignacionCama` | id, cama_id, paciente_id, fecha_ingreso, fecha_alta, activa (única activa por cama y por paciente) |
| `Inventario` / `Recurso` | id, código, nombre, categoría (`medicamento`, `insumo`, `equipo`), unidad, stock_actual (calculado), stock_mínimo, ubicación |
| `Proveedor` | id, nombre, NIT, NRC, contacto, teléfono, email, dirección, activo |
| `LoteInventario` | id, item_id, número_lote, fecha_caducidad, cantidad_actual |
| `MovimientoInventario` | id, item_id, lote_id, tipo (`entrada`, `salida`, `ajuste`), cantidad, proveedor_id (entradas), motivo, registrado_por |
| `Activo` | id, item_id, número_serie, proveedor_id, estado, ubicación, fecha_ingreso, notas |
| `Ambulancia` | id (único registro), placa, estado (`DISPONIBLE`, `EN_SERVICIO`, `EN_MANTENIMIENTO`) |
| `ServicioAmbulancia` (bitácora) | id, ambulancia_id, solicitado_por, paciente_id (opcional), tipo_emergencia, origen, destino, hora_solicitud, hora_despacho, hora_cierre, notas |
| `Aviso` | id, título, contenido, público, fecha |

Datos semilla obligatorios: 5 habitaciones VIP (1 cama c/u), 6 semiprivadas (2 camas c/u), 1 ambulancia en estado `DISPONIBLE`, 1 usuario administrador.

---

## 6. Matriz RBAC (borrador)

Leyenda: **C** crear · **R** leer · **U** actualizar · **D** eliminar · *(propio)* = solo sus registros · *(tratante)* = solo pacientes que atiende.

| Recurso | Administrador | Doctor | Recepcionista/Asistente | Paciente | Público (sin sesión) |
|---|---|---|---|---|---|
| Usuarios / personal | CRUD | R (propio) | R | R (propio) | — |
| Pacientes (datos personales) | CRUD | R (tratante) | C, R, U | R, U (propio) | — |
| Expediente / historial | R | C, R, U (tratante) | — | R (propio) | — |
| Citas | CRUD | R, U (propias: solo estado) | CRUD | R (propio), U (solo cancelar) | — |
| Turnos del personal | CRUD | R | C, R, U | R | R (médicos de turno) |
| Consultas, diagnósticos, recetas | R | C (paciente activo), R (tratante), U (solo el autor, abierta) | — | R (propio) | — |
| Órdenes de laboratorio | R, U (estado y resultado) | C (autor de la consulta), R (tratante) | R, U (estado y resultado; sin PDF) | R (propio) | — |
| Habitaciones: ocupación agregada | R | R | R | R | R |
| Habitaciones: asignación por paciente | CRUD | R (tratante) | C, R, U | R (propio) | — |
| Inventario / recursos | CRUD | R | R | — | — |
| Inventario: entradas, salidas y activos | CRUD (Web) | — | — | — | — |
| Proveedores | CRUD | — | — | — | — |
| Ambulancia: estado | R, U (mantenimiento) | R, solicitar | R, solicitar / despachar / cerrar / cancelar | R, solicitar (propio) | solicitar (botón del login, solo ubicación) |
| Ambulancia: bitácora | R (filtros) | R | R | — | — |
| Avisos generales | CRUD | R | R | R | R |
| Métricas / dashboard | R | — | — | — | — |

> Validar con el equipo y el docente. La versión final va en el Documento de Arquitectura.

---

## 7. Cronograma (sprints semanales)

| Semana | Fecha | Objetivos y entregables |
|---|---|---|
| 1 | 17 oct | **Planificación y diseño:** definir backend/BD, arquitectura de la API, UX/UI en Figma, modelado de datos |
| 2 | 24 oct | **Auth y BD:** login por roles, maquetación base en Xcode/Kotlin/Web, estructura de habitaciones y turnos |
| 3 | 31 oct | **Módulos principales (AVANCE 50%):** consulta general, flujo de laboratorio, panel admin básico |
| 4 | 07 nov | **Lógica avanzada:** algoritmo de asignación de habitaciones (plantas 2 y 3), recurso único de ambulancia, permisos de privacidad |
| 5 | 14 nov | **Pruebas e integración:** conexión completa iOS + Android + Web, pruebas de concurrencia, corrección de errores, pulido visual |
| 6 | 21 nov | **Entrega final y defensa:** presentación en vivo, demostración de flujos, repositorio + documentación |

---

## 8. Evaluación

### 8.1 Entrega de avance: 31 de octubre (50% de la nota del periodo)
- [ ] Diseño UI/UX en **Figma 100% completo**: flujos de todas las pantallas de iOS, Android y Web.
- [ ] **Diagrama Entidad-Relación** y endpoints/servicios base operativos.
- [ ] Avance funcional mínimo 50%:
  - [ ] Autenticación funcional con roles (Login/Register).
  - [ ] Navegación principal maquetada y funcional en Xcode (Swift/SwiftUI) y Android Studio (Kotlin).
  - [ ] CRUD básico de pacientes y personal de salud.
  - [ ] Panel Web mostrando dashboard inicial.

### 8.2 Entrega final y defensa: 21 de noviembre (50% de la nota del periodo)
| Criterio | Peso | Contenido |
|---|---|---|
| Funcionalidad completa en las 3 plataformas | 40% | Consulta general, administración y laboratorio; asignación lógica de habitaciones (5 VIP en 3ª, 6 semiprivadas en 2ª); estado de la única ambulancia en tiempo real; política de visibilidad pública vs. privada |
| Calidad de código y arquitectura | 20% | MVVM en iOS/Android; asincronía (Coroutines / async-await o Combine) |
| Defensa técnica en vivo | 20% | Demo sincrónica navegando flujos entre pacientes (iOS/Android) y administradores (Web) |
| Documentación técnica y repositorio | 20% | Ver §9 |

> La defensa es **sincrónica**: un cambio hecho en una plataforma debe verse en las otras durante la demo (ej. recepción asigna cama en Android → el dashboard web refleja la ocupación; se despacha la ambulancia → cambia de estado en todas).

---

## 9. Entregables de documentación

**Repositorio unificado en GitHub** + **Documento de Arquitectura (PDF)** que contenga:

1. **Enlace a Figma**
   - Prototipo interactivo completo: Mobile (iOS y Android) y Web.
   - Sistema de diseño básico: paleta de colores accesible, tipografía, estados de componentes.
2. **Documento técnico de arquitectura**
   - Diagrama de arquitectura de software (interacción iOS, Android, Web y Backend).
   - Diagrama de BD / colecciones: Doctores, Pacientes, Turnos, Habitaciones (VIP/Semiprivadas), Administración, Laboratorio, Ambulancia.
   - Matriz RBAC: qué endpoints/vistas puede acceder y modificar cada rol.
   - Política de privacidad: campos públicos vs. privados del expediente del paciente.
3. **Código fuente**
   - Proyecto Xcode configurado y funcional.
   - Proyecto Android Studio en Kotlin con Gradle estructurado.
   - Proyecto web administrativo.
   - `README.md` principal con instalación, variables de entorno y ejecución de las 3 plataformas.

---

## 10. Pautas para asistentes de IA y colaboradores

1. **Las reglas de §3 son innegociables.** Capacidades (5 VIP / 6 semiprivadas / 17 camas / 1 ambulancia), estados de laboratorio y estados de ambulancia se respetan textualmente.
2. **Toda validación de negocio y de privacidad vive en el backend.** La UI puede validar para UX, pero el backend siempre vuelve a validar.
3. **Concurrencia primero** en asignación de camas y despacho de ambulancia.
4. **MVVM obligatorio** en móviles; no poner lógica de red ni de negocio en las vistas.
5. **Nunca exponer datos privados** (§3.4) en endpoints públicos, logs ni mensajes de error.
6. No inventar decisiones marcadas **[POR DEFINIR]**: preguntar o proponer opciones.
7. Idioma: interfaz y documentación en **español**; código: endpoints y campos JSON en español con `snake_case` (igual que la BD, decidido 2026-10-23); nombres internos de variables y clases, consistentes en todo el repo.
8. Prioridad según calendario: hasta el 31 oct, auth + CRUD + navegación + dashboard + Figma + ERD. Lógica avanzada después.
9. Al cerrar cada sprint, actualizar este archivo (decisiones tomadas, cambios de alcance).

---

## 11. Registro de decisiones

| Fecha | Decisión | Responsable |
|---|---|---|
| 2026-10-17 | Creación de este documento de contexto a partir del enunciado oficial | — |
| 2026-10-17 | Stack: Node.js + TypeScript + Prisma (backend), React + Vite (web), Kotlin en Android Studio (Android), Swift en Xcode (iOS) | Equipo |
| 2026-10-21 | BD en Supabase (PostgreSQL 17, proyecto "Hospital UNICAES") con Auth email/contraseña. El esquema se versiona con Supabase CLI (`supabase/migrations`); Prisma solo como cliente (`db pull` + `generate`), sin `prisma migrate` (HUNI-16) | Jimmy |
| 2026-10-23 | Contrato de API v1 en `/docs` (OpenAPI 3). Rutas y campos JSON en español con `snake_case`. Errores con `code` legible por máquina además del `statusCode` (catálogo en `src/domain/errors/error-codes.ts`). Enum `rol_usuario` reducido a 4 roles: `administrador`, `doctor`, `recepcionista` (= Recepcionista/Asistente), `paciente` (HUNI-36, HUNI-95) | Jimmy |
| 2026-10-24 | Esquema completo del DER (HUNI-37): tipos de personal como catálogo editable (`tipos_personal`, con `rol_sugerido`), personal sin cuenta (`personal.perfil_id` opcional), pacientes desactivables (`activo`), consultas que se cierran (`cerrada_en`, la BD impide editarlas), turnos sin solape y citas con `duracion_minutos` sin doble reserva (exclusion constraints), vista `v_dashboard_summary`. Seed idempotente con usuarios demo (contraseña en el repo por decisión del equipo; cambiarla antes de la demo final) | Jimmy |
| 2026-10-24 | Cambio de alcance del inventario (§3.6): medicamentos/insumos por lote con caducidad, equipos por número de serie con estado, proveedores desactivables, entradas con proveedor, salida bloqueada para lotes vencidos, alertas a 15 y 30 días. Recetas e inventario separados; la ambulancia queda fuera del inventario. Solo el administrador (Web) registra movimientos, activos y proveedores; sin rol de farmacia (HUNI-97) | Jimmy |
| 2026-10-24 | Auth y RBAC (HUNI-38): la API valida el JWT de Supabase con su JWKS (sin llamar a Supabase por petición), el rol sale siempre de `perfiles` (no del token), `requireRole()` responde 403 `ACCESO_DENEGADO` y una cuenta con `perfiles.activo = false` responde 403 `CUENTA_INACTIVA`. Registro público solo crea pacientes; el alta de personal con cuenta la hace el administrador con la llave de servicio (`POST /api/personal`, adelantado de HUNI-45) | Jimmy |
| 2026-10-26 | Camas (HUNI-66): ingreso, traslado y alta son funciones de Postgres con bloqueo de fila (`asignar_cama`, `trasladar_cama`, `dar_alta`); dos solicitudes por la misma o la última cama → solo una gana (probado con dos conexiones reales en pgTAP). La sugerencia prefiere habitaciones vacías (privacidad, control de infecciones) y luego cualquier cama libre; **no se bloquea ni se filtra por sexo** (el cliente lo muestra con el `sexo` del ocupante). Tras el alta o un traslado la cama queda en `limpieza` y recepción la marca `disponible`. Historial en `movimientos_cama` (ingreso, traslado, alta, con autor). Asignan administración y recepción; en el mapa, un doctor solo ve el nombre de los pacientes que atiende. Realtime de `camas` y `hospitalizaciones` con RLS | Jimmy |
| 2026-10-26 | Laboratorio (HUNI-62): cada examen sigue `pendiente → en_proceso → completado` (la BD rechaza cualquier otra transición con `TRANSICION_INVALIDA`); completar exige resultado con valor y/o PDF (`RESULTADO_REQUERIDO`) y un resultado completado no se modifica. Mientras no exista un rol de laboratorio (HUNI-75), **administración y recepción** procesan los exámenes (en un hospital real lo haría un laboratorista; `validado_por` guarda quién registró cada resultado). Recepción ve las órdenes y sus resultados en texto, pero no descarga el PDF ni ve historial ni consultas. Los PDF van al bucket privado `resultados-laboratorio` y se descargan con URL firmada de 10 minutos (tratante, paciente y administración). Cambios de estado por Supabase Realtime (`orden_examenes` y `ordenes_laboratorio`) con RLS de lectura; los resultados no se publican. Cancelar una orden sigue **[POR DEFINIR]** | Jimmy |
| 2026-10-26 | Consultas e historial clínico (HUNI-57): cualquier doctor abre una consulta a un paciente activo (también de emergencia, sin cita) y desde ese momento es su médico tratante; si atiende una cita, debe ser suya, del mismo paciente y estar programada o confirmada. Solo el doctor que abrió la consulta le agrega diagnósticos, recetas y exámenes, la edita y la cierra; cerrada, nada cambia (la BD lo impide también en `receta_detalles` y `orden_examenes`). Cada diagnóstico, receta y orden guarda `registrado_por` y su fecha. Leen el historial solo el médico tratante, el propio paciente y la administración (solo lectura); recepción no ve información clínica. La receta no descuenta stock. `POST /api/laboratorio/ordenes` y `GET /api/laboratorio/examenes` se adelantan de HUNI-62 | Jimmy |
| 2026-10-25 | Turnos y citas directo desde Supabase (HUNI-51): RLS en `turnos_personal` y `citas`, vistas `v_turnos`/`v_citas` y RPC `crear_cita()`, `doctores_disponibles()` y `reprogramar_cita()`. Las citas las crean **solo administrador y recepcionista** (el paciente las pide en recepción; no hay INSERT directo). El doctor ve solo sus citas (así se entiende "su área") y solo marca confirmada/atendida/no_asistio; el paciente ve las suyas y solo las cancela. La cita debe caer completa dentro de los turnos del doctor (hora de El Salvador). Si un doctor no puede atender, recepción busca reemplazo con `doctores_disponibles()` y mueve la cita con `reprogramar_cita()`. Errores legibles `TURNO_SOLAPADO`, `CITA_DUPLICADA`, `CITA_FUERA_DE_TURNO` con SQLSTATE `PTxxx` para que PostgREST responda con el HTTP del catálogo | Jimmy |
| 2026-10-25 | CRUD de pacientes y personal (HUNI-45): "médico tratante" = el doctor tiene una cita no cancelada, una consulta o una hospitalización con el paciente (solo así lo lista o ve). El paciente ve y edita solo su ficha. Desactivar un paciente o empleado con cuenta también desactiva su cuenta (403 `CUENTA_INACTIVA`) y `PATCH activo: true` la reactiva. El administrador no puede desactivarse ni quitarse su rol (422). El dashboard se sirve desde la vista `v_dashboard_summary` | Jimmy |
| 2026-10-28 | Ambulancia (HUNI-70): despachar, pasar a en curso, cerrar y cancelar son funciones de Postgres que bloquean la fila de la única ambulancia (dos despachos simultáneos → solo uno gana, `AMBULANCIA_NO_DISPONIBLE`; probado con dos conexiones reales en pgTAP). Solicitud: `pendiente → despachada → en_curso → finalizada`, o `cancelada`. Despacha, marca en curso y cierra **recepción**; el **administrador** pone y quita el mantenimiento (desde `en_servicio` → 422 `AMBULANCIA_EN_SERVICIO`). Se cancela una pendiente (recepción, administración o el propio paciente) y también una ya despachada (falsa alarma) por recepción o administración con motivo: la ambulancia vuelve a disponible. **Tipo de emergencia** como enum (`accidente`, `cardiaca`, `respiratoria`, `neurologica`, `obstetrica`, `intoxicacion`, `traslado`, `otra`) además de la prioridad. Toda solicitud lleva dirección o coordenadas GPS. **Botón público** en el login, sin cuenta: solo la ubicación; devuelve un código de seguimiento con el que se ve el estado, se agregan teléfono/nombre/descripción después o se cancela; límite de 3 por IP cada 15 min y 5 públicas pendientes (429 `LIMITE_SOLICITUDES`). Recepción completa los datos que falten con `PATCH`. Bitácora: cada cambio de estado con la emergencia, la descripción y quién lo hizo; la ven administración, recepción y doctores, con filtros por fecha, estado, prioridad y tipo | Jimmy |

## 12. Glosario
- **VIP:** habitación individual de la 3ª planta.
- **Semiprivada:** habitación compartida de la 2ª planta (2 camas).
- **Sobrecupo:** asignar más pacientes que la capacidad de una habitación.
- **Doble asignación:** dos pacientes en la misma cama, o un paciente en dos camas.
- **Médico tratante:** doctor con relación activa de atención con un paciente.
- **Bitácora:** historial de servicios atendidos por la ambulancia.
- **RBAC:** Role-Based Access Control, control de acceso basado en roles.
