-- HUNI-37: reglas que la base de datos garantiza aunque la API falle.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Datos de prueba (se descartan con el rollback)
insert into public.pacientes (id, nombres, apellidos) values
  ('22222222-2222-4222-8222-000000000001', 'Paciente', 'Uno'),
  ('22222222-2222-4222-8222-000000000002', 'Paciente', 'Dos');
insert into public.expedientes (id, paciente_id, numero_expediente) values
  ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-000000000001', 'EXP-TEST-1');

-- ---------- Turnos sin solape ----------
insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
select id, 'Emergencia', '2026-11-10', '07:00', '15:00', 'manana' from public.personal where codigo_empleado = 'EMP-0004';

select throws_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     select id, 'Pediatría', '2026-11-10', '14:00', '22:00', 'tarde' from public.personal where codigo_empleado = 'EMP-0004' $$,
  '23P01', null, 'un empleado no puede tener dos turnos que se crucen'
);
select lives_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     select id, 'Emergencia', '2026-11-10', '15:00', '23:00', 'tarde' from public.personal where codigo_empleado = 'EMP-0004' $$,
  'un turno puede empezar justo cuando termina el anterior'
);
-- Turno nocturno: 22:00 → 06:00 termina al día siguiente
insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
select id, 'Emergencia', '2026-11-21', '05:00', '08:00', 'manana' from public.personal where codigo_empleado = 'EMP-0004';

select throws_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     select id, 'Emergencia', '2026-11-20', '22:00', '06:00', 'noche' from public.personal where codigo_empleado = 'EMP-0004' $$,
  '23P01', null, 'un turno nocturno (22:00–06:00) ocupa la madrugada del día siguiente'
);
select lives_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     select id, 'Emergencia', '2026-11-20', '22:00', '04:00', 'noche' from public.personal where codigo_empleado = 'EMP-0004' $$,
  'un turno nocturno que termina antes del siguiente turno sí se permite'
);
select lives_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     select id, 'Emergencia', '2026-11-10', '07:00', '15:00', 'manana' from public.personal where codigo_empleado = 'EMP-0002' $$,
  'otro empleado sí puede tener el mismo horario'
);
select throws_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     select id, 'Emergencia', '2026-11-12', '08:00', '08:00', 'manana' from public.personal where codigo_empleado = 'EMP-0002' $$,
  '23514', null, 'un turno no puede empezar y terminar a la misma hora'
);

-- ---------- Citas sin doble reserva ----------
insert into public.citas (paciente_id, doctor_id, fecha_hora, duracion_minutos)
select '22222222-2222-4222-8222-000000000001', id, '2026-11-10 10:00-06', 30 from public.personal where codigo_empleado = 'EMP-0002';

select throws_ok(
  $$ insert into public.citas (paciente_id, doctor_id, fecha_hora)
     select '22222222-2222-4222-8222-000000000002', id, '2026-11-10 10:15-06' from public.personal where codigo_empleado = 'EMP-0002' $$,
  '23P01', null, 'el doctor no puede tener dos citas que se crucen'
);
select throws_ok(
  $$ insert into public.citas (paciente_id, doctor_id, fecha_hora)
     select '22222222-2222-4222-8222-000000000001', id, '2026-11-10 10:20-06' from public.personal where codigo_empleado = 'EMP-0004' $$,
  '23P01', null, 'el paciente no puede tener dos citas que se crucen'
);
select lives_ok(
  $$ insert into public.citas (paciente_id, doctor_id, fecha_hora)
     select '22222222-2222-4222-8222-000000000002', id, '2026-11-10 10:30-06' from public.personal where codigo_empleado = 'EMP-0002' $$,
  'una cita puede empezar cuando termina la anterior'
);
select lives_ok(
  $$ update public.citas set estado = 'cancelada' where fecha_hora = '2026-11-10 10:00-06';
     insert into public.citas (paciente_id, doctor_id, fecha_hora)
     select '22222222-2222-4222-8222-000000000001', id, '2026-11-10 10:00-06' from public.personal where codigo_empleado = 'EMP-0002' $$,
  'una cita cancelada libera el horario'
);

-- ---------- Consultas cerradas ----------
insert into public.consultas (id, expediente_id, doctor_id, motivo_consulta)
select '44444444-4444-4444-8444-000000000001', '33333333-3333-4333-8333-000000000001', id, 'Control'
from public.personal where codigo_empleado = 'EMP-0002';

select lives_ok(
  $$ insert into public.diagnosticos (consulta_id, descripcion) values ('44444444-4444-4444-8444-000000000001', 'Sano') $$,
  'una consulta abierta acepta diagnósticos'
);
select lives_ok(
  $$ update public.consultas set cerrada_en = now() where id = '44444444-4444-4444-8444-000000000001' $$,
  'el doctor puede cerrar la consulta'
);
select throws_like(
  $$ update public.consultas set notas = 'cambio' where id = '44444444-4444-4444-8444-000000000001' $$,
  'CONSULTA_CERRADA%', 'una consulta cerrada no se edita'
);
select throws_like(
  $$ insert into public.diagnosticos (consulta_id, descripcion) values ('44444444-4444-4444-8444-000000000001', 'Otro') $$,
  'CONSULTA_CERRADA%', 'a una consulta cerrada no se le agregan diagnósticos'
);

-- ---------- Vista del dashboard ----------
select is((select count(*)::int from public.v_dashboard_summary), 1, 'v_dashboard_summary devuelve una sola fila');
select results_eq(
  $$ select vip_total, semiprivada_total, ambulancia_estado::text from public.v_dashboard_summary $$,
  $$ values (5, 12, 'disponible') $$,
  'el dashboard cuenta 5 camas VIP, 12 semiprivadas y la ambulancia disponible'
);

select * from finish();
rollback;
