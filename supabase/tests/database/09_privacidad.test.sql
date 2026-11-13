-- HUNI-74: políticas RLS de privacidad y estado público (context.md §3.4).
-- Cada bloque corre "como" un usuario demo del seed (JWT simulado con request.jwt.claims, igual que PostgREST).
--
--   Paciente A: Carlos (004). Paciente B: "Privada Prueba", sin cuenta, creada aquí con expediente, consulta,
--   diagnóstico, receta, orden de laboratorio y cama. Su único médico tratante es Roberto (002, EMP-0002);
--   Gabriela (005, EMP-0005) no la atiende. 001 administrador · 003 recepcionista.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.como_anonimo() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create function pg_temp.como_backend() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Filas visibles de una tabla del paciente B para la sesión actual
create function pg_temp.visibles(p_sql text) returns int language plpgsql as $$
declare
  n int;
begin
  execute p_sql into n;
  return n;
end $$;

-- ============================================================================
-- Datos de prueba (como backend)
-- ============================================================================
insert into public.pacientes (id, nombres, apellidos, sexo, telefono)
values ('77777777-7777-4777-8777-000000000001', 'Privada', 'Prueba Confidencial', 'femenino', '+503 7999-0001');

insert into public.expedientes (id, paciente_id, numero_expediente, alergias)
values ('77777777-7777-4777-8777-000000000002', '77777777-7777-4777-8777-000000000001', 'EXP-PRIV-0001', 'Penicilina');

insert into public.consultas (id, expediente_id, doctor_id, motivo_consulta)
select '77777777-7777-4777-8777-000000000003', '77777777-7777-4777-8777-000000000002', id, 'Prueba HUNI-74'
from public.personal where codigo_empleado = 'EMP-0002';

insert into public.diagnosticos (id, consulta_id, descripcion)
values ('77777777-7777-4777-8777-000000000004', '77777777-7777-4777-8777-000000000003', 'Diagnóstico confidencial');

insert into public.recetas (id, consulta_id)
values ('77777777-7777-4777-8777-000000000005', '77777777-7777-4777-8777-000000000003');

insert into public.receta_detalles (id, receta_id, medicamento)
values ('77777777-7777-4777-8777-000000000006', '77777777-7777-4777-8777-000000000005', 'Medicamento confidencial');

insert into public.ordenes_laboratorio (id, consulta_id, registrado_por)
select '77777777-7777-4777-8777-000000000007', '77777777-7777-4777-8777-000000000003', id
from public.personal where codigo_empleado = 'EMP-0002';

insert into public.orden_examenes (id, orden_id, examen_id)
select '77777777-7777-4777-8777-000000000008', '77777777-7777-4777-8777-000000000007', id
from public.examenes_catalogo where activo order by nombre limit 1;

insert into public.hospitalizaciones (id, paciente_id, cama_id, doctor_tratante_id, motivo_ingreso)
select '77777777-7777-4777-8777-000000000009', '77777777-7777-4777-8777-000000000001', c.id, d.id, 'Prueba HUNI-74'
from public.camas c
join public.personal d on d.codigo_empleado = 'EMP-0002'
where c.estado = 'disponible'
  and not exists (select 1 from public.hospitalizaciones h where h.cama_id = c.id and h.fecha_alta is null)
order by c.codigo
limit 1;

-- Médico y enfermera de turno ahora mismo (personal sin cuenta, turno de 2 h alrededor de la hora local)
insert into public.personal (id, nombres, apellidos, tipo_personal_id, codigo_empleado)
select '77777777-7777-4777-8777-000000000011', 'Médico', 'De Turno Prueba', id, 'EMP-T-0001'
from public.tipos_personal where nombre = 'Doctor';
insert into public.personal (id, nombres, apellidos, tipo_personal_id, codigo_empleado)
select '77777777-7777-4777-8777-000000000012', 'Enfermera', 'De Turno Prueba', id, 'EMP-T-0002'
from public.tipos_personal where nombre = 'Enfermero/a';

insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
select p.id, 'Área de prueba',
       ((now() at time zone 'America/El_Salvador') - interval '1 hour')::date,
       ((now() at time zone 'America/El_Salvador') - interval '1 hour')::time(0),
       ((now() at time zone 'America/El_Salvador') + interval '1 hour')::time(0),
       'guardia'
from public.personal p where p.codigo_empleado in ('EMP-T-0001', 'EMP-T-0002');

-- Avisos: interno vigente, público vencido y público programado (ninguno es público y vigente)
insert into public.avisos (titulo, contenido, autor_id, es_publico, fecha_publicacion, fecha_expiracion) values
  ('Prueba interno vigente', 'Solo personal', '11111111-1111-4111-8111-000000000001', false, now() - interval '1 day', null),
  ('Prueba público vencido', 'Ya expiró', '11111111-1111-4111-8111-000000000001', true, now() - interval '10 days', now() - interval '1 day'),
  ('Prueba público programado', 'Aún no', '11111111-1111-4111-8111-000000000001', true, now() + interval '1 day', null);

select set_config('t.avisos_publicos_vigentes', (
  select count(*)::text from public.avisos
  where es_publico and fecha_publicacion <= now() and (fecha_expiracion is null or fecha_expiracion > now())
), true);
select set_config('t.avisos_vigentes', (
  select count(*)::text from public.avisos
  where fecha_publicacion <= now() and (fecha_expiracion is null or fecha_expiracion > now())
), true);
select set_config('t.avisos_total', (select count(*)::text from public.avisos), true);
select set_config('t.personal_total', (select count(*)::text from public.personal), true);

select is(
  (select count(*)::int from public.hospitalizaciones where id = '77777777-7777-4777-8777-000000000009'),
  1,
  'preparación: la paciente B quedó hospitalizada'
);

-- ============================================================================
-- 1. Anónimo: solo datos agregados
-- ============================================================================
select pg_temp.como_anonimo();

select throws_ok('select count(*) from public.pacientes', '42501', null, 'anónimo: no lee datos personales de pacientes');
select throws_ok('select count(*) from public.expedientes', '42501', null, 'anónimo: no lee expedientes');
select throws_ok('select count(*) from public.consultas', '42501', null, 'anónimo: no lee consultas');
select throws_ok('select count(*) from public.ordenes_laboratorio', '42501', null, 'anónimo: no lee laboratorio');
select throws_ok('select count(*) from public.hospitalizaciones', '42501', null, 'anónimo: no lee hospitalizaciones');
select throws_ok('select count(*) from public.camas', '42501', null, 'anónimo: no lee camas una por una');
select throws_ok('select count(*) from public.perfiles', '42501', null, 'anónimo: no lee cuentas');
select throws_ok('select count(*) from public.v_turnos', '42501', null, 'anónimo: no lee la vista de turnos con detalle');
select throws_ok(
  $$ insert into public.avisos (titulo, contenido, autor_id) values ('x', 'y', '11111111-1111-4111-8111-000000000001') $$,
  '42501', null, 'anónimo: no publica avisos'
);

select is(
  (select count(*)::int from public.avisos),
  current_setting('t.avisos_publicos_vigentes')::int,
  'anónimo: solo lee los avisos públicos y vigentes'
);

select set_config('t.estado', public.estado_publico()::text, true);

select is(
  (select array_agg(k order by k) from jsonb_object_keys(current_setting('t.estado')::jsonb) k),
  array['actualizado_en', 'avisos', 'medicos_de_turno', 'ocupacion'],
  'estado público: solo ocupación, médicos de turno, avisos y fecha'
);
select is(
  (current_setting('t.estado')::jsonb #>> '{ocupacion,total,total}')::int,
  17,
  'estado público: la ocupación cuenta las 17 camas'
);
select is(
  (current_setting('t.estado')::jsonb #>> '{ocupacion,vip,total}')::int
    + (current_setting('t.estado')::jsonb #>> '{ocupacion,semiprivada,total}')::int,
  17,
  'estado público: 5 VIP + 12 semiprivadas'
);
select ok(
  (current_setting('t.estado')::jsonb #>> '{ocupacion,total,ocupadas}')::int >= 1,
  'estado público: la hospitalización de la paciente B cuenta como cama ocupada'
);
select ok(
  current_setting('t.estado') !~* '(VIP|HAB)-\d{3}',
  'estado público: no menciona ninguna habitación ni cama'
);
select ok(
  current_setting('t.estado') !~ 'Privada|Confidencial|Martínez Rivas|Ramírez Cruz',
  'estado público: no trae nombres de pacientes'
);
select ok(
  current_setting('t.estado')::jsonb -> 'medicos_de_turno' @> '[{"apellidos": "De Turno Prueba", "tipo": "Doctor"}]',
  'estado público: incluye al médico que está de turno ahora'
);
select ok(
  not (current_setting('t.estado')::jsonb -> 'medicos_de_turno' @> '[{"nombres": "Enfermera"}]'),
  'estado público: no incluye personal que no es médico'
);
select is(
  (select count(*)::int from jsonb_array_elements(current_setting('t.estado')::jsonb -> 'medicos_de_turno') m
   where m ->> 'tipo' not in ('Doctor', 'Alergista', 'Médico de emergencia')),
  0,
  'estado público: todos los de la lista son de un tipo médico'
);
select is(
  jsonb_array_length(current_setting('t.estado')::jsonb -> 'avisos'),
  current_setting('t.avisos_publicos_vigentes')::int,
  'estado público: trae todos los avisos públicos vigentes'
);
select ok(
  current_setting('t.estado') !~ 'Prueba (interno vigente|público vencido|público programado)',
  'estado público: sin avisos internos, vencidos ni programados'
);

-- ============================================================================
-- 2. Paciente A (Carlos) no lee nada de la paciente B
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000004');

select is(pg_temp.visibles($$ select count(*)::int from public.pacientes $$), 1,
  'paciente A: en pacientes solo ve su propia ficha');
select is(pg_temp.visibles($$ select count(*)::int from public.pacientes where perfil_id = auth.uid() $$), 1,
  'paciente A: ve sus datos personales');
select is(pg_temp.visibles($$ select count(*)::int from public.pacientes where id = '77777777-7777-4777-8777-000000000001' $$), 0,
  'paciente A: no ve los datos personales de B');
select is(pg_temp.visibles($$ select count(*)::int from public.expedientes where paciente_id = '77777777-7777-4777-8777-000000000001' $$), 0,
  'paciente A: no ve el expediente de B');
select is(pg_temp.visibles($$ select count(*)::int from public.expedientes $$), 1,
  'paciente A: ve solo su propio expediente');
select is(pg_temp.visibles($$ select count(*)::int from public.consultas where id = '77777777-7777-4777-8777-000000000003' $$), 0,
  'paciente A: no ve las consultas de B');
select is(pg_temp.visibles($$ select count(*)::int from public.diagnosticos where id = '77777777-7777-4777-8777-000000000004' $$), 0,
  'paciente A: no ve los diagnósticos de B');
select is(pg_temp.visibles($$ select count(*)::int from public.recetas where id = '77777777-7777-4777-8777-000000000005' $$), 0,
  'paciente A: no ve las recetas de B');
select is(pg_temp.visibles($$ select count(*)::int from public.receta_detalles where id = '77777777-7777-4777-8777-000000000006' $$), 0,
  'paciente A: no ve los medicamentos recetados a B');
select is(pg_temp.visibles($$ select count(*)::int from public.ordenes_laboratorio where id = '77777777-7777-4777-8777-000000000007' $$), 0,
  'paciente A: no ve las órdenes de laboratorio de B');
select is(pg_temp.visibles($$ select count(*)::int from public.orden_examenes where id = '77777777-7777-4777-8777-000000000008' $$), 0,
  'paciente A: no ve los exámenes de B');
select is(pg_temp.visibles($$ select count(*)::int from public.resultados_laboratorio $$), 0,
  'paciente A: los resultados no se leen directo (solo por la API)');
select is(pg_temp.visibles($$ select count(*)::int from public.hospitalizaciones where id = '77777777-7777-4777-8777-000000000009' $$), 0,
  'paciente A: no ve la habitación asignada a B');
select is(pg_temp.visibles($$ select count(*)::int from public.perfiles $$), 1,
  'paciente A: en perfiles solo ve su cuenta');
select is(pg_temp.visibles($$ select count(*)::int from public.avisos where not es_publico $$), 0,
  'paciente A: no ve avisos internos');
select ok(pg_temp.visibles($$ select count(*)::int from public.especialidades $$) > 0,
  'paciente A: lee los catálogos');
select throws_ok(
  $$ update public.pacientes set telefono = '+503 7000-9999' where perfil_id = auth.uid() $$,
  '42501', null, 'paciente A: no edita su ficha directo (solo por la API)'
);
select throws_ok(
  $$ insert into public.diagnosticos (consulta_id, descripcion) values ('77777777-7777-4777-8777-000000000003', 'x') $$,
  '42501', null, 'paciente A: no escribe historial clínico directo'
);

-- ============================================================================
-- 3. Doctor tratante (Roberto) ve a su paciente; Gabriela, que no la atiende, no
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000002');

select is(pg_temp.visibles($$ select count(*)::int from public.pacientes where id = '77777777-7777-4777-8777-000000000001' $$), 1,
  'tratante: ve los datos personales de su paciente');
select is(pg_temp.visibles($$ select count(*)::int from public.expedientes where paciente_id = '77777777-7777-4777-8777-000000000001' $$), 1,
  'tratante: ve el expediente');
select is(pg_temp.visibles($$ select count(*)::int from public.consultas where id = '77777777-7777-4777-8777-000000000003' $$), 1,
  'tratante: ve la consulta');
select is(pg_temp.visibles($$ select (select count(*) from public.diagnosticos where id = '77777777-7777-4777-8777-000000000004')
                                    + (select count(*) from public.recetas where id = '77777777-7777-4777-8777-000000000005')
                                    + (select count(*) from public.receta_detalles where id = '77777777-7777-4777-8777-000000000006') $$), 3,
  'tratante: ve diagnósticos, recetas y medicamentos');
select is(pg_temp.visibles($$ select count(*)::int from public.ordenes_laboratorio where id = '77777777-7777-4777-8777-000000000007' $$), 1,
  'tratante: ve la orden de laboratorio');
select is(pg_temp.visibles($$ select count(*)::int from public.hospitalizaciones where id = '77777777-7777-4777-8777-000000000009' $$), 1,
  'tratante: ve la habitación asignada');
select is(pg_temp.visibles($$ select count(*)::int from public.personal $$), 1,
  'doctor: en personal solo ve su propio registro');
select ok(pg_temp.visibles($$ select count(*)::int from public.avisos where not es_publico $$) >= 1,
  'doctor: ve los avisos internos vigentes');

select pg_temp.como('11111111-1111-4111-8111-000000000005');

select is(pg_temp.visibles($$ select count(*)::int from public.pacientes where id = '77777777-7777-4777-8777-000000000001' $$), 0,
  'no tratante: no ve los datos personales');
select is(pg_temp.visibles($$ select count(*)::int from public.expedientes where paciente_id = '77777777-7777-4777-8777-000000000001' $$), 0,
  'no tratante: no ve el expediente');
select is(pg_temp.visibles($$ select (select count(*) from public.consultas where id = '77777777-7777-4777-8777-000000000003')
                                    + (select count(*) from public.diagnosticos where id = '77777777-7777-4777-8777-000000000004')
                                    + (select count(*) from public.recetas where id = '77777777-7777-4777-8777-000000000005') $$), 0,
  'no tratante: no ve consultas, diagnósticos ni recetas');
select is(pg_temp.visibles($$ select count(*)::int from public.ordenes_laboratorio where id = '77777777-7777-4777-8777-000000000007' $$), 0,
  'no tratante: no ve el laboratorio');
select is(pg_temp.visibles($$ select count(*)::int from public.hospitalizaciones where id = '77777777-7777-4777-8777-000000000009' $$), 0,
  'no tratante: no ve la habitación asignada');

-- ============================================================================
-- 4. Recepción: datos personales y cama sí; información clínica no
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000003');

select is(pg_temp.visibles($$ select count(*)::int from public.pacientes where id = '77777777-7777-4777-8777-000000000001' $$), 1,
  'recepción: ve los datos personales (registra e ingresa pacientes)');
select is(pg_temp.visibles($$ select count(*)::int from public.hospitalizaciones where id = '77777777-7777-4777-8777-000000000009' $$), 1,
  'recepción: ve la cama asignada (hace ingresos y altas)');
select is(pg_temp.visibles($$ select (select count(*) from public.expedientes where paciente_id = '77777777-7777-4777-8777-000000000001')
                                    + (select count(*) from public.consultas where id = '77777777-7777-4777-8777-000000000003')
                                    + (select count(*) from public.diagnosticos where id = '77777777-7777-4777-8777-000000000004')
                                    + (select count(*) from public.recetas where id = '77777777-7777-4777-8777-000000000005') $$), 0,
  'recepción: no ve expediente, consultas, diagnósticos ni recetas');
select is(pg_temp.visibles($$ select count(*)::int from public.personal $$), current_setting('t.personal_total')::int,
  'recepción: ve a todo el personal');

-- ============================================================================
-- 5. Administración: acceso completo de lectura
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000001');

select is(pg_temp.visibles($$ select count(*)::int from public.pacientes where id = '77777777-7777-4777-8777-000000000001' $$), 1,
  'administración: ve los datos personales');
select is(pg_temp.visibles($$ select count(*)::int from public.expedientes where paciente_id = '77777777-7777-4777-8777-000000000001' $$), 1,
  'administración: ve el expediente');
select is(pg_temp.visibles($$ select (select count(*) from public.consultas where id = '77777777-7777-4777-8777-000000000003')
                                    + (select count(*) from public.diagnosticos where id = '77777777-7777-4777-8777-000000000004')
                                    + (select count(*) from public.recetas where id = '77777777-7777-4777-8777-000000000005')
                                    + (select count(*) from public.receta_detalles where id = '77777777-7777-4777-8777-000000000006') $$), 4,
  'administración: ve todo el historial clínico');
select is(pg_temp.visibles($$ select (select count(*) from public.ordenes_laboratorio where id = '77777777-7777-4777-8777-000000000007')
                                    + (select count(*) from public.orden_examenes where id = '77777777-7777-4777-8777-000000000008') $$), 2,
  'administración: ve el laboratorio');
select is(pg_temp.visibles($$ select count(*)::int from public.hospitalizaciones where id = '77777777-7777-4777-8777-000000000009' $$), 1,
  'administración: ve la habitación asignada');
select is(pg_temp.visibles($$ select count(*)::int from public.avisos $$), current_setting('t.avisos_total')::int,
  'administración: ve todos los avisos (también vencidos y programados)');
select throws_ok(
  $$ delete from public.avisos where titulo = 'Prueba interno vigente' $$,
  '42501', null, 'administración: los avisos se gestionan desde la API, no directo'
);

-- Personal no administrador: avisos vigentes (públicos e internos), nunca vencidos ni programados
select pg_temp.como('11111111-1111-4111-8111-000000000003');
select is(pg_temp.visibles($$ select count(*)::int from public.avisos $$), current_setting('t.avisos_vigentes')::int,
  'recepción: ve los avisos vigentes, públicos e internos');

select pg_temp.como_backend();
select * from finish();
rollback;
