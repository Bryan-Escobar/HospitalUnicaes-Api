# Pruebas de concurrencia (HUNI-78)

El enunciado exige que el backend rechace el sobrecupo de camas y el doble despacho de la ambulancia aunque dos
personas actúen al mismo tiempo (`context.md` §3.6 y §3.7). Esta prueba lo demuestra con la API real: lanza N
solicitudes HTTP simultáneas contra el mismo recurso y comprueba que solo ganan las que caben.

- **Script:** `test/concurrencia/concurrencia.mjs` (Node 20, sin dependencias nuevas).
- **Comando:** `npm run test:concurrencia`.
- **CI:** corre en cada PR dentro del job `test-db`, después de pgTAP, y publica la tabla de resultados en el
  resumen del job.

## Qué se prueba

Todas las peticiones de un escenario salen en el mismo instante (`Promise.all`), con sesiones reales de Supabase
Auth de las cuentas demo. Después de cada ráfaga el script consulta la API para confirmar el estado final.

| # | Escenario | Regla | Resultado esperado |
|---|---|---|---|
| 1 | N pacientes distintos piden **la misma cama** | Una cama tiene como máximo un paciente activo | 1 × `201`; el resto `409 CAMA_OCUPADA` |
| 2 | **El mismo paciente** pide varias camas distintas | Un paciente ocupa como máximo una cama | 1 × `201`; el resto `409 PACIENTE_YA_HOSPITALIZADO` |
| 3 | N pacientes piden cama por **asignación automática** con menos camas libres que pacientes | No hay sobrecupo: nunca más ingresos que camas | Tantos `201` como camas libres, cada uno con una cama distinta; el resto `409 SIN_CAMAS_DISPONIBLES` |
| 4 | Se despachan a la vez **N solicitudes de ambulancia distintas** | La única ambulancia atiende un servicio a la vez | 1 × `200`; el resto `409 AMBULANCIA_NO_DISPONIBLE` |
| 5 | **La misma solicitud** se despacha N veces (doble clic) | Una solicitud se despacha una sola vez | 1 × `200`; el resto `409 AMBULANCIA_NO_DISPONIBLE` |
| 6 | N **salidas del mismo lote** que suman más que su existencia | El stock de un lote nunca queda en negativo | Tantas `201` como alcanza el stock; el resto `409 STOCK_INSUFICIENTE`; el lote queda ≥ 0 y el stock del ítem coincide |

Un escenario falla si el número de éxitos no es exactamente el esperado, si aparece un rechazo con otro código
(por ejemplo un `500`) o si el estado final no coincide. El comando termina con código `0` solo si pasan todos.

## Por qué no hay carrera

La API no decide con un "leer y luego escribir" en Node: cada operación es una sola función o restricción de
PostgreSQL, que es quien ordena las peticiones simultáneas.

| Recurso | Mecanismo en la base de datos | Migración |
|---|---|---|
| Cama | `asignar_cama()` bloquea la fila de la cama (`SELECT … FOR UPDATE`) y, como última barrera, el índice único parcial `hospitalizaciones_cama_activa` (`cama_id` con `fecha_alta IS NULL`) | `20261026172234_asignacion_camas.sql`, `20261022011429_esquema_inicial.sql` |
| Paciente | `asignar_cama()` bloquea la fila del paciente y el índice único parcial `hospitalizaciones_paciente_activo` | las mismas |
| Asignación automática | La cama sugerida se toma con `FOR UPDATE … SKIP LOCKED`: dos ingresos simultáneos reciben camas distintas en vez de esperar por la misma | `20261026172234_asignacion_camas.sql` |
| Ambulancia | `despachar_ambulancia()` bloquea la fila de la única ambulancia y la de la solicitud antes de comprobar su estado | `20261028193842_ambulancia_despacho_bitacora.sql` |
| Lote de inventario | El trigger del movimiento hace un único `UPDATE … WHERE cantidad_actual + delta >= 0`; además la columna tiene `CHECK (cantidad_actual >= 0)` | `20261024172312_inventario_lotes_activos_proveedores.sql` |

Las mismas reglas se prueban también dentro de la base con dos conexiones reales (pgTAP, `supabase/tests/database/`
`07_camas.test.sql` y `08_ambulancia.test.sql`). Esta prueba añade el recorrido completo: HTTP → Express → Prisma →
PostgreSQL, con el pool de conexiones de la API de por medio.

## Cómo ejecutarla

Necesita Supabase local con el seed y la API apuntando a esa base.

```bash
supabase start                      # base local con migraciones y seed
supabase status -o env              # de aquí salen DB_URL, API_URL, ANON_KEY y SERVICE_ROLE_KEY
```

Levanta la API contra la base local (en otra terminal), con los valores de `supabase status`:

```bash
PORT=3100 DATABASE_URL=<DB_URL> DIRECT_URL=<DB_URL> SUPABASE_URL=<API_URL> SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> npm run dev
```

Y corre la prueba:

```bash
API_URL=http://localhost:3100 SUPABASE_URL=<API_URL> SUPABASE_ANON_KEY=<ANON_KEY> npm run test:concurrencia
```

Opciones:

| Opción | Para qué |
|---|---|
| `--n=50` (o `CONCURRENCIA_N`) | Solicitudes simultáneas por escenario. Por defecto 20; entre 2 y 100 |
| `--reporte=ruta.md` | Escribe la tabla de resultados en Markdown (es lo que el CI publica) |
| `--remoto` | Permite un entorno que no sea `localhost`. **No lo uses contra el proyecto remoto de la demo** |

Sin `--remoto` el script se niega a correr si `API_URL` o `SUPABASE_URL` no son locales, porque escribe en la base.

### Qué deja en la base

Al terminar da el alta a los pacientes que ingresó y devuelve sus camas a `disponible`, cierra el servicio de
ambulancia, cancela las solicitudes que no ganaron y vacía el lote con un ajuste. Por eso se puede repetir sin
reiniciar la base. Quedan:

- hasta N pacientes de prueba con apellido `Concurrencia` (se reutilizan en la siguiente corrida);
- el ítem `CONC-0001`, desactivado, con un lote en 0 por corrida;
- el historial de lo ocurrido (hospitalizaciones con alta, solicitudes finalizadas o canceladas y su bitácora,
  movimientos de inventario).

`supabase db reset` lo borra todo.

## Resultados

Corridas del 13 de noviembre de 2026 contra Supabase local (PostgreSQL 17, CLI 2.117.0) con el seed recién
aplicado: 17 camas, de ellas 15 libres (11 semiprivadas), y la ambulancia disponible.

### N = 20

| Escenario | Simultáneas | Éxitos | Rechazos | Duración | Resultado |
|---|---|---|---|---|---|
| Camas: 20 pacientes distintos piden la misma cama | 20 | 1 (esperados 1) | 19 × `409 CAMA_OCUPADA` | 114 ms | ✅ |
| Camas: el mismo paciente pide 15 camas distintas a la vez | 15 | 1 (esperados 1) | 14 × `409 PACIENTE_YA_HOSPITALIZADO` | 68 ms | ✅ |
| Camas: 20 pacientes piden cama semiprivada con 11 libres (asignación automática) | 20 | 11 (esperados 11) | 9 × `409 SIN_CAMAS_DISPONIBLES` | 117 ms | ✅ |
| Ambulancia: 20 solicitudes distintas se despachan a la vez | 20 | 1 (esperados 1) | 19 × `409 AMBULANCIA_NO_DISPONIBLE` | 92 ms | ✅ |
| Ambulancia: la misma solicitud se despacha 20 veces a la vez (doble clic) | 20 | 1 (esperados 1) | 19 × `409 AMBULANCIA_NO_DISPONIBLE` | 88 ms | ✅ |
| Inventario: 20 salidas de 3 unidades del mismo lote con 50 en existencia | 20 | 16 (esperados 16) | 4 × `409 STOCK_INSUFICIENTE` | 374 ms | ✅ |

En el escenario 6 el lote quedó con 2 unidades (50 − 16 × 3) y el `stock_actual` del ítem coincidió.

### N = 50

| Escenario | Simultáneas | Éxitos | Rechazos | Duración | Resultado |
|---|---|---|---|---|---|
| Camas: 50 pacientes distintos piden la misma cama | 50 | 1 (esperados 1) | 49 × `409 CAMA_OCUPADA` | 416 ms | ✅ |
| Camas: el mismo paciente pide 15 camas distintas a la vez | 15 | 1 (esperados 1) | 14 × `409 PACIENTE_YA_HOSPITALIZADO` | 97 ms | ✅ |
| Camas: 50 pacientes piden cama semiprivada con 11 libres (asignación automática) | 50 | 11 (esperados 11) | 39 × `409 SIN_CAMAS_DISPONIBLES` | 266 ms | ✅ |
| Ambulancia: 50 solicitudes distintas se despachan a la vez | 50 | 1 (esperados 1) | 49 × `409 AMBULANCIA_NO_DISPONIBLE` | 215 ms | ✅ |
| Ambulancia: la misma solicitud se despacha 50 veces a la vez (doble clic) | 50 | 1 (esperados 1) | 49 × `409 AMBULANCIA_NO_DISPONIBLE` | 298 ms | ✅ |
| Inventario: 50 salidas de 3 unidades del mismo lote con 122 en existencia | 50 | 40 (esperados 40) | 10 × `409 STOCK_INSUFICIENTE` | 850 ms | ✅ |

### Conclusión

En las dos corridas (y en una tercera repetición con N = 20 sin reiniciar la base) pasaron los 6 escenarios: no
hubo sobrecupo de camas, doble despacho de la ambulancia ni stock negativo, y ninguna petición terminó en un
error inesperado. Cada rechazo llegó con el código de negocio que los clientes ya manejan.

Para repetirlo en la defensa basta con `npm run test:concurrencia`; la salida en consola muestra, por escenario,
cuántas solicitudes se lanzaron, cuántas ganaron y con qué código se rechazó cada una de las demás.
