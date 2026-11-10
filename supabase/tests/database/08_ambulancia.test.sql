-- HUNI-70: despacho de la única ambulancia y bitácora.
--   Parte 1 (concurrencia real): dos conexiones dblink despachan dos solicitudes distintas al mismo tiempo.
--   Esas conexiones confirman sus cambios, así que la parte 1 limpia todo al terminar.
--   Parte 2 (dentro de la transacción, se descarta): estados, cierre, cancelación, mantenimiento, bitácora y RLS.
--   dblink entra por la IP del servidor (ver 07_camas.test.sql).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(43);

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Solicitud pendiente registrada por recepción (Lucía)
create function pg_temp.solicitud(p_origen text) returns uuid language sql as $$
  insert into public.solicitudes_ambulancia (ambulancia_id, solicitada_por, direccion_origen, tipo_emergencia)
  select a.id, '11111111-1111-4111-8111-000000000003', p_origen, 'otra' from public.ambulancias a
  returning id
$$;

create function pg_temp.estado_ambulancia() returns text language sql as $$
  select estado::text from public.ambulancias limit 1
$$;

-- ============================================================================
-- Parte 1: dos despachos simultáneos → solo uno tiene éxito
-- ============================================================================
select set_config('t.conn', format('host=%s port=%s dbname=%s user=postgres password=postgres',
  host(inet_server_addr()), inet_server_port(), current_database()), true);

select extensions.dblink_connect('c0', current_setting('t.conn'));
select extensions.dblink_connect('c1', current_setting('t.conn'));
select extensions.dblink_connect('c2', current_setting('t.conn'));

select extensions.dblink_exec('c0', $$
  insert into public.solicitudes_ambulancia (id, ambulancia_id, solicitada_por, direccion_origen)
  select v.id, a.id, '11111111-1111-4111-8111-000000000003', v.origen
  from public.ambulancias a,
       (values ('99999999-9999-4999-8999-000000000071'::uuid, 'Prueba concurrencia 1'),
               ('99999999-9999-4999-8999-000000000072'::uuid, 'Prueba concurrencia 2')) as v (id, origen);
$$);

-- c1 despacha y sostiene la transacción 1.5 s; c2 despacha otra solicitud mientras tanto.
select extensions.dblink_send_query('c1',
  $$ select public.despachar_ambulancia('99999999-9999-4999-8999-000000000071')::text, pg_sleep(1.5) $$);
select pg_sleep(0.3);
select extensions.dblink_send_query('c2',
  $$ select public.despachar_ambulancia('99999999-9999-4999-8999-000000000072')::text $$);

create temp table r1 as select * from extensions.dblink_get_result('c1', false) as t(id text, s text);
select * from extensions.dblink_get_result('c1', false) as t(id text, s text);
create temp table r2 as select * from extensions.dblink_get_result('c2', false) as t(id text);
select set_config('t.error_c2', extensions.dblink_error_message('c2'), true);
select * from extensions.dblink_get_result('c2', false) as t(id text);

select is((select count(*)::int from r1), 1, 'concurrencia: el primer despacho gana');
select ok(
  (select count(*) from r2) = 0 and current_setting('t.error_c2') like '%AMBULANCIA_NO_DISPONIBLE%',
  'concurrencia: el segundo, que esperó el bloqueo, recibe AMBULANCIA_NO_DISPONIBLE'
);
select is(
  (select estado::text from public.solicitudes_ambulancia where id = '99999999-9999-4999-8999-000000000072'),
  'pendiente', 'concurrencia: la solicitud que perdió sigue pendiente'
);

-- Limpieza de lo que confirmaron las conexiones dblink
select extensions.dblink_exec('c0', $$
  select public.cerrar_servicio_ambulancia('99999999-9999-4999-8999-000000000071');
  delete from public.bitacora_ambulancia where solicitud_id::text like '99999999-9999-4999-8999-%';
  delete from public.solicitudes_ambulancia where id::text like '99999999-9999-4999-8999-%';
$$);
select extensions.dblink_disconnect('c0');
select extensions.dblink_disconnect('c1');
select extensions.dblink_disconnect('c2');

select is(pg_temp.estado_ambulancia(), 'disponible', 'tras la prueba de concurrencia la ambulancia vuelve a disponible');

-- ============================================================================
-- Parte 2: reglas
-- ============================================================================
select throws_ok(
  $$ insert into public.ambulancias (placa) values ('AMB-002') $$,
  '23505', null, 'existe exactamente una ambulancia (una segunda se rechaza)'
);
select throws_ok(
  $$ insert into public.solicitudes_ambulancia (ambulancia_id, solicitada_por)
     select id, '11111111-1111-4111-8111-000000000003' from public.ambulancias $$,
  '23514', null, 'una solicitud necesita dirección o coordenadas'
);
select throws_ok(
  $$ insert into public.solicitudes_ambulancia (ambulancia_id, canal, latitud, longitud)
     select id, 'publico', 13.99, -89.55 from public.ambulancias $$,
  '23514', null, 'una solicitud pública necesita su código de seguimiento'
);
select lives_ok(
  $$ insert into public.solicitudes_ambulancia (ambulancia_id, canal, latitud, longitud, codigo_seguimiento)
     select id, 'publico', 13.99, -89.55, 'prueba-codigo-publico' from public.ambulancias $$,
  'una solicitud pública solo con coordenadas'
);

-- Despacho
select set_config('t.s1', pg_temp.solicitud('Prueba despacho 1')::text, true);
select set_config('t.s2', pg_temp.solicitud('Prueba despacho 2')::text, true);

select throws_like(
  $$ select public.despachar_ambulancia(gen_random_uuid()) $$,
  'NO_ENCONTRADO%', 'despachar una solicitud que no existe → NO_ENCONTRADO'
);
select lives_ok(
  $$ select public.despachar_ambulancia(current_setting('t.s1')::uuid, '11111111-1111-4111-8111-000000000003') $$,
  'despachar una solicitud pendiente'
);
select is(pg_temp.estado_ambulancia(), 'en_servicio', 'al despachar, la ambulancia pasa a en_servicio');
select results_eq(
  $$ select estado::text, fecha_despacho is not null, despachada_por
     from public.solicitudes_ambulancia where id = current_setting('t.s1')::uuid $$,
  $$ values ('despachada', true, '11111111-1111-4111-8111-000000000003'::uuid) $$,
  'la solicitud queda despachada con su hora y quién la despachó'
);
select results_eq(
  $$ select estado_anterior::text, estado_nuevo::text, descripcion, registrado_por
     from public.bitacora_ambulancia where solicitud_id = current_setting('t.s1')::uuid $$,
  $$ values ('disponible', 'en_servicio', 'Despacho', '11111111-1111-4111-8111-000000000003'::uuid) $$,
  'el despacho queda en la bitácora con la solicitud y su autor'
);
select throws_like(
  $$ select public.despachar_ambulancia(current_setting('t.s2')::uuid) $$,
  'AMBULANCIA_NO_DISPONIBLE: la ambulancia está en_servicio', 'con la ambulancia en servicio no se despacha otra'
);
select throws_like(
  $$ select public.cambiar_estado_ambulancia('en_mantenimiento') $$,
  'AMBULANCIA_EN_SERVICIO%', 'de en_servicio no se pasa a mantenimiento sin cerrar el servicio'
);
select throws_like(
  $$ update public.ambulancias set estado = 'en_mantenimiento' $$,
  'AMBULANCIA_EN_SERVICIO%', 'tampoco con un UPDATE directo'
);
select throws_like(
  $$ update public.ambulancias set estado = 'disponible' $$,
  'AMBULANCIA_EN_SERVICIO%', 'no se libera a mano una ambulancia con un servicio en curso'
);
select throws_like(
  $$ select public.cerrar_servicio_ambulancia(current_setting('t.s2')::uuid) $$,
  'TRANSICION_INVALIDA%', 'no se cierra una solicitud pendiente'
);

-- En curso y cierre
select lives_ok(
  $$ select public.marcar_solicitud_en_curso(current_setting('t.s1')::uuid) $$, 'despachada → en_curso'
);
select throws_like(
  $$ select public.marcar_solicitud_en_curso(current_setting('t.s1')::uuid) $$,
  'TRANSICION_INVALIDA%', 'solo una despachada pasa a en_curso'
);
select is(pg_temp.estado_ambulancia(), 'en_servicio', 'en curso, la ambulancia sigue en servicio');
select lives_ok(
  $$ select public.cerrar_servicio_ambulancia(current_setting('t.s1')::uuid, 'Paciente trasladado a emergencias',
                                               '11111111-1111-4111-8111-000000000003') $$,
  'cerrar el servicio'
);
select results_eq(
  $$ select s.estado::text, s.fecha_cierre is not null, s.notas_cierre, (select estado::text from public.ambulancias)
     from public.solicitudes_ambulancia s where s.id = current_setting('t.s1')::uuid $$,
  $$ values ('finalizada', true, 'Paciente trasladado a emergencias', 'disponible') $$,
  'al cerrar, la solicitud se finaliza y la ambulancia vuelve a disponible'
);
select results_eq(
  $$ select estado_nuevo::text, descripcion from public.bitacora_ambulancia
     where solicitud_id = current_setting('t.s1')::uuid order by created_at, estado_nuevo desc $$,
  $$ values ('en_servicio', 'Despacho'), ('disponible', 'Paciente trasladado a emergencias') $$,
  'la bitácora guarda la salida y el regreso de la emergencia'
);
select throws_like(
  $$ select public.cerrar_servicio_ambulancia(current_setting('t.s1')::uuid) $$,
  'TRANSICION_INVALIDA%', 'un servicio cerrado no se vuelve a cerrar'
);

-- Cancelación
select lives_ok(
  $$ select public.cancelar_solicitud_ambulancia(current_setting('t.s2')::uuid, 'Duplicada') $$,
  'cancelar una pendiente'
);
select is(
  (select count(*)::int from public.bitacora_ambulancia where solicitud_id = current_setting('t.s2')::uuid), 0,
  'cancelar una pendiente no mueve la ambulancia (sin bitácora)'
);
select set_config('t.s3', pg_temp.solicitud('Prueba falsa alarma')::text, true);
select public.despachar_ambulancia(current_setting('t.s3')::uuid);
select throws_like(
  $$ select public.cancelar_solicitud_ambulancia(current_setting('t.s3')::uuid, 'Falsa alarma') $$,
  'TRANSICION_INVALIDA%', 'una despachada solo se cancela si quien llama tiene permiso'
);
select lives_ok(
  $$ select public.cancelar_solicitud_ambulancia(current_setting('t.s3')::uuid, 'Falsa alarma',
                                                  '11111111-1111-4111-8111-000000000003', true) $$,
  'recepción cancela una despachada'
);
select results_eq(
  $$ select s.estado::text, s.motivo_cancelacion, (select estado::text from public.ambulancias),
            (select b.descripcion from public.bitacora_ambulancia b
              where b.solicitud_id = s.id and b.estado_nuevo = 'disponible')
     from public.solicitudes_ambulancia s where s.id = current_setting('t.s3')::uuid $$,
  $$ values ('cancelada', 'Falsa alarma', 'disponible', 'Servicio cancelado: Falsa alarma') $$,
  'cancelar una despachada libera la ambulancia y queda en la bitácora'
);

-- Mantenimiento
select lives_ok(
  $$ select public.cambiar_estado_ambulancia('en_mantenimiento', 'Cambio de llantas', '11111111-1111-4111-8111-000000000001') $$,
  'disponible → en_mantenimiento'
);
select results_eq(
  $$ select estado_anterior::text, estado_nuevo::text, descripcion, solicitud_id, registrado_por
     from public.bitacora_ambulancia where descripcion = 'Cambio de llantas' $$,
  $$ values ('disponible', 'en_mantenimiento', 'Cambio de llantas', null::uuid, '11111111-1111-4111-8111-000000000001'::uuid) $$,
  'el mantenimiento queda en la bitácora con su descripción y autor'
);
select set_config('t.s4', pg_temp.solicitud('Prueba en mantenimiento')::text, true);
select throws_like(
  $$ select public.despachar_ambulancia(current_setting('t.s4')::uuid) $$,
  'AMBULANCIA_NO_DISPONIBLE: la ambulancia está en_mantenimiento', 'en mantenimiento no se despacha'
);
select throws_like(
  $$ select public.cambiar_estado_ambulancia('en_mantenimiento') $$,
  'TRANSICION_INVALIDA%', 'no se repite el mismo estado'
);
select throws_like(
  $$ select public.cambiar_estado_ambulancia('en_servicio') $$,
  'TRANSICION_INVALIDA%', 'en_servicio no se pone a mano'
);
select lives_ok($$ select public.cambiar_estado_ambulancia('disponible') $$, 'en_mantenimiento → disponible');
select throws_like(
  $$ update public.ambulancias set estado = 'en_servicio' $$,
  'TRANSICION_INVALIDA%', 'la ambulancia solo queda en servicio al despachar'
);

-- Realtime, permisos y RLS
select set_has(
  $$ select tablename::text from pg_publication_tables where pubname = 'supabase_realtime' $$,
  $$ values ('ambulancias'), ('solicitudes_ambulancia') $$,
  'los cambios de la ambulancia y de las solicitudes se publican por Realtime'
);
select pg_temp.como('11111111-1111-4111-8111-000000000004');  -- paciente Carlos
select is((select count(*)::int from public.ambulancias), 1, 'un paciente ve el estado de la ambulancia');
select is(
  (select count(*)::int from public.solicitudes_ambulancia
   where solicitada_por is distinct from '11111111-1111-4111-8111-000000000004'
     and paciente_id is distinct from (select id from public.pacientes where perfil_id = '11111111-1111-4111-8111-000000000004')),
  0, 'un paciente solo ve sus propias solicitudes'
);
select is((select count(*)::int from public.bitacora_ambulancia), 0, 'un paciente no ve la bitácora');
select throws_ok(
  $$ select public.despachar_ambulancia(gen_random_uuid()) $$,
  '42501', null, 'los clientes no llaman a las funciones de despacho (solo la API)'
);
reset role;
select pg_temp.como('11111111-1111-4111-8111-000000000003');  -- recepcionista Lucía
select ok((select count(*) from public.bitacora_ambulancia) > 0, 'recepción ve la bitácora');
reset role;

select * from finish();
rollback;
