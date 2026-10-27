-- HUNI-66: asignación de camas.
--   Parte 1 (concurrencia real): dos conexiones dblink piden la misma cama, y luego la última cama VIP,
--   al mismo tiempo. Esas conexiones confirman sus cambios, así que la parte 1 limpia todo al terminar.
--   Parte 2 (dentro de la transacción, se descarta): reglas, sugerencia, traslado, alta e historial, RLS.
--   dblink entra por la IP del servidor (inet_server_addr) porque localhost no pide contraseña y dblink
--   la exige; supabase test db se conecta por la red de Docker, así que esa IP existe (local y CI).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(31);

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.cama(p_codigo text) returns uuid language sql as $$
  select id from public.camas where codigo = p_codigo
$$;

create function pg_temp.personal(p_codigo text) returns uuid language sql as $$
  select id from public.personal where codigo_empleado = p_codigo
$$;

-- Pacientes de prueba (parte 1)
insert into public.pacientes (id, nombres, apellidos, sexo) values
  ('88888888-8888-4888-8888-000000000001', 'Prueba', 'Cama Uno', 'femenino'),
  ('88888888-8888-4888-8888-000000000002', 'Prueba', 'Cama Dos', 'masculino');

-- ============================================================================
-- Parte 1: concurrencia real (dos conexiones a la vez). Va primero: la parte 2 bloquea filas de camas
-- dentro de esta transacción y las conexiones dblink se quedarían esperando.
-- ============================================================================
select set_config('t.conn', format('host=%s port=%s dbname=%s user=postgres password=postgres',
  host(inet_server_addr()), inet_server_port(), current_database()), true);
select set_config('t.doctor', pg_temp.personal('EMP-0002')::text, true);

select extensions.dblink_connect('c0', current_setting('t.conn'));
select extensions.dblink_connect('c1', current_setting('t.conn'));
select extensions.dblink_connect('c2', current_setting('t.conn'));

-- Estado original de las camas VIP para restaurarlo al final
create temp table camas_vip_originales as
select c.id, c.estado from public.camas c join public.habitaciones h on h.id = c.habitacion_id where h.tipo = 'vip';

select extensions.dblink_exec('c0', $$
  insert into public.pacientes (id, nombres, apellidos) values
    ('99999999-9999-4999-8999-000000000001', 'Concurrencia', 'Uno'),
    ('99999999-9999-4999-8999-000000000002', 'Concurrencia', 'Dos'),
    ('99999999-9999-4999-8999-000000000003', 'Concurrencia', 'Tres');
  update public.camas set estado = 'disponible' where codigo = 'VIP-305-A' and estado <> 'ocupada';
$$);

-- 2a. Misma cama: c1 la toma y sostiene la transacción 1.5 s; c2 la pide mientras tanto.
select extensions.dblink_send_query('c1', format(
  $$ select public.asignar_cama('99999999-9999-4999-8999-000000000001', %L, (select id from public.camas where codigo = 'VIP-305-A'))::text, pg_sleep(1.5) $$,
  current_setting('t.doctor')));
select pg_sleep(0.3);
select extensions.dblink_send_query('c2', format(
  $$ select public.asignar_cama('99999999-9999-4999-8999-000000000002', %L, (select id from public.camas where codigo = 'VIP-305-A'))::text $$,
  current_setting('t.doctor')));

create temp table r1 as select * from extensions.dblink_get_result('c1', false) as t(id text, s text);
select * from extensions.dblink_get_result('c1', false) as t(id text, s text);
create temp table r2 as select * from extensions.dblink_get_result('c2', false) as t(id text);
select set_config('t.error_c2', extensions.dblink_error_message('c2'), true);
select * from extensions.dblink_get_result('c2', false) as t(id text);

select is((select count(*)::int from r1), 1, 'concurrencia (misma cama): la primera solicitud gana');
select ok(
  (select count(*) from r2) = 0 and current_setting('t.error_c2') like '%CAMA_OCUPADA%',
  'concurrencia (misma cama): la segunda, que esperó el bloqueo, recibe CAMA_OCUPADA'
);

-- 2b. La última cama VIP: solo VIP-305 libre (la de 2a se libera) y dos pedidos por tipo a la vez.
select extensions.dblink_exec('c0', $$
  delete from public.hospitalizaciones where paciente_id = '99999999-9999-4999-8999-000000000001';
  update public.camas set estado = 'disponible' where codigo = 'VIP-305-A';
  update public.camas c set estado = 'mantenimiento'
  from public.habitaciones h where h.id = c.habitacion_id and h.tipo = 'vip' and c.estado = 'disponible' and c.codigo <> 'VIP-305-A';
$$);

select extensions.dblink_send_query('c1', format(
  $$ select public.asignar_cama('99999999-9999-4999-8999-000000000002', %L, null, 'vip')::text, pg_sleep(1.5) $$,
  current_setting('t.doctor')));
select pg_sleep(0.3);
select extensions.dblink_send_query('c2', format(
  $$ select public.asignar_cama('99999999-9999-4999-8999-000000000003', %L, null, 'vip')::text $$,
  current_setting('t.doctor')));

create temp table r3 as select * from extensions.dblink_get_result('c1', false) as t(id text, s text);
select * from extensions.dblink_get_result('c1', false) as t(id text, s text);
create temp table r4 as select * from extensions.dblink_get_result('c2', false) as t(id text);
select set_config('t.error_c2b', extensions.dblink_error_message('c2'), true);
select * from extensions.dblink_get_result('c2', false) as t(id text);

select ok(
  (select count(*) from r3) + (select count(*) from r4) = 1
    and current_setting('t.error_c2b') like '%SIN_CAMAS_DISPONIBLES%',
  'concurrencia (última cama): solo una solicitud tiene éxito; la otra recibe SIN_CAMAS_DISPONIBLES'
);

-- Limpieza de lo que confirmaron las conexiones dblink
select extensions.dblink_exec('c0', $$
  delete from public.hospitalizaciones where paciente_id::text like '99999999-9999-4999-8999-%';
  delete from public.pacientes where id::text like '99999999-9999-4999-8999-%';
$$);
select extensions.dblink_exec('c0', (
  select string_agg(format('update public.camas set estado = %L where id = %L;', estado, id), ' ')
  from camas_vip_originales
));
select extensions.dblink_disconnect('c0');
select extensions.dblink_disconnect('c1');
select extensions.dblink_disconnect('c2');

-- ============================================================================
-- Parte 2: reglas
-- ============================================================================
select throws_ok(
  $$ select public.asignar_cama('88888888-8888-4888-8888-000000000001', pg_temp.personal('EMP-0002'), pg_temp.cama('VIP-301-A')) $$,
  'PT409', 'CAMA_OCUPADA: la cama VIP-301-A ya tiene un paciente',
  'asignar una cama ocupada → CAMA_OCUPADA (409)'
);
select throws_like(
  $$ select public.asignar_cama((select paciente_id from public.hospitalizaciones where fecha_alta is null limit 1),
                                pg_temp.personal('EMP-0002'), null, 'semiprivada') $$,
  'PACIENTE_YA_HOSPITALIZADO%', 'asignar a un paciente que ya tiene cama → PACIENTE_YA_HOSPITALIZADO (409)'
);
select throws_like(
  $$ select public.asignar_cama(gen_random_uuid(), pg_temp.personal('EMP-0002'), null, 'vip') $$,
  'REFERENCIA_INVALIDA%', 'paciente que no existe → REFERENCIA_INVALIDA'
);
select throws_like(
  $$ select public.asignar_cama((select id from public.pacientes where nombres = 'Miguel Ángel'), pg_temp.personal('EMP-0002'), null, 'vip') $$,
  'REGLA_DE_NEGOCIO: el paciente está desactivado', 'paciente desactivado → REGLA_DE_NEGOCIO'
);
select throws_like(
  $$ select public.asignar_cama('88888888-8888-4888-8888-000000000001', pg_temp.personal('EMP-0004'), null, 'vip') $$,
  'REGLA_DE_NEGOCIO: el doctor tratante%', 'el doctor tratante debe ser médico'
);
update public.camas set estado = 'limpieza' where codigo = 'VIP-305-A';
select throws_like(
  $$ select public.asignar_cama('88888888-8888-4888-8888-000000000001', pg_temp.personal('EMP-0002'), pg_temp.cama('VIP-305-A')) $$,
  'CAMA_NO_DISPONIBLE: la cama VIP-305-A está en limpieza', 'una cama en limpieza no se asigna'
);
update public.camas set estado = 'disponible' where codigo = 'VIP-305-A';

select throws_like(
  $$ insert into public.camas (habitacion_id, codigo) select id, 'VIP-302-B' from public.habitaciones where codigo = 'VIP-302' $$,
  'La habitación ya tiene sus 1 cama(s)', 'una VIP nunca tiene más de 1 cama (1 paciente)'
);
select throws_like(
  $$ insert into public.camas (habitacion_id, codigo) select id, 'HAB-202-C' from public.habitaciones where codigo = 'HAB-202' $$,
  'La habitación ya tiene sus 2 cama(s)', 'una semiprivada nunca tiene más de 2 camas (2 pacientes)'
);

-- Sugerencia: primero habitaciones vacías (HAB-201 tiene un paciente en el seed y una cama libre)
select ok(
  (select h.codigo from public.camas c join public.habitaciones h on h.id = c.habitacion_id
   where c.id = public.sugerir_cama('semiprivada')) <> 'HAB-201',
  'la sugerencia prefiere una habitación vacía antes que compartir'
);
select is(
  (select h.tipo::text from public.camas c join public.habitaciones h on h.id = c.habitacion_id
   where c.id = public.sugerir_cama('vip')), 'vip', 'la sugerencia respeta el tipo pedido'
);

-- Ingreso por tipo
select lives_ok(
  $$ select set_config('t.hosp1', public.asignar_cama('88888888-8888-4888-8888-000000000001', pg_temp.personal('EMP-0002'),
            null, 'vip', 'Observación', pg_temp.personal('EMP-0003'))::text, true) $$,
  'ingreso con la cama sugerida para el tipo'
);
select is(
  (select c.estado::text from public.hospitalizaciones h join public.camas c on c.id = h.cama_id
   where h.id = current_setting('t.hosp1')::uuid), 'ocupada', 'la cama queda ocupada'
);
select results_eq(
  $$ select tipo::text, registrado_por from public.movimientos_cama where hospitalizacion_id = current_setting('t.hosp1')::uuid $$,
  $$ values ('ingreso', pg_temp.personal('EMP-0003')) $$,
  'el ingreso queda en el historial con quién lo registró'
);

-- Traslado
select set_config('t.cama_origen', (select cama_id::text from public.hospitalizaciones where id = current_setting('t.hosp1')::uuid), true);
select throws_like(
  $$ select public.trasladar_cama(current_setting('t.hosp1')::uuid, pg_temp.cama('VIP-301-A')) $$,
  'CAMA_OCUPADA%', 'no se traslada a una cama ocupada'
);
select lives_ok(
  $$ select public.trasladar_cama(current_setting('t.hosp1')::uuid, pg_temp.cama('HAB-206-A'), pg_temp.personal('EMP-0003')) $$,
  'traslado a una cama libre'
);
select results_eq(
  $$ select (select estado::text from public.camas where id = current_setting('t.cama_origen')::uuid),
            (select estado::text from public.camas where codigo = 'HAB-206-A') $$,
  $$ values ('limpieza', 'ocupada') $$,
  'el traslado libera la cama anterior (limpieza) y ocupa la nueva'
);
select results_eq(
  $$ select cama_origen_id, cama_destino_id from public.movimientos_cama
     where hospitalizacion_id = current_setting('t.hosp1')::uuid and tipo = 'traslado' $$,
  $$ values (current_setting('t.cama_origen')::uuid, pg_temp.cama('HAB-206-A')) $$,
  'el traslado guarda de qué cama a qué cama'
);

-- Cambios manuales de una cama
select throws_like(
  $$ update public.camas set estado = 'disponible' where codigo = 'HAB-206-A' $$,
  'CAMA_OCUPADA%', 'una cama con paciente no se libera a mano'
);
select throws_like(
  $$ update public.camas set estado = 'ocupada' where codigo = 'HAB-205-A' $$,
  'REGLA_DE_NEGOCIO%', 'una cama solo queda ocupada al ingresar a un paciente'
);

-- Alta
select lives_ok(
  $$ select public.dar_alta(current_setting('t.hosp1')::uuid, 'Alta médica', pg_temp.personal('EMP-0003')) $$,
  'alta'
);
select results_eq(
  $$ select h.estado::text, h.fecha_alta is not null, h.notas_alta, c.estado::text
     from public.hospitalizaciones h join public.camas c on c.id = h.cama_id
     where h.id = current_setting('t.hosp1')::uuid $$,
  $$ values ('alta', true, 'Alta médica', 'limpieza') $$,
  'el alta cierra la hospitalización (se conserva) y la cama pasa a limpieza'
);
select is(
  (select array_agg(tipo::text order by created_at, tipo) from public.movimientos_cama
   where hospitalizacion_id = current_setting('t.hosp1')::uuid),
  array['ingreso', 'traslado', 'alta'], 'el historial guarda ingreso, traslado y alta'
);
select throws_like(
  $$ select public.dar_alta(current_setting('t.hosp1')::uuid) $$,
  'HOSPITALIZACION_FINALIZADA%', 'un alta no se repite'
);
select throws_like(
  $$ select public.trasladar_cama(current_setting('t.hosp1')::uuid, pg_temp.cama('HAB-205-A')) $$,
  'HOSPITALIZACION_FINALIZADA%', 'no se traslada una hospitalización con alta'
);

-- Sin camas del tipo
update public.camas c set estado = 'mantenimiento'
from public.habitaciones h where h.id = c.habitacion_id and h.tipo = 'vip' and c.estado = 'disponible';
select throws_like(
  $$ select public.asignar_cama('88888888-8888-4888-8888-000000000002', pg_temp.personal('EMP-0002'), null, 'vip') $$,
  'SIN_CAMAS_DISPONIBLES%', 'sin camas libres del tipo → SIN_CAMAS_DISPONIBLES'
);

-- Realtime y RLS
select set_has(
  $$ select tablename::text from pg_publication_tables where pubname = 'supabase_realtime' $$,
  $$ values ('camas'), ('hospitalizaciones') $$,
  'los cambios de ocupación se publican por Realtime'
);
select pg_temp.como('11111111-1111-4111-8111-000000000004');  -- paciente Carlos (no hospitalizado)
select is((select count(*)::int from public.camas), 17, 'cualquier usuario con sesión ve las 17 camas (sin datos del paciente)');
select is((select count(*)::int from public.hospitalizaciones), 0, 'un paciente no ve hospitalizaciones ajenas');
reset role;

select * from finish();
rollback;
