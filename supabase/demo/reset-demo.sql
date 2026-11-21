-- =============================================================================
-- HUNI-93: borra los datos de operación para volver a cargar el seed desde cero antes de la defensa.
--
-- No lo corras a mano: úsalo con `npm run demo:reset` (supabase/demo/reset-demo.mjs), que lo ejecuta en la
-- MISMA transacción que supabase/seed.sql y la contraseña demo. Si algo falla no queda nada a medias.
--
-- Qué borra:
--   citas, turnos, asistencia, consultas (con diagnósticos, recetas y laboratorio), hospitalizaciones y
--   movimientos de cama, ambulancia (solicitudes y bitácora), solicitudes de atención, avisos e inventario
--   completo (proveedores, ítems, lotes, movimientos y equipos), y los pacientes y el personal demo o sin cuenta.
-- Qué conserva:
--   el esquema, habitaciones y camas (las deja disponibles), la ambulancia (la deja disponible), los catálogos
--   (especialidades, exámenes, tipos de personal, áreas), todas las cuentas de Auth y los pacientes o el personal
--   ligados a cuentas que no son demo (p. ej. las del equipo), sin sus citas ni su historial.
--
-- TRUNCATE no dispara los triggers por fila, así que no lo frenan las reglas que protegen el historial
-- (consultas cerradas, turnos pasados): por eso este script es solo para el reinicio del demo.
-- Los archivos de resultados de laboratorio en Storage no se borran (quedan huérfanos y no se muestran).
-- =============================================================================

-- La ambulancia vuelve a disponible ANTES de vaciar la bitácora (su trigger anota el cambio de estado).
update public.ambulancias set estado = 'disponible' where estado <> 'disponible';

-- Operación clínica y administrativa. Se nombran todas las tablas para que el borrado no dependa de CASCADE.
truncate table
  public.resultados_laboratorio,
  public.orden_examenes,
  public.ordenes_laboratorio,
  public.receta_detalles,
  public.recetas,
  public.diagnosticos,
  public.consultas,
  public.citas,
  public.conexiones_app_personal,
  public.turnos_personal,
  public.movimientos_cama,
  public.hospitalizaciones,
  public.bitacora_ambulancia,
  public.solicitudes_ambulancia,
  public.solicitudes_atencion,
  public.avisos,
  public.movimientos_inventario,
  public.activos,
  public.lotes_inventario,
  public.inventario_items,
  public.proveedores
restrict;

-- Camas libres (al vaciar hospitalizaciones quedaron ocupadas o en limpieza)
update public.camas set estado = 'disponible' where estado <> 'disponible';

-- Pacientes y personal: se borran los demo y los que no tienen cuenta (registrados al probar).
-- DELETE y no TRUNCATE: si alguna tabla nueva los referencia con RESTRICT, el reinicio falla entero.
delete from public.expedientes e
using public.pacientes pa
where pa.id = e.paciente_id
  and (pa.perfil_id is null or pa.perfil_id::text like '11111111-1111-4111-8111-%');

delete from public.pacientes
where perfil_id is null or perfil_id::text like '11111111-1111-4111-8111-%';

delete from public.personal
where perfil_id is null or perfil_id::text like '11111111-1111-4111-8111-%';

-- Cuentas demo activas otra vez (alguien pudo desactivarlas o bloquearlas al probar)
update public.perfiles set activo = true
where id::text like '11111111-1111-4111-8111-%' and not activo;

update auth.users set banned_until = null
where id::text like '11111111-1111-4111-8111-%' and banned_until is not null;

-- Las áreas que usan los turnos del seed tienen que estar activas
update public.areas_hospital set activo = true
where nombre in ('Consulta externa', 'Pediatría', 'Emergencia', 'Alergología', 'Hospitalización', 'Recepción')
  and not activo;
