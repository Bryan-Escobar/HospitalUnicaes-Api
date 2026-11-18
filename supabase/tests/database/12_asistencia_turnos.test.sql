begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select set_config('t.doctor', (select id::text from public.personal where codigo_empleado = 'EMP-0002'), true);
select set_config('t.perfil', (select perfil_id::text from public.personal where codigo_empleado = 'EMP-0002'), true);

insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
values
  (current_setting('t.doctor')::uuid, 'Asistencia puntual', '2001-01-01', '08:00', '12:00', 'manana'),
  (current_setting('t.doctor')::uuid, 'Asistencia nocturna', '2001-01-02', '23:45', '07:00', 'noche'),
  (current_setting('t.doctor')::uuid, 'Asistencia ausente', '2001-01-04', '08:00', '12:00', 'manana'),
  (current_setting('t.doctor')::uuid, 'Asistencia futura', '2999-01-01', '08:00', '12:00', 'manana');

insert into public.conexiones_app_medicos (personal_id, conectada_at)
select current_setting('t.doctor')::uuid, instante::timestamptz
from (values
  ('2001-01-01 08:15:00-06'),
  ('2001-01-01 11:59:00-06'),
  ('2001-01-03 00:01:00-06'),
  ('2001-01-04 07:59:00-06'),
  ('2001-01-04 12:00:00-06')
) v(instante);

select is((select estado_asistencia from public.v_turnos where area = 'Asistencia puntual'),
  'presente', 'la primera apertura cuenta incluso al límite de la tolerancia y con aperturas posteriores');
select is((select estado_asistencia from public.v_turnos where area = 'Asistencia nocturna'),
  'tarde', 'una apertura en la madrugada se asocia con el turno nocturno anterior');
select is((select estado_asistencia from public.v_turnos where area = 'Asistencia ausente'),
  'ausente', 'una apertura antes del inicio o justo al final queda fuera del turno');
select is((select estado_asistencia from public.v_turnos where area = 'Asistencia futura'),
  'programado', 'un turno futuro aparece programado');

-- Se despeja la agenda del médico de prueba para verificar un turno actualmente activo.
delete from public.turnos_personal
where personal_id = current_setting('t.doctor')::uuid
  and fecha between (now() at time zone 'America/El_Salvador')::date - 1
                and (now() at time zone 'America/El_Salvador')::date + 1;

with local as (select now() at time zone 'America/El_Salvador' as hora)
insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
select current_setting('t.doctor')::uuid, 'Asistencia activa',
  (hora - interval '5 minutes')::date, (hora - interval '5 minutes')::time,
  (hora + interval '30 minutes')::time, 'guardia'
from local;

select is((select estado_asistencia from public.v_turnos where area = 'Asistencia activa'),
  'sin_conexion', 'un turno abierto espera la conexión del médico');
select is(public.registrar_conexion_app(current_setting('t.perfil')::uuid), statement_timestamp(),
  'el backend devuelve la hora de la conexión según la base de datos');
select is((select ultima_conexion_app_at from public.perfiles where id = current_setting('t.perfil')::uuid),
  (select max(conectada_at) from public.conexiones_app_medicos where personal_id = current_setting('t.doctor')::uuid),
  'la última conexión del perfil coincide con el evento registrado');
select is((select estado_asistencia from public.v_turnos where area = 'Asistencia activa'),
  'presente', 'una apertura durante el turno activa la presencia');

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is((select estado_asistencia from public.v_turnos where area = 'Asistencia puntual'),
  null::text, 'un paciente puede consultar su calendario sin ver la asistencia del médico');
select throws_ok($$ select * from public.conexiones_app_medicos $$, '42501', null,
  'el historial no se expone a los clientes de Supabase');
select throws_ok($$ select public.registrar_conexion_app(current_setting('t.perfil')::uuid) $$, '42501', null,
  'la función de backend no se puede invocar desde una sesión de cliente');

select * from finish();
rollback;
