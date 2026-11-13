-- HUNI-56: solicitudes de atención del paciente. Todo corre dentro de la transacción y se descarta.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.sin_sesion() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Usuarios del seed: Carlos y Ana Sofía (pacientes), Lucía (recepción), Roberto (doctor).
select set_config('t.carlos', '11111111-1111-4111-8111-000000000004', true);
select set_config('t.ana', '11111111-1111-4111-8111-000000000007', true);
select set_config('t.lucia', '11111111-1111-4111-8111-000000000003', true);
select set_config('t.roberto', '11111111-1111-4111-8111-000000000002', true);

-- Se parte sin solicitudes para contar sin depender del seed.
delete from public.solicitudes_atencion;

-- ============================================================================
-- Crear (paciente)
-- ============================================================================
select pg_temp.como(current_setting('t.carlos')::uuid);

select lives_ok(
  $$ select public.crear_solicitud_atencion('  Dolor de cabeza frecuente  ',
       (select id from public.especialidades where nombre = 'Medicina general'),
       public.hoy_local() + 1, 'manana') $$,
  'El paciente envía una solicitud'
);

select results_eq(
  $$ select motivo, estado::text, franja::text, especialidad from public.v_solicitudes_atencion $$,
  $$ values ('Dolor de cabeza frecuente', 'pendiente', 'manana', 'Medicina general') $$,
  'Se guarda pendiente, con el motivo recortado y la especialidad por nombre en la vista'
);

select throws_like(
  $$ select public.crear_solicitud_atencion('ok') $$,
  'SOLICITUD_INVALIDA:%',
  'El motivo necesita al menos 3 caracteres'
);

select throws_like(
  $$ select public.crear_solicitud_atencion('Control', null, public.hoy_local() - 1) $$,
  'REGLA_DE_NEGOCIO:%',
  'El día preferido no puede estar en el pasado'
);

select throws_like(
  $$ select public.crear_solicitud_atencion('Control', gen_random_uuid()) $$,
  'REFERENCIA_INVALIDA:%',
  'La especialidad debe existir'
);

select lives_ok(
  $$ select public.crear_solicitud_atencion('Segunda'); select public.crear_solicitud_atencion('Tercera') $$,
  'Hasta 3 pendientes'
);

select throws_like(
  $$ select public.crear_solicitud_atencion('Cuarta') $$,
  'REGLA_DE_NEGOCIO:%3 solicitudes pendientes%',
  'La cuarta pendiente se rechaza'
);

select throws_ok(
  $$ insert into public.solicitudes_atencion (paciente_id, motivo)
     values (public.paciente_actual_id(), 'Directo') $$,
  '42501', null,
  'Nadie inserta directo en la tabla'
);

-- ============================================================================
-- Privacidad: cada paciente ve solo las suyas
-- ============================================================================
select pg_temp.como(current_setting('t.ana')::uuid);
select lives_ok($$ select public.crear_solicitud_atencion('Control prenatal') $$, 'Otra paciente envía la suya');
select is((select count(*)::int from public.solicitudes_atencion), 1, 'Ana Sofía ve solo su solicitud (tabla)');
select is((select count(*)::int from public.v_solicitudes_atencion), 1, 'Ana Sofía ve solo su solicitud (vista)');

select pg_temp.como(current_setting('t.roberto')::uuid);
select is((select count(*)::int from public.v_solicitudes_atencion), 0, 'El doctor no ve la bandeja de recepción');
select throws_like(
  $$ select public.crear_solicitud_atencion('Soy doctor') $$,
  'ACCESO_DENEGADO:%',
  'Solo un paciente envía solicitudes'
);

-- ============================================================================
-- Responder (recepción)
-- ============================================================================
select pg_temp.como(current_setting('t.lucia')::uuid);
select is((select count(*)::int from public.v_solicitudes_atencion where estado = 'pendiente'), 4,
  'Recepción ve todas las pendientes');

select lives_ok(
  $$ select public.responder_solicitud_atencion(
       (select id from public.solicitudes_atencion where motivo = 'Segunda'), 'rechazada', null, 'Sin cupo esta semana') $$,
  'Recepción rechaza con respuesta'
);

select throws_like(
  $$ select public.responder_solicitud_atencion(
       (select id from public.solicitudes_atencion where motivo = 'Segunda'), 'atendida') $$,
  'TRANSICION_INVALIDA:%',
  'Una solicitud respondida no cambia otra vez'
);

select throws_like(
  $$ select public.responder_solicitud_atencion(
       (select id from public.solicitudes_atencion where motivo = 'Tercera'), 'atendida',
       (select c.id from public.citas c
         where c.paciente_id <> (select paciente_id from public.solicitudes_atencion where motivo = 'Tercera') limit 1)) $$,
  'REFERENCIA_INVALIDA:%',
  'La cita debe ser del mismo paciente'
);

select lives_ok(
  $$ select public.responder_solicitud_atencion(
       (select id from public.solicitudes_atencion where motivo = 'Tercera'), 'atendida') $$,
  'Recepción la marca atendida'
);

select pg_temp.como(current_setting('t.carlos')::uuid);
select results_eq(
  $$ select motivo, estado::text, respuesta from public.v_solicitudes_atencion
     where motivo in ('Segunda', 'Tercera') order by motivo $$,
  $$ values ('Segunda', 'rechazada', 'Sin cupo esta semana'), ('Tercera', 'atendida', null) $$,
  'El paciente ve la respuesta de recepción'
);

select pg_temp.sin_sesion();
set local role anon;
select throws_ok(
  $$ select count(*) from public.v_solicitudes_atencion $$,
  '42501', null,
  'Sin sesión no se lee nada'
);

select * from finish();
rollback;
