-- HUNI-51: turnos y citas consumidos directo desde Supabase (RLS + RPC).
-- Cada bloque corre "como" un usuario demo del seed: se simula su JWT con request.jwt.claims y el
-- rol authenticated, igual que PostgREST. Fechas en 2030 para no chocar con la agenda del seed.
--
--   001 administrador · 002 doctor Roberto (EMP-0002) · 003 recepcionista · 004 paciente Carlos
--   005 doctora Gabriela (EMP-0005) · 007 paciente Ana Sofía
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

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

-- Ids del seed, para usarlos dentro de los bloques
do $$
begin
  perform set_config('t.roberto',   (select id::text from public.personal where codigo_empleado = 'EMP-0002'), true);
  perform set_config('t.gabriela',  (select id::text from public.personal where codigo_empleado = 'EMP-0005'), true);
  perform set_config('t.fernando',  (select id::text from public.personal where codigo_empleado = 'EMP-0006'), true);
  perform set_config('t.enfermera', (select id::text from public.personal where codigo_empleado = 'EMP-0004'), true);
  perform set_config('t.carlos', (select id::text from public.pacientes where perfil_id = '11111111-1111-4111-8111-000000000004'), true);
  perform set_config('t.ana',    (select id::text from public.pacientes where perfil_id = '11111111-1111-4111-8111-000000000007'), true);
end $$;

-- Turnos del 04/03/2030 (hora de El Salvador). Fernando tiene turno nocturno (19:00 → 07:00 del día 5).
insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
select p.id, t.area, '2030-03-04', t.inicio::time, t.fin::time, t.tipo::public.tipo_turno
from (values
  ('EMP-0002', 'Consulta externa', '08:00', '12:00', 'manana'),
  ('EMP-0005', 'Pediatría',        '08:00', '12:00', 'manana'),
  ('EMP-0005', 'Pediatría',        '14:00', '18:00', 'tarde'),
  ('EMP-0006', 'Emergencia',       '19:00', '07:00', 'noche')
) as t (codigo, area, inicio, fin, tipo)
join public.personal p on p.codigo_empleado = t.codigo;

-- ============================================================================
-- Turno solapado para el mismo empleado → error legible
-- ============================================================================
select throws_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     values (current_setting('t.roberto')::uuid, 'Emergencia', '2030-03-04', '11:00', '14:00', 'tarde') $$,
  'PT409', 'TURNO_SOLAPADO: el empleado ya tiene un turno el 04/03/2030 de 08:00 a 12:00',
  'turno solapado → TURNO_SOLAPADO con la fecha y horas del turno que choca'
);
select throws_like(
  $$ update public.turnos_personal set hora_inicio = '11:00'
     where personal_id = current_setting('t.gabriela')::uuid and fecha = '2030-03-04' and hora_inicio = '14:00' $$,
  'TURNO_SOLAPADO%', 'editar un turno para que se cruce con otro también se rechaza'
);

-- ============================================================================
-- Turnos: RLS
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000004');  -- paciente
select ok((select count(*) from public.turnos_personal) > 0, 'paciente: lee los turnos');
select ok((select count(*) from public.v_turnos where nombres is not null) > 0, 'paciente: lee v_turnos con nombres');
select throws_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     values (current_setting('t.roberto')::uuid, 'X', '2030-03-06', '08:00', '12:00', 'manana') $$,
  '42501', null, 'paciente: no crea turnos'
);

select pg_temp.como('11111111-1111-4111-8111-000000000002');  -- doctor
select throws_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     values (current_setting('t.roberto')::uuid, 'X', '2030-03-06', '08:00', '12:00', 'manana') $$,
  '42501', null, 'doctor: no crea turnos'
);

select pg_temp.como('11111111-1111-4111-8111-000000000003');  -- recepcionista
select lives_ok(
  $$ insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno)
     values (current_setting('t.roberto')::uuid, 'Consulta externa', '2030-03-06', '08:00', '12:00', 'manana') $$,
  'recepcionista: crea turnos'
);
delete from public.turnos_personal where personal_id = current_setting('t.roberto')::uuid and fecha = '2030-03-06';
select pg_temp.como_backend();
select ok(
  exists (select 1 from public.turnos_personal where personal_id = current_setting('t.roberto')::uuid and fecha = '2030-03-06'),
  'recepcionista: no borra turnos (RLS no le deja ver la fila para borrarla)'
);

select pg_temp.como('11111111-1111-4111-8111-000000000001');  -- administrador
delete from public.turnos_personal where personal_id = current_setting('t.roberto')::uuid and fecha = '2030-03-06';
select pg_temp.como_backend();
select ok(
  not exists (select 1 from public.turnos_personal where personal_id = current_setting('t.roberto')::uuid and fecha = '2030-03-06'),
  'administrador: borra turnos'
);

select pg_temp.como_anonimo();
select throws_ok($$ select * from public.turnos_personal $$, '42501', null, 'sin sesión: no lee turnos');
select throws_ok($$ select * from public.v_citas $$, '42501', null, 'sin sesión: no lee citas');
select throws_ok(
  $$ select public.crear_cita(current_setting('t.ana')::uuid, current_setting('t.roberto')::uuid, '2030-03-04 10:00-06') $$,
  '42501', null, 'sin sesión: no puede llamar a crear_cita()'
);

-- ============================================================================
-- crear_cita(): recepción crea citas; valida turno y doble reserva
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000003');  -- recepcionista
select lives_ok(
  $$ select set_config('t.cita1', (public.crear_cita(current_setting('t.carlos')::uuid, current_setting('t.roberto')::uuid,
                                                     '2030-03-04 09:00-06', 30, 'Control')).id::text, true) $$,
  'recepcionista: crea una cita dentro del turno del doctor'
);
select is((select estado::text from public.citas where id = current_setting('t.cita1')::uuid), 'programada',
  'la cita nueva queda programada');
select throws_ok(
  $$ select public.crear_cita(current_setting('t.ana')::uuid, current_setting('t.roberto')::uuid, '2030-03-04 09:15-06') $$,
  'PT409', 'CITA_DUPLICADA: el doctor ya tiene una cita el 04/03/2030 a las 09:00',
  'cita duplicada para el mismo doctor y horario → CITA_DUPLICADA'
);
select throws_ok(
  $$ select public.crear_cita(current_setting('t.carlos')::uuid, current_setting('t.gabriela')::uuid, '2030-03-04 09:10-06') $$,
  'PT409', 'CITA_DUPLICADA: el paciente ya tiene una cita el 04/03/2030 a las 09:00',
  'el paciente tampoco puede tener dos citas que se crucen'
);
select throws_ok(
  $$ select public.crear_cita(current_setting('t.ana')::uuid, current_setting('t.roberto')::uuid, '2030-03-04 13:00-06') $$,
  'PT422', 'CITA_FUERA_DE_TURNO: el doctor no está de turno el 04/03/2030 de 13:00 a 13:30',
  'crear_cita() rechaza citas fuera del turno del doctor'
);
select throws_like(
  $$ select public.crear_cita(current_setting('t.ana')::uuid, current_setting('t.roberto')::uuid, '2030-03-04 11:45-06', 30) $$,
  'CITA_FUERA_DE_TURNO%', 'una cita que empieza en el turno pero termina después también se rechaza'
);
select lives_ok(
  $$ select public.crear_cita(current_setting('t.ana')::uuid, current_setting('t.fernando')::uuid, '2030-03-05 02:00-06') $$,
  'un turno nocturno cubre las citas de la madrugada del día siguiente'
);
select throws_like(
  $$ select public.crear_cita(current_setting('t.ana')::uuid, current_setting('t.enfermera')::uuid, '2030-03-04 10:00-06') $$,
  'REGLA_DE_NEGOCIO: el empleado indicado no es un médico activo', 'solo se agenda con médicos'
);
select throws_like(
  $$ select public.crear_cita(current_setting('t.ana')::uuid, current_setting('t.roberto')::uuid, now() - interval '1 day') $$,
  'REGLA_DE_NEGOCIO: la cita no puede quedar en el pasado', 'no se agenda en el pasado'
);
select throws_ok(
  $$ insert into public.citas (paciente_id, doctor_id, fecha_hora)
     values (current_setting('t.ana')::uuid, current_setting('t.roberto')::uuid, '2030-03-04 10:30-06') $$,
  '42501', null, 'nadie inserta citas directo: se crean con crear_cita()'
);
select lives_ok(
  $$ select set_config('t.cita2', (public.crear_cita(current_setting('t.carlos')::uuid, current_setting('t.gabriela')::uuid,
                                                     '2030-03-04 10:00-06')).id::text, true) $$,
  'recepcionista: crea una cita con otra doctora'
);
select lives_ok(
  $$ select set_config('t.cita3', (public.crear_cita(current_setting('t.ana')::uuid, current_setting('t.roberto')::uuid,
                                                     '2030-03-04 10:00-06')).id::text, true) $$,
  'recepcionista: crea una cita para otra paciente'
);

-- ============================================================================
-- Paciente: solo lee sus citas y solo puede cancelarlas
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000004');  -- Carlos
select is((select count(*)::int from public.citas where paciente_id <> current_setting('t.carlos')::uuid), 0,
  'paciente: no ve citas de otros pacientes');
select ok(exists (select 1 from public.citas where id = current_setting('t.cita1')::uuid), 'paciente: ve sus propias citas');
select is((select count(*)::int from public.v_citas where paciente_id <> current_setting('t.carlos')::uuid), 0,
  'paciente: v_citas también filtra');
select throws_ok(
  $$ update public.citas set estado = 'confirmada' where id = current_setting('t.cita1')::uuid $$,
  'PT422', 'TRANSICION_INVALIDA: el paciente solo puede cancelar su cita', 'paciente: no confirma su cita'
);
select throws_like(
  $$ update public.citas set fecha_hora = fecha_hora + interval '1 hour' where id = current_setting('t.cita1')::uuid $$,
  'ACCESO_DENEGADO%', 'paciente: no mueve su cita de horario'
);
select lives_ok(
  $$ update public.citas set estado = 'cancelada' where id = current_setting('t.cita2')::uuid $$,
  'paciente: cancela su cita'
);
select throws_like(
  $$ select public.crear_cita(current_setting('t.carlos')::uuid, current_setting('t.roberto')::uuid, '2030-03-04 11:00-06') $$,
  'ACCESO_DENEGADO%', 'paciente: no crea citas (las pide en recepción)'
);
select throws_like(
  $$ select * from public.doctores_disponibles('2030-03-04 09:00-06') $$,
  'ACCESO_DENEGADO%', 'paciente: no consulta doctores disponibles'
);

select pg_temp.como('11111111-1111-4111-8111-000000000007');  -- Ana Sofía
select is((select count(*)::int from public.citas where id = current_setting('t.cita1')::uuid), 0,
  'otra paciente no ve la cita de Carlos');
update public.citas set estado = 'cancelada' where id = current_setting('t.cita1')::uuid;
select pg_temp.como_backend();
select is((select estado::text from public.citas where id = current_setting('t.cita1')::uuid), 'programada',
  'otra paciente no puede cancelar la cita de Carlos');

-- ============================================================================
-- Doctor: solo ve sus citas y solo marca confirmada / atendida / no_asistio
-- ============================================================================
select pg_temp.como('11111111-1111-4111-8111-000000000002');  -- Roberto
select is((select count(*)::int from public.citas where doctor_id <> current_setting('t.roberto')::uuid), 0,
  'doctor: solo ve sus citas');
select ok(exists (select 1 from public.citas where id = current_setting('t.cita3')::uuid), 'doctor: ve las citas que atiende');
select throws_like(
  $$ update public.citas set estado = 'cancelada' where id = current_setting('t.cita3')::uuid $$,
  'TRANSICION_INVALIDA: el doctor solo puede%', 'doctor: no cancela citas'
);
select lives_ok(
  $$ update public.citas set estado = 'atendida' where id = current_setting('t.cita3')::uuid $$,
  'doctor: marca su cita como atendida'
);
select throws_like(
  $$ update public.citas set estado = 'confirmada' where id = current_setting('t.cita3')::uuid $$,
  'TRANSICION_INVALIDA: la cita ya está atendida%', 'una cita atendida ya no cambia de estado'
);
select throws_like(
  $$ select public.crear_cita(current_setting('t.ana')::uuid, current_setting('t.roberto')::uuid, '2030-03-04 11:00-06') $$,
  'ACCESO_DENEGADO%', 'doctor: no crea citas'
);

select pg_temp.como('11111111-1111-4111-8111-000000000005');  -- Gabriela
select is((select count(*)::int from public.citas where id = current_setting('t.cita1')::uuid), 0,
  'una doctora no ve las citas de otro doctor');

-- ============================================================================
-- Recepción: ve todas, busca doctores disponibles y reprograma
-- ============================================================================
select pg_temp.como_backend();
select set_config('t.total', (select count(*)::text from public.citas), true);

select pg_temp.como('11111111-1111-4111-8111-000000000003');  -- recepcionista
select is((select count(*)::text from public.citas), current_setting('t.total'), 'recepcionista: ve todas las citas');
select set_eq(
  $$ select id from public.doctores_disponibles('2030-03-04 09:00-06', 30) $$,
  $$ values (current_setting('t.gabriela')::uuid) $$,
  'doctores_disponibles(): solo quien está de turno y libre (Roberto ya tiene cita a las 09:00)'
);
select set_eq(
  $$ select id from public.doctores_disponibles('2030-03-04 09:00-06', 30, null, current_setting('t.cita1')::uuid) $$,
  $$ values (current_setting('t.roberto')::uuid), (current_setting('t.gabriela')::uuid) $$,
  'doctores_disponibles(): p_excluir_cita_id ignora la cita que se va a reprogramar'
);
select lives_ok(
  $$ select public.reprogramar_cita(current_setting('t.cita1')::uuid, null, current_setting('t.gabriela')::uuid) $$,
  'recepcionista: reasigna la cita a otra doctora'
);
select results_eq(
  $$ select doctor_id, estado::text from public.citas where id = current_setting('t.cita1')::uuid $$,
  $$ values (current_setting('t.gabriela')::uuid, 'programada') $$,
  'la cita reprogramada cambia de doctor y vuelve a quedar programada'
);
select throws_like(
  $$ select public.reprogramar_cita(current_setting('t.cita1')::uuid, '2030-03-04 12:30-06') $$,
  'CITA_FUERA_DE_TURNO%', 'reprogramar valida el turno del doctor'
);
select throws_like(
  $$ select public.reprogramar_cita(current_setting('t.cita2')::uuid, '2030-03-04 11:00-06') $$,
  'TRANSICION_INVALIDA: solo se reprograman%', 'una cita cancelada no se reprograma'
);
select throws_like(
  $$ select public.reprogramar_cita(current_setting('t.cita1')::uuid) $$,
  'SOLICITUD_INVALIDA%', 'reprogramar sin cambios es una solicitud inválida'
);
select throws_like(
  $$ select public.reprogramar_cita(gen_random_uuid(), '2030-03-04 11:00-06') $$,
  'NO_ENCONTRADO%', 'reprogramar una cita que no existe'
);

-- La API (sin JWT de usuario) también puede usar crear_cita()
select pg_temp.como_backend();
select lives_ok(
  $$ select public.crear_cita(current_setting('t.ana')::uuid, current_setting('t.gabriela')::uuid, '2030-03-04 11:00-06') $$,
  'backend (API / service_role): crea citas sin JWT de usuario'
);

select * from finish();
rollback;
