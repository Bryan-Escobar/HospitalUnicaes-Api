-- HUNI-56: solicitudes de cita (paciente pide, recepción aprueba o rechaza).
-- Usuarios del seed: 001 administrador · 002 doctor Roberto (EMP-0002) · 003 recepcionista ·
-- 004 paciente Carlos · 007 paciente Ana Sofía. Fechas en 2030 para no chocar con la agenda del seed.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.como_anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create function pg_temp.como_backend() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

do $$
begin
  perform set_config('t.roberto', (select id::text from public.personal where codigo_empleado = 'EMP-0002'), true);
  perform set_config('t.carlos', (select id::text from public.pacientes where perfil_id = '11111111-1111-4111-8111-000000000004'), true);
end $$;

insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
values (current_setting('t.roberto')::uuid, 'Consulta externa', '2030-05-06', '08:00', '12:00', 'manana');

-- ============================================================================
-- Paciente: crea y ve solo las suyas
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000004');  -- Carlos

select lives_ok(
  $$ select public.solicitar_cita('Dolor de cabeza', 'Medicina general', '2030-05-06', 'manana') $$,
  'paciente: solicita una cita'
);
select is(
  (select estado::text from public.solicitudes_cita where motivo = 'Dolor de cabeza'),
  'pendiente', 'la solicitud nace pendiente'
);
select is(
  (select paciente_id from public.solicitudes_cita where motivo = 'Dolor de cabeza'),
  current_setting('t.carlos')::uuid, 'la solicitud queda a nombre del paciente de la sesión'
);
select throws_like(
  $$ select public.solicitar_cita('   ', 'Medicina general') $$,
  'SOLICITUD_INVALIDA%', 'motivo vacío → SOLICITUD_INVALIDA'
);
select throws_like(
  $$ select public.solicitar_cita('Dolor', 'Medicina general', null, 'noche') $$,
  'SOLICITUD_INVALIDA%', 'franja inválida → SOLICITUD_INVALIDA'
);
select throws_ok(
  $$ insert into public.solicitudes_cita (paciente_id, motivo, especialidad)
     values (current_setting('t.carlos')::uuid, 'directo', 'X') $$,
  '42501', null, 'paciente: no inserta directo en la tabla'
);
select throws_like(
  $$ select public.aprobar_solicitud_cita(
       (select id from public.solicitudes_cita limit 1), current_setting('t.roberto')::uuid, '2030-05-06 09:00-06') $$,
  'ACCESO_DENEGADO%', 'paciente: no aprueba solicitudes'
);
select throws_like(
  $$ select public.crear_cita(current_setting('t.carlos')::uuid, current_setting('t.roberto')::uuid, '2030-05-06 10:00-06') $$,
  'ACCESO_DENEGADO%', 'paciente: tampoco crea citas'
);

select pg_temp.como('11111111-1111-4111-8111-000000000007');  -- Ana
select is((select count(*)::int from public.solicitudes_cita), 0, 'otro paciente: no ve solicitudes ajenas');
select is((select count(*)::int from public.v_solicitudes_cita), 0, 'otro paciente: no las ve en la vista');
select throws_like(
  $$ select public.cancelar_solicitud_cita((select id from public.v_solicitudes_cita limit 1)) $$,
  'NO_ENCONTRADO%', 'otro paciente: no cancela solicitudes ajenas'
);

select pg_temp.como_anonimo();
select throws_ok($$ select count(*) from public.solicitudes_cita $$, '42501', null, 'anon: no lee la tabla');
select throws_ok($$ select public.solicitar_cita('x', 'y') $$, '42501', null, 'anon: no solicita');

-- ============================================================================
-- Recepción: ve todas, aprueba (crea cita programada) y rechaza
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000004');
select public.solicitar_cita('Control', 'Medicina general', null, 'cualquiera');
select public.solicitar_cita('Revisión', 'Alergista');

select pg_temp.como('11111111-1111-4111-8111-000000000003');  -- recepcionista
select is((select count(*)::int from public.v_solicitudes_cita where estado = 'pendiente'), 3, 'recepción: ve las pendientes de todos');

select lives_ok(
  $$ select public.aprobar_solicitud_cita(
       (select id from public.solicitudes_cita where motivo = 'Dolor de cabeza'),
       current_setting('t.roberto')::uuid, '2030-05-06 09:00-06') $$,
  'recepción: aprueba una solicitud'
);
select is(
  (select estado::text from public.solicitudes_cita where motivo = 'Dolor de cabeza'),
  'aprobada', 'la solicitud queda aprobada'
);
select is(
  (select c.estado::text from public.solicitudes_cita s join public.citas c on c.id = s.cita_id where s.motivo = 'Dolor de cabeza'),
  'programada', 'aprobar crea la cita en estado programada'
);
select throws_like(
  $$ select public.aprobar_solicitud_cita(
       (select id from public.solicitudes_cita where motivo = 'Dolor de cabeza'),
       current_setting('t.roberto')::uuid, '2030-05-06 10:00-06') $$,
  'SOLICITUD_YA_RESUELTA%', 'no se aprueba dos veces'
);
select throws_like(
  $$ select public.aprobar_solicitud_cita(
       (select id from public.solicitudes_cita where motivo = 'Control'),
       current_setting('t.roberto')::uuid, '2030-05-06 09:00-06') $$,
  'CITA_DUPLICADA%', 'si el horario está ocupado no se aprueba y sigue pendiente'
);
select lives_ok(
  $$ select public.rechazar_solicitud_cita((select id from public.solicitudes_cita where motivo = 'Control'), 'Sin agenda esta semana') $$,
  'recepción: rechaza una solicitud con respuesta'
);
select throws_like(
  $$ select public.rechazar_solicitud_cita((select id from public.solicitudes_cita where motivo = 'Revisión'), '') $$,
  'SOLICITUD_INVALIDA%', 'rechazar exige respuesta'
);

-- ============================================================================
-- El paciente ve el resultado y puede cancelar mientras está pendiente
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000004');
select is(
  (select respuesta from public.v_solicitudes_cita where motivo = 'Control'),
  'Sin agenda esta semana', 'paciente: ve la respuesta de recepción'
);
select lives_ok(
  $$ select public.cancelar_solicitud_cita((select id from public.solicitudes_cita where motivo = 'Revisión')) $$,
  'paciente: cancela su solicitud pendiente'
);
select throws_like(
  $$ select public.cancelar_solicitud_cita((select id from public.solicitudes_cita where motivo = 'Control')) $$,
  'SOLICITUD_YA_RESUELTA%', 'paciente: no cancela una ya resuelta'
);

select * from finish();
rollback;
