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

Transiciones esperadas: solo hacia adelante. **[POR DEFINIR]**: si se permite cancelar una orden.

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
- "Tiempo real": los cambios de estado deben verse en las 3 plataformas sin recargar manualmente (WebSockets, Realtime de la BD, SSE o polling corto). **[POR DEFINIR]** mecanismo.

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
| **ORM** | **Prisma** | Esquema en `backend/prisma/schema.prisma`; migraciones con `prisma migrate`; datos semilla con `prisma db seed` |
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
| Base de datos (motor para Prisma) | PostgreSQL / MySQL / otra | — |
| Framework HTTP en Node | Express / Fastify / NestJS | — |
| Autenticación | JWT propio (access + refresh) / proveedor externo | — |
| Tiempo real (ambulancia, ocupación) | Socket.IO / WebSockets nativos / SSE / polling | — |
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
| `Inventario` / `Recurso` | id, nombre, categoría, cantidad, ubicación |
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
| Citas | CRUD | R, U (propias) | CRUD | C (solicitud), R (propio) | — |
| Turnos del personal | CRUD | R | C, R, U | R | R (médicos de turno) |
| Consultas, diagnósticos, recetas | R | C, R, U (tratante) | — | R (propio) | — |
| Órdenes de laboratorio | R | C, R (tratante) | R, U (estado) **[POR DEFINIR]** | R (propio) | — |
| Habitaciones: ocupación agregada | R | R | R | R | R |
| Habitaciones: asignación por paciente | CRUD | R (tratante) | C, R, U | R (propio) | — |
| Inventario / recursos | CRUD | R | R | — | — |
| Ambulancia: estado | R, U | R, solicitar | R, solicitar / despachar | solicitar **[POR DEFINIR]** | — |
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
7. Idioma: interfaz y documentación en **español**; código (nombres de variables, clases, endpoints) **[POR DEFINIR]** español o inglés, pero consistente en todo el repo.
8. Prioridad según calendario: hasta el 31 oct, auth + CRUD + navegación + dashboard + Figma + ERD. Lógica avanzada después.
9. Al cerrar cada sprint, actualizar este archivo (decisiones tomadas, cambios de alcance).

---

## 11. Registro de decisiones

| Fecha | Decisión | Responsable |
|---|---|---|
| 2026-10-17 | Creación de este documento de contexto a partir del enunciado oficial | — |
| 2026-10-17 | Stack: Node.js + TypeScript + Prisma (backend), React + Vite (web), Kotlin en Android Studio (Android), Swift en Xcode (iOS) | Equipo |

## 12. Glosario
- **VIP:** habitación individual de la 3ª planta.
- **Semiprivada:** habitación compartida de la 2ª planta (2 camas).
- **Sobrecupo:** asignar más pacientes que la capacidad de una habitación.
- **Doble asignación:** dos pacientes en la misma cama, o un paciente en dos camas.
- **Médico tratante:** doctor con relación activa de atención con un paciente.
- **Bitácora:** historial de servicios atendidos por la ambulancia.
- **RBAC:** Role-Based Access Control, control de acceso basado en roles.
