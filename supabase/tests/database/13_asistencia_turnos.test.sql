begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select set_config('t.doctor', (select id::text from public.personal where codigo_empleado = 'EMP-0002'), true);
select set_config('t.perfil', (select perfil_id::text from public.personal where codigo_empleado = 'EMP-0002'), true);
select set_config('t.recepcion', (select id::text from public.personal where codigo_empleado = 'EMP-0003'), true);
select set_config('t.perfil_recepcion', (select perfil_id::text from public.personal where codigo_empleado = 'EMP-0003'), true);
select set_config('t.enfermeria', (select id::text from public.personal where codigo_empleado = 'EMP-0004'), true);
select set_config('t.paciente', '11111111-1111-4111-8111-000000000004', true);

insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno, notas)
values
  (current_setting('t.doctor')::uuid, 'Consulta externa', '2001-01-01', '08:00', '12:00', 'manana', 'Asistencia puntual'),
  (current_setting('t.doctor')::uuid, 'Emergencia', '2001-01-02', '23:45', '07:00', 'noche', 'Asistencia nocturna'),
  (current_setting('t.doctor')::uuid, 'Consulta externa', '2001-01-04', '08:00', '12:00', 'manana', 'Asistencia ausente'),
  (current_setting('t.doctor')::uuid, 'Consulta externa', '2999-01-01', '08:00', '12:00', 'manana', 'Asistencia futura'),
  (current_setting('t.enfermeria')::uuid, 'Enfermería', '2001-01-04', '08:00', '12:00', 'manana', 'Asistencia sin cuenta');

insert into public.conexiones_app_personal (personal_id, conectada_at)
select current_setting('t.doctor')::uuid, instante::timestamptz
from (values
  ('2001-01-01 08:15:00-06'),
  ('2001-01-01 11:59:00-06'),
  ('2001-01-03 00:01:00-06'),
  ('2001-01-04 07:59:00-06'),
  ('2001-01-04 12:00:00-06')
) v(instante);

select is((select estado_asistencia from public.v_turnos where notas = 'Asistencia puntual'),
  'presente', 'la primera apertura cuenta incluso al límite de la tolerancia y con aperturas posteriores');
select is((select estado_asistencia from public.v_turnos where notas = 'Asistencia nocturna'),
  'tarde', 'una apertura en la madrugada se asocia con el turno nocturno anterior');
select is((select estado_asistencia from public.v_turnos where notas = 'Asistencia ausente'),
  'ausente', 'una apertura antes del inicio o justo al final queda fuera del turno');
select is((select estado_asistencia from public.v_turnos where notas = 'Asistencia futura'),
  'programado', 'un turno futuro aparece programado');
select is((select estado_asistencia from public.v_turnos where notas = 'Asistencia sin cuenta'),
  'sin_cuenta', 'un turno de personal sin cuenta aparece en la vista');

-- Se despeja la agenda de recepción de prueba para verificar un turno actualmente activo.
delete from public.turnos_personal
where personal_id = current_setting('t.recepcion')::uuid
  and fecha between (now() at time zone 'America/El_Salvador')::date - 1
                and (now() at time zone 'America/El_Salvador')::date + 1;

with local as (select now() at time zone 'America/El_Salvador' as hora)
insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno, notas)
select current_setting('t.recepcion')::uuid, 'Recepción',
  (hora - interval '5 minutes')::date, (hora - interval '5 minutes')::time,
  (hora + interval '30 minutes')::time, 'guardia', 'Asistencia activa'
from local;

select is((select estado_asistencia from public.v_turnos where notas = 'Asistencia activa'),
  'sin_conexion', 'un turno abierto espera la conexión de cualquier tipo de personal');
select is(public.registrar_conexion_app(current_setting('t.perfil_recepcion')::uuid), statement_timestamp(),
  'el backend devuelve la hora de la conexión para recepción según la base de datos');
select is((select ultima_conexion_app_at from public.perfiles where id = current_setting('t.perfil_recepcion')::uuid),
  (select max(conectada_at) from public.conexiones_app_personal where personal_id = current_setting('t.recepcion')::uuid),
  'la última conexión de recepción coincide con el evento registrado');
select is((select estado_asistencia from public.v_turnos where notas = 'Asistencia activa'),
  'presente', 'una apertura durante el turno activa la presencia también para personal no médico');

select set_config('t.conexiones', (select count(*)::text from public.conexiones_app_personal), true);
select is(public.registrar_conexion_app(current_setting('t.paciente')::uuid), statement_timestamp(),
  'el backend también acepta el registro de apertura de un paciente activo');
select ok((select ultima_conexion_app_at is not null from public.perfiles where id = current_setting('t.paciente')::uuid),
  'la fecha del paciente se guarda en su perfil');
select is((select count(*) from public.conexiones_app_personal), current_setting('t.conexiones')::bigint,
  'la apertura de un paciente sin personal vinculado no añade asistencia');

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select estado_asistencia from public.v_turnos where notas = 'Asistencia activa'),
  'presente', 'el panel administrativo puede ver la asistencia de recepción');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is((select estado_asistencia from public.v_turnos where notas = 'Asistencia activa'),
  null::text, 'un paciente puede consultar su calendario sin ver la asistencia del médico');
select throws_ok($$ select * from public.conexiones_app_personal $$, '42501', null,
  'el historial no se expone a los clientes de Supabase');
select throws_ok($$ select public.registrar_conexion_app(current_setting('t.perfil')::uuid) $$, '42501', null,
  'la función de backend no se puede invocar desde una sesión de cliente');

select * from finish();
rollback;
