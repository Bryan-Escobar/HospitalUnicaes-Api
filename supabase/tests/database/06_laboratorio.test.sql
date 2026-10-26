-- HUNI-62: máquina de estados del laboratorio, resultado obligatorio, estado derivado de la orden,
-- bucket privado de PDF y RLS + Realtime (quién recibe los cambios de estado).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Orden de prueba: consulta abierta de Carlos con el doctor demo (EMP-0002), 2 exámenes
insert into public.consultas (id, expediente_id, doctor_id, motivo_consulta)
select '77777777-7777-4777-8777-000000000001', e.id, d.id, 'Prueba HUNI-62'
from public.pacientes pa
join public.expedientes e on e.paciente_id = pa.id
join public.personal d on d.codigo_empleado = 'EMP-0002'
where pa.perfil_id = '11111111-1111-4111-8111-000000000004';

insert into public.ordenes_laboratorio (id, consulta_id)
values ('77777777-7777-4777-8777-000000000031', '77777777-7777-4777-8777-000000000001');

insert into public.orden_examenes (id, orden_id, examen_id)
select x.id::uuid, '77777777-7777-4777-8777-000000000031', ec.id
from (values ('77777777-7777-4777-8777-000000000041', 'Hemograma completo'),
             ('77777777-7777-4777-8777-000000000042', 'Creatinina')) as x (id, examen)
join public.examenes_catalogo ec on ec.nombre = x.examen;

-- ---------- Transiciones ----------
select throws_ok(
  $$ insert into public.orden_examenes (orden_id, examen_id, estado)
     select '77777777-7777-4777-8777-000000000031', id, 'completado' from public.examenes_catalogo where nombre = 'Glucosa en ayunas' $$,
  'PT422', 'TRANSICION_INVALIDA: un examen nuevo empieza en pendiente',
  'un examen nuevo no puede nacer en otro estado'
);
select throws_like(
  $$ update public.orden_examenes set estado = 'completado' where id = '77777777-7777-4777-8777-000000000041' $$,
  'TRANSICION_INVALIDA: un examen no pasa de pendiente a completado%',
  'pendiente → completado (saltándose en_proceso) → TRANSICION_INVALIDA'
);
select throws_like(
  $$ insert into public.resultados_laboratorio (orden_examen_id, valor) values ('77777777-7777-4777-8777-000000000041', '13') $$,
  'TRANSICION_INVALIDA: el examen está pendiente%',
  'no se registra resultado de un examen pendiente'
);
select lives_ok(
  $$ update public.orden_examenes set estado = 'en_proceso' where id = '77777777-7777-4777-8777-000000000041' $$,
  'pendiente → en_proceso'
);
select ok(
  (select fecha_inicio from public.orden_examenes where id = '77777777-7777-4777-8777-000000000041') is not null,
  'al iniciar se guarda fecha_inicio'
);
select is((select estado::text from public.ordenes_laboratorio where id = '77777777-7777-4777-8777-000000000031'),
  'en_proceso', 'la orden pasa a en_proceso cuando un examen empieza');
select throws_ok(
  $$ update public.orden_examenes set estado = 'pendiente' where id = '77777777-7777-4777-8777-000000000041' $$,
  'PT422', null, 'en_proceso → pendiente (hacia atrás) → TRANSICION_INVALIDA'
);
select throws_ok(
  $$ update public.orden_examenes set estado = 'completado' where id = '77777777-7777-4777-8777-000000000041' $$,
  'PT422', 'RESULTADO_REQUERIDO: para completar el examen registra su resultado (valor y/o archivo)',
  'en_proceso → completado sin resultado → RESULTADO_REQUERIDO'
);
select throws_ok(
  $$ insert into public.resultados_laboratorio (orden_examen_id, valor, archivo_url)
     values ('77777777-7777-4777-8777-000000000041', '  ', null) $$,
  '23514', null, 'el resultado necesita valor o archivo'
);
select lives_ok(
  $$ insert into public.resultados_laboratorio (orden_examen_id, archivo_url)
     values ('77777777-7777-4777-8777-000000000041', '77777777-7777-4777-8777-000000000031/77777777-7777-4777-8777-000000000041.pdf') $$,
  'un resultado puede ser solo el PDF'
);
select lives_ok(
  $$ update public.orden_examenes set estado = 'completado' where id = '77777777-7777-4777-8777-000000000041' $$,
  'en_proceso → completado con resultado'
);
select ok(
  (select fecha_completado from public.orden_examenes where id = '77777777-7777-4777-8777-000000000041') is not null,
  'al completar se guarda fecha_completado'
);
select throws_like(
  $$ update public.orden_examenes set estado = 'en_proceso' where id = '77777777-7777-4777-8777-000000000041' $$,
  'TRANSICION_INVALIDA%', 'completado es definitivo'
);
select throws_like(
  $$ update public.resultados_laboratorio set valor = 'otro' where orden_examen_id = '77777777-7777-4777-8777-000000000041' $$,
  'TRANSICION_INVALIDA: el examen ya está completado%', 'el resultado de un examen completado no se modifica'
);
select is((select estado::text from public.ordenes_laboratorio where id = '77777777-7777-4777-8777-000000000031'),
  'en_proceso', 'con un examen aún pendiente, la orden sigue en_proceso');

update public.orden_examenes set estado = 'en_proceso' where id = '77777777-7777-4777-8777-000000000042';
insert into public.resultados_laboratorio (orden_examen_id, valor, unidad) values ('77777777-7777-4777-8777-000000000042', '0.9', 'mg/dL');
update public.orden_examenes set estado = 'completado' where id = '77777777-7777-4777-8777-000000000042';
select is((select estado::text from public.ordenes_laboratorio where id = '77777777-7777-4777-8777-000000000031'),
  'completado', 'la orden queda completada cuando todos sus exámenes lo están');

-- ---------- Storage y Realtime ----------
select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'resultados-laboratorio' $$,
  $$ values (false, 10485760::bigint, array['application/pdf']::text[]) $$,
  'bucket privado, solo PDF y hasta 10 MB'
);
select set_has(
  $$ select tablename::text from pg_publication_tables where pubname = 'supabase_realtime' $$,
  $$ values ('orden_examenes'), ('ordenes_laboratorio') $$,
  'los cambios de estado se publican por Realtime'
);
select set_hasnt(
  $$ select tablename::text from pg_publication_tables where pubname = 'supabase_realtime' $$,
  $$ values ('resultados_laboratorio') $$,
  'los valores de los resultados no viajan por Realtime'
);

-- ---------- RLS: quién recibe la orden (lectura y Realtime) ----------
select pg_temp.como('11111111-1111-4111-8111-000000000004');  -- paciente Carlos (dueño)
select is((select count(*)::int from public.orden_examenes where orden_id = '77777777-7777-4777-8777-000000000031'), 2,
  'el paciente ve los exámenes de su orden');
select pg_temp.como('11111111-1111-4111-8111-000000000007');  -- otra paciente
select is((select count(*)::int from public.ordenes_laboratorio where id = '77777777-7777-4777-8777-000000000031'), 0,
  'otra paciente no ve la orden');
select pg_temp.como('11111111-1111-4111-8111-000000000002');  -- doctor tratante (registró la consulta)
select is((select count(*)::int from public.ordenes_laboratorio where id = '77777777-7777-4777-8777-000000000031'), 1,
  'el médico tratante ve la orden');
select pg_temp.como('11111111-1111-4111-8111-000000000005');  -- doctora de pediatría: en el seed solo atiende a Daniela
select is((select count(*)::int from public.ordenes_laboratorio where id = '77777777-7777-4777-8777-000000000031'), 0,
  'un doctor que no atiende al paciente no ve la orden');
select pg_temp.como('11111111-1111-4111-8111-000000000003');  -- recepción (procesa los exámenes)
select is((select count(*)::int from public.orden_examenes where orden_id = '77777777-7777-4777-8777-000000000031'), 2,
  'recepción ve los exámenes que procesa');
select is((select count(*)::int from public.resultados_laboratorio), 0,
  'nadie lee resultados directo desde Supabase (los entrega la API)');
reset role;

select * from finish();
rollback;
