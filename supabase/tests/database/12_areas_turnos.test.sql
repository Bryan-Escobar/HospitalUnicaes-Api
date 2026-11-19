-- HUNI-102: el área del turno sale del catálogo `areas_hospital`, no de texto libre.
-- Cada bloque corre "como" un usuario demo del seed (mismo patrón que 04_turnos_citas.test.sql).
-- Fechas en 2030 para no chocar con la agenda del seed.
--
--   001 administrador · 003 recepcionista · 004 paciente Carlos
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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
  perform set_config('t.maria',   (select id::text from public.personal where codigo_empleado = 'EMP-0004'), true);
end $$;

-- ============================================================================
-- Catálogo inicial
-- ============================================================================
select has_table('public', 'areas_hospital', 'existe el catálogo areas_hospital');
select set_has(
  $$ select nombre from public.areas_hospital where activo $$,
  $$ values ('Consulta externa'), ('Emergencia'), ('Recepción'), ('Pediatría'), ('Alergología'), ('Hospitalización') $$,
  'el catálogo trae activas las áreas que usan los turnos del seed'
);
select is(
  (select count(*)::int from public.turnos_personal t
    where not exists (select 1 from public.areas_hospital a where a.nombre = t.area)),
  0, 'todos los turnos del seed tienen un área del catálogo'
);
select throws_ok(
  $$ insert into public.areas_hospital (nombre) values ('EMERGENCIA') $$,
  '23505', null, 'no se repite un área con otras mayúsculas'
);
select throws_ok(
  $$ insert into public.areas_hospital (nombre) values (' Farmacia ') $$,
  '23514', null, 'el nombre del área no lleva espacios al inicio ni al final'
);

-- ============================================================================
-- El área del turno debe ser una activa del catálogo
-- ============================================================================
select lives_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     values (current_setting('t.roberto')::uuid, 'Consulta externa', '2030-05-06', '07:00', '15:00', 'manana') $$,
  'un turno con un área del catálogo se guarda'
);
select throws_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     values (current_setting('t.roberto')::uuid, 'Urgencias', '2030-05-07', '07:00', '15:00', 'manana') $$,
  'PT422', 'AREA_INVALIDA: el área "Urgencias" no está en el catálogo de áreas activas; elige una de la lista',
  'un área que no está en el catálogo → AREA_INVALIDA'
);
select throws_like(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     values (current_setting('t.roberto')::uuid, '   ', '2030-05-07', '07:00', '15:00', 'manana') $$,
  'AREA_INVALIDA%', 'un área en blanco tampoco se guarda'
);
insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
values (current_setting('t.roberto')::uuid, '  emergencia ', '2030-05-08', '07:00', '15:00', 'manana');
select is(
  (select area from public.turnos_personal where personal_id = current_setting('t.roberto')::uuid and fecha = '2030-05-08'),
  'Emergencia', 'se guarda el nombre del catálogo (sin espacios y con sus mayúsculas)'
);
select throws_like(
  $$ update public.turnos_personal set area = 'Urgencias'
     where personal_id = current_setting('t.roberto')::uuid and fecha = '2030-05-06' $$,
  'AREA_INVALIDA%', 'ajustar un turno a un área fuera del catálogo también se rechaza'
);

-- Un área desactivada ya no se acepta en turnos nuevos
update public.areas_hospital set activo = false where nombre = 'Laboratorio';
select throws_like(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     values (current_setting('t.maria')::uuid, 'Laboratorio', '2030-05-06', '07:00', '15:00', 'manana') $$,
  'AREA_INVALIDA%', 'un área desactivada no se acepta'
);

-- ============================================================================
-- Turnos anteriores al catálogo: se conservan y se ajustan sin cambiar el área
-- ============================================================================
alter table public.turnos_personal disable trigger turnos_personal_validar_area;
insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
values (current_setting('t.maria')::uuid, 'Sala vieja', '2030-05-09', '07:00', '15:00', 'manana');
alter table public.turnos_personal enable trigger turnos_personal_validar_area;

select lives_ok(
  $$ update public.turnos_personal set hora_fin = '14:00'
     where personal_id = current_setting('t.maria')::uuid and fecha = '2030-05-09' $$,
  'un turno con un área fuera del catálogo se ajusta si no se cambia el área'
);
select lives_ok(
  $$ update public.turnos_personal set area = 'Sala vieja', hora_fin = '13:00'
     where personal_id = current_setting('t.maria')::uuid and fecha = '2030-05-09' $$,
  'reenviar la misma área (como hace un cliente con el formulario completo) no la revalida'
);
select throws_like(
  $$ update public.turnos_personal set area = 'Otra sala'
     where personal_id = current_setting('t.maria')::uuid and fecha = '2030-05-09' $$,
  'AREA_INVALIDA%', 'cambiarle el área exige una del catálogo'
);
select lives_ok(
  $$ update public.turnos_personal set area = 'Hospitalización'
     where personal_id = current_setting('t.maria')::uuid and fecha = '2030-05-09' $$,
  'el turno viejo se corrige eligiendo un área del catálogo'
);

-- ============================================================================
-- Renombrar un área actualiza los turnos futuros y conserva el histórico.
-- ============================================================================
insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
values (current_setting('t.maria')::uuid, 'Alergología', '2030-05-10', '07:00', '15:00', 'manana');
insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
values (current_setting('t.maria')::uuid, 'Alergología', '2000-01-01', '07:00', '15:00', 'manana');
update public.areas_hospital set activo = false where nombre = 'Alergología';
select lives_ok(
  $$ update public.areas_hospital set nombre = 'Alergología e inmunología' where nombre = 'Alergología' $$,
  'se renombra un área (aunque esté desactivada)'
);
select is(
  (select area from public.turnos_personal where personal_id = current_setting('t.maria')::uuid and fecha = '2030-05-10'),
  'Alergología e inmunología', 'sus turnos quedan con el nombre nuevo'
);
select is(
  (select area from public.turnos_personal where personal_id = current_setting('t.maria')::uuid and fecha = '2000-01-01'),
  'Alergología', 'el turno histórico conserva el nombre original'
);

-- ============================================================================
-- RLS
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000003');  -- recepcionista
select ok((select count(*) from public.areas_hospital) > 0, 'recepcionista: lee las áreas');
select is((select count(*)::int from public.areas_hospital where not activo), 0,
  'recepcionista: solo ve las áreas activas');
select throws_ok(
  $$ insert into public.areas_hospital (nombre) values ('Farmacia') $$,
  '42501', null, 'recepcionista: no agrega áreas'
);
update public.areas_hospital set activo = false where nombre = 'Emergencia';
select throws_like(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     values (current_setting('t.maria')::uuid, 'Urgencias', '2030-05-11', '07:00', '15:00', 'manana') $$,
  'AREA_INVALIDA%', 'recepcionista: no registra un turno con un área inventada'
);

select pg_temp.como('11111111-1111-4111-8111-000000000004');  -- paciente
select ok((select count(*) from public.areas_hospital) > 0, 'paciente: lee las áreas activas (catálogo)');

select pg_temp.como('11111111-1111-4111-8111-000000000001');  -- administrador
select ok(exists (select 1 from public.areas_hospital where not activo), 'administrador: ve también las desactivadas');
select is((select activo from public.areas_hospital where nombre = 'Emergencia'), true,
  'recepcionista: no desactiva áreas (RLS no le deja ver la fila para editarla)');
select lives_ok(
  $$ insert into public.areas_hospital (nombre, orden) values ('Farmacia', 110) $$,
  'administrador: agrega un área'
);
select lives_ok(
  $$ update public.areas_hospital set activo = true where nombre = 'Laboratorio' $$,
  'administrador: reactiva un área'
);
select throws_ok(
  $$ delete from public.areas_hospital where nombre = 'Farmacia' $$,
  '42501', null, 'administrador: no borra áreas (se desactivan)'
);

select pg_temp.como('11111111-1111-4111-8111-000000000003');  -- recepcionista
select lives_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     values (current_setting('t.maria')::uuid, 'Farmacia', '2030-05-11', '07:00', '15:00', 'manana') $$,
  'recepcionista: usa en seguida el área que agregó el administrador'
);

select pg_temp.como_anonimo();
select throws_ok($$ select * from public.areas_hospital $$, '42501', null, 'sin sesión: no lee el catálogo');

select * from finish();
rollback;
