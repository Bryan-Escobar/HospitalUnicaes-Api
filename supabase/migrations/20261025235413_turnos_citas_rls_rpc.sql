-- =============================================================================
-- HUNI-51: turnos y citas se consumen directo desde Supabase (arquitectura híbrida)
--
--   1. Funciones de sesión: rol, empleado y paciente del usuario que llama
--   2. Turnos: un turno que se cruza con otro del mismo empleado → TURNO_SOLAPADO
--   3. Citas: doble reserva → CITA_DUPLICADA; fuera del turno del doctor → CITA_FUERA_DE_TURNO;
--      el doctor y el paciente solo cambian el estado (y solo a los estados que les tocan)
--   4. RLS de turnos_personal y citas
--   5. Vistas v_turnos y v_citas (con nombres) para que los clientes no tengan que hacer joins
--   6. RPC: crear_cita(), doctores_disponibles(), reprogramar_cita()
--
-- Los errores se lanzan como 'CODIGO: detalle' (código de ERROR_CODES) con SQLSTATE PTxxx,
-- así PostgREST responde con el mismo HTTP que el catálogo de la API (PT409 → 409, etc.).
-- Las exclusion constraints de HUNI-37 se quedan como respaldo ante concurrencia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sesión
-- -----------------------------------------------------------------------------
create or replace function public.rol_actual()
  returns public.rol_usuario
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select pf.rol from public.perfiles pf where pf.id = auth.uid() and pf.activo;
$function$;

comment on function public.rol_actual() is
  'Rol del usuario autenticado; null si no hay sesión o la cuenta está desactivada (HUNI-51).';

create or replace function public.personal_actual_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select p.id from public.personal p where p.perfil_id = auth.uid() and p.activo;
$function$;

create or replace function public.paciente_actual_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select pa.id from public.pacientes pa where pa.perfil_id = auth.uid() and pa.activo;
$function$;

-- Corta la RPC si quien llama no tiene uno de los roles.
-- Sin JWT de usuario (la API con Prisma o la llave service_role) se considera backend de confianza.
create or replace function public.exigir_rol(p_roles public.rol_usuario[])
  returns void
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare
  v_rol public.rol_usuario;
begin
  if auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return;
  end if;

  v_rol := public.rol_actual();
  if v_rol is null then
    raise exception using errcode = '42501', message = 'CUENTA_INACTIVA: la cuenta no existe o está desactivada';
  end if;
  if not v_rol = any (p_roles) then
    raise exception using errcode = '42501',
      message = format('ACCESO_DENEGADO: el rol %s no puede hacer esta operación', v_rol);
  end if;
end;
$function$;

-- -----------------------------------------------------------------------------
-- Horarios en hora local (los turnos se guardan como fecha + hora de El Salvador)
-- -----------------------------------------------------------------------------
create or replace function public.rango_cita_local(p_inicio timestamptz, p_minutos integer)
  returns tsrange
  language sql
  stable
  set search_path to ''
  as $function$
  select tsrange(
    p_inicio at time zone 'America/El_Salvador',
    (p_inicio + make_interval(mins => p_minutos)) at time zone 'America/El_Salvador'
  );
$function$;

-- El doctor está de turno si sus turnos (unidos, para cubrir turnos seguidos) contienen toda la cita.
create or replace function public.doctor_de_turno(p_doctor_id uuid, p_inicio timestamptz, p_minutos integer)
  returns boolean
  language sql
  stable
  set search_path to ''
  as $function$
  select coalesce(
    (select range_agg(public.rango_turno(t.fecha, t.hora_inicio, t.hora_fin))
       from public.turnos_personal t
      where t.personal_id = p_doctor_id
        and t.fecha between (p_inicio at time zone 'America/El_Salvador')::date - 1
                        and ((p_inicio + make_interval(mins => p_minutos)) at time zone 'America/El_Salvador')::date)
      @> public.rango_cita_local(p_inicio, p_minutos),
    false
  );
$function$;

comment on function public.doctor_de_turno(uuid, timestamptz, integer) is
  'true si los turnos del doctor cubren la cita completa (inicio y fin), en hora de El Salvador (HUNI-51).';

-- -----------------------------------------------------------------------------
-- 2. Turnos sin solape, con mensaje legible
-- -----------------------------------------------------------------------------
create or replace function public.validar_turno()
  returns trigger
  language plpgsql
  security definer  -- ve todas las filas aunque quien llama tenga RLS
  set search_path to ''
  as $function$
declare
  v_otro record;
begin
  -- Serializa los turnos del mismo empleado: dos inserciones simultáneas no se cuelan entre sí.
  perform pg_advisory_xact_lock(hashtextextended('turno:' || new.personal_id::text, 0));

  select t.fecha, t.hora_inicio, t.hora_fin into v_otro
  from public.turnos_personal t
  where t.personal_id = new.personal_id
    and t.id <> new.id
    and public.rango_turno(t.fecha, t.hora_inicio, t.hora_fin)
        && public.rango_turno(new.fecha, new.hora_inicio, new.hora_fin)
  limit 1;

  if found then
    raise exception using errcode = 'PT409', message = format(
      'TURNO_SOLAPADO: el empleado ya tiene un turno el %s de %s a %s',
      to_char(v_otro.fecha, 'DD/MM/YYYY'), to_char(v_otro.hora_inicio, 'HH24:MI'), to_char(v_otro.hora_fin, 'HH24:MI'));
  end if;

  return new;
end;
$function$;

create trigger turnos_personal_validar
  before insert or update of personal_id, fecha, hora_inicio, hora_fin on public.turnos_personal
  for each row execute function public.validar_turno();

-- -----------------------------------------------------------------------------
-- 3. Citas: quién cambia qué, sin doble reserva y dentro del turno del doctor
-- -----------------------------------------------------------------------------
create or replace function public.validar_cita()
  returns trigger
  language plpgsql
  security definer  -- ve todas las filas aunque quien llama tenga RLS
  set search_path to ''
  as $function$
declare
  v_rol           public.rol_usuario := public.rol_actual();
  v_activa_antes  boolean := tg_op = 'UPDATE' and old.estado in ('programada', 'confirmada');
  v_choque        timestamptz;
begin
  -- Doctor y paciente (desde el cliente) solo cambian el estado de la cita.
  if tg_op = 'UPDATE' and v_rol in ('doctor', 'paciente') then
    if (new.paciente_id, new.doctor_id, new.fecha_hora, new.duracion_minutos, new.motivo)
       is distinct from (old.paciente_id, old.doctor_id, old.fecha_hora, old.duracion_minutos, old.motivo) then
      raise exception using errcode = '42501',
        message = 'ACCESO_DENEGADO: solo puedes cambiar el estado de la cita; para moverla pide a recepción que la reprograme';
    end if;

    if new.estado is distinct from old.estado then
      if not v_activa_antes then
        raise exception using errcode = 'PT422',
          message = format('TRANSICION_INVALIDA: la cita ya está %s y no cambia de estado', old.estado);
      end if;
      if v_rol = 'paciente' and new.estado <> 'cancelada' then
        raise exception using errcode = 'PT422',
          message = 'TRANSICION_INVALIDA: el paciente solo puede cancelar su cita';
      end if;
      if v_rol = 'doctor' and new.estado not in ('confirmada', 'atendida', 'no_asistio') then
        raise exception using errcode = 'PT422',
          message = 'TRANSICION_INVALIDA: el doctor solo puede marcar la cita como confirmada, atendida o no_asistio';
      end if;
    end if;
  end if;

  -- Una cita que no está activa no ocupa horario.
  if new.estado not in ('programada', 'confirmada') then
    return new;
  end if;

  -- Si ya estaba activa y no cambió el horario, el doctor ni el paciente, no hay nada que revisar.
  if v_activa_antes
     and (new.doctor_id, new.paciente_id, new.fecha_hora, new.duracion_minutos)
         is not distinct from (old.doctor_id, old.paciente_id, old.fecha_hora, old.duracion_minutos) then
    return new;
  end if;

  if not exists (
    select 1 from public.personal p
    join public.tipos_personal tp on tp.id = p.tipo_personal_id
    where p.id = new.doctor_id and p.activo and tp.es_medico
  ) then
    raise exception using errcode = 'PT422',
      message = 'REGLA_DE_NEGOCIO: el empleado indicado no es un médico activo';
  end if;

  -- Serializa por doctor y por paciente (siempre en ese orden, sin riesgo de deadlock).
  perform pg_advisory_xact_lock(hashtextextended('cita-doctor:' || new.doctor_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('cita-paciente:' || new.paciente_id::text, 0));

  select c.fecha_hora into v_choque
  from public.citas c
  where c.doctor_id = new.doctor_id
    and c.id <> new.id
    and c.estado in ('programada', 'confirmada')
    and public.rango_cita(c.fecha_hora, c.duracion_minutos) && public.rango_cita(new.fecha_hora, new.duracion_minutos)
  limit 1;
  if found then
    raise exception using errcode = 'PT409', message = format(
      'CITA_DUPLICADA: el doctor ya tiene una cita el %s',
      to_char(v_choque at time zone 'America/El_Salvador', 'DD/MM/YYYY "a las" HH24:MI'));
  end if;

  select c.fecha_hora into v_choque
  from public.citas c
  where c.paciente_id = new.paciente_id
    and c.id <> new.id
    and c.estado in ('programada', 'confirmada')
    and public.rango_cita(c.fecha_hora, c.duracion_minutos) && public.rango_cita(new.fecha_hora, new.duracion_minutos)
  limit 1;
  if found then
    raise exception using errcode = 'PT409', message = format(
      'CITA_DUPLICADA: el paciente ya tiene una cita el %s',
      to_char(v_choque at time zone 'America/El_Salvador', 'DD/MM/YYYY "a las" HH24:MI'));
  end if;

  if not public.doctor_de_turno(new.doctor_id, new.fecha_hora, new.duracion_minutos) then
    raise exception using errcode = 'PT422', message = format(
      'CITA_FUERA_DE_TURNO: el doctor no está de turno el %s de %s a %s',
      to_char(new.fecha_hora at time zone 'America/El_Salvador', 'DD/MM/YYYY'),
      to_char(new.fecha_hora at time zone 'America/El_Salvador', 'HH24:MI'),
      to_char((new.fecha_hora + make_interval(mins => new.duracion_minutos)) at time zone 'America/El_Salvador', 'HH24:MI'));
  end if;

  return new;
end;
$function$;

create trigger citas_validar
  before insert or update on public.citas
  for each row execute function public.validar_cita();

-- -----------------------------------------------------------------------------
-- 4. RLS
--    Turnos: todos los usuarios con sesión los leen; admin y recepción los crean y editan;
--            solo admin los borra.
--    Citas:  admin y recepción ven todas; el doctor solo las suyas; el paciente solo las suyas.
--            Nadie inserta directo: se crean con crear_cita() (valida el turno del doctor).
-- -----------------------------------------------------------------------------
revoke all on table public.turnos_personal, public.citas from anon;

create policy turnos_leer on public.turnos_personal
  for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy turnos_crear on public.turnos_personal
  for insert to authenticated
  with check ((select public.rol_actual()) in ('administrador', 'recepcionista'));

create policy turnos_editar on public.turnos_personal
  for update to authenticated
  using ((select public.rol_actual()) in ('administrador', 'recepcionista'))
  with check ((select public.rol_actual()) in ('administrador', 'recepcionista'));

create policy turnos_borrar on public.turnos_personal
  for delete to authenticated
  using ((select public.rol_actual()) = 'administrador');

create policy citas_leer on public.citas
  for select to authenticated
  using (
    (select public.rol_actual()) in ('administrador', 'recepcionista')
    or ((select public.rol_actual()) = 'doctor' and doctor_id = (select public.personal_actual_id()))
    or ((select public.rol_actual()) = 'paciente' and paciente_id = (select public.paciente_actual_id()))
  );

create policy citas_editar on public.citas
  for update to authenticated
  using (
    (select public.rol_actual()) in ('administrador', 'recepcionista')
    or ((select public.rol_actual()) = 'doctor' and doctor_id = (select public.personal_actual_id()))
    or ((select public.rol_actual()) = 'paciente' and paciente_id = (select public.paciente_actual_id()))
  )
  with check (
    (select public.rol_actual()) in ('administrador', 'recepcionista')
    or ((select public.rol_actual()) = 'doctor' and doctor_id = (select public.personal_actual_id()))
    or ((select public.rol_actual()) = 'paciente' and paciente_id = (select public.paciente_actual_id()))
  );

create policy citas_borrar on public.citas
  for delete to authenticated
  using ((select public.rol_actual()) in ('administrador', 'recepcionista'));

-- -----------------------------------------------------------------------------
-- 5. Vistas para los clientes. Corren con permisos del dueño (no ven el RLS de personal ni
--    pacientes), así que filtran con las mismas reglas de las políticas de arriba.
-- -----------------------------------------------------------------------------
create or replace view public.v_turnos as
select
  t.id,
  t.personal_id,
  p.nombres,
  p.apellidos,
  tp.nombre      as tipo_personal,
  tp.es_medico,
  p.especialidad_id,
  e.nombre       as especialidad,
  t.area,
  t.tipo_turno,
  t.fecha,
  t.hora_inicio,
  t.hora_fin,
  lower(public.rango_turno(t.fecha, t.hora_inicio, t.hora_fin)) at time zone 'America/El_Salvador' as inicio,
  upper(public.rango_turno(t.fecha, t.hora_inicio, t.hora_fin)) at time zone 'America/El_Salvador' as fin,
  t.notas
from public.turnos_personal t
join public.personal p on p.id = t.personal_id
join public.tipos_personal tp on tp.id = p.tipo_personal_id
left join public.especialidades e on e.id = p.especialidad_id
where public.rol_actual() is not null
   or (auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated'));

comment on view public.v_turnos is
  'Turnos con el nombre, tipo y especialidad del empleado; inicio/fin como timestamptz (HUNI-51).';

create or replace view public.v_citas as
select
  c.id,
  c.paciente_id,
  pa.nombres     as paciente_nombres,
  pa.apellidos   as paciente_apellidos,
  c.doctor_id,
  d.nombres      as doctor_nombres,
  d.apellidos    as doctor_apellidos,
  d.especialidad_id,
  e.nombre       as especialidad,
  c.fecha_hora,
  c.duracion_minutos,
  c.fecha_hora + make_interval(mins => c.duracion_minutos) as fecha_hora_fin,
  c.motivo,
  c.estado,
  c.created_at
from public.citas c
join public.pacientes pa on pa.id = c.paciente_id
join public.personal d on d.id = c.doctor_id
left join public.especialidades e on e.id = d.especialidad_id
where public.rol_actual() in ('administrador', 'recepcionista')
   or (public.rol_actual() = 'doctor' and c.doctor_id = public.personal_actual_id())
   or (public.rol_actual() = 'paciente' and c.paciente_id = public.paciente_actual_id())
   or (auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated'));

comment on view public.v_citas is
  'Citas con nombres de paciente y doctor, filtradas por rol como la política citas_leer (HUNI-51).';

revoke all on table public.v_turnos, public.v_citas from anon, authenticated;
grant select on table public.v_turnos, public.v_citas to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. RPC
-- -----------------------------------------------------------------------------
create or replace function public.crear_cita(
  p_paciente_id      uuid,
  p_doctor_id        uuid,
  p_fecha_hora       timestamptz,
  p_duracion_minutos integer default 30,
  p_motivo           text default null
)
  returns public.citas
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_cita public.citas;
begin
  perform public.exigir_rol(array['administrador', 'recepcionista']::public.rol_usuario[]);

  if p_paciente_id is null or p_doctor_id is null or p_fecha_hora is null then
    raise exception using errcode = 'PT400',
      message = 'SOLICITUD_INVALIDA: p_paciente_id, p_doctor_id y p_fecha_hora son obligatorios';
  end if;
  if p_duracion_minutos is null or p_duracion_minutos not between 5 and 240 then
    raise exception using errcode = 'PT400',
      message = 'SOLICITUD_INVALIDA: la duración debe estar entre 5 y 240 minutos';
  end if;
  if p_fecha_hora < now() then
    raise exception using errcode = 'PT422', message = 'REGLA_DE_NEGOCIO: la cita no puede quedar en el pasado';
  end if;
  if not exists (select 1 from public.pacientes pa where pa.id = p_paciente_id and pa.activo) then
    raise exception using errcode = 'PT400',
      message = 'REFERENCIA_INVALIDA: el paciente no existe o está desactivado';
  end if;
  if not exists (select 1 from public.personal p where p.id = p_doctor_id) then
    raise exception using errcode = 'PT400', message = 'REFERENCIA_INVALIDA: el doctor no existe';
  end if;

  insert into public.citas (paciente_id, doctor_id, fecha_hora, duracion_minutos, motivo)
  values (p_paciente_id, p_doctor_id, p_fecha_hora, p_duracion_minutos, nullif(trim(p_motivo), ''))
  returning * into v_cita;

  return v_cita;
exception
  -- Respaldo: otra transacción reservó el mismo horario justo al mismo tiempo.
  when exclusion_violation then
    raise exception using errcode = 'PT409',
      message = 'CITA_DUPLICADA: el horario se acaba de ocupar con otra cita; elige otro';
end;
$function$;

comment on function public.crear_cita(uuid, uuid, timestamptz, integer, text) is
  'Crea una cita (solo administrador y recepcionista). Valida turno del doctor y doble reserva (HUNI-51).';

create or replace function public.doctores_disponibles(
  p_fecha_hora       timestamptz,
  p_duracion_minutos integer default 30,
  p_especialidad_id  uuid default null,
  p_excluir_cita_id  uuid default null
)
  returns table (
    id              uuid,
    nombres         text,
    apellidos       text,
    tipo_personal   text,
    especialidad_id uuid,
    especialidad    text
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
#variable_conflict use_column
begin
  perform public.exigir_rol(array['administrador', 'recepcionista']::public.rol_usuario[]);

  if p_fecha_hora is null or p_duracion_minutos is null or p_duracion_minutos not between 5 and 240 then
    raise exception using errcode = 'PT400',
      message = 'SOLICITUD_INVALIDA: indica p_fecha_hora y una duración entre 5 y 240 minutos';
  end if;

  return query
  select p.id, p.nombres, p.apellidos, tp.nombre, p.especialidad_id, e.nombre
  from public.personal p
  join public.tipos_personal tp on tp.id = p.tipo_personal_id
  left join public.especialidades e on e.id = p.especialidad_id
  where p.activo
    and tp.es_medico
    and (p_especialidad_id is null or p.especialidad_id = p_especialidad_id)
    and public.doctor_de_turno(p.id, p_fecha_hora, p_duracion_minutos)
    and not exists (
      select 1 from public.citas c
      where c.doctor_id = p.id
        and c.estado in ('programada', 'confirmada')
        and (p_excluir_cita_id is null or c.id <> p_excluir_cita_id)
        and public.rango_cita(c.fecha_hora, c.duracion_minutos)
            && public.rango_cita(p_fecha_hora, p_duracion_minutos::smallint)
    )
  order by p.apellidos, p.nombres;
end;
$function$;

comment on function public.doctores_disponibles(timestamptz, integer, uuid, uuid) is
  'Médicos activos de turno en toda la franja y sin otra cita que se cruce. p_excluir_cita_id ignora la cita que se reprograma (HUNI-51).';

create or replace function public.reprogramar_cita(
  p_cita_id          uuid,
  p_fecha_hora       timestamptz default null,
  p_doctor_id        uuid default null,
  p_duracion_minutos integer default null
)
  returns public.citas
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_cita public.citas;
begin
  perform public.exigir_rol(array['administrador', 'recepcionista']::public.rol_usuario[]);

  select * into v_cita from public.citas c where c.id = p_cita_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: la cita no existe';
  end if;
  if v_cita.estado not in ('programada', 'confirmada') then
    raise exception using errcode = 'PT422', message = format(
      'TRANSICION_INVALIDA: solo se reprograman citas programadas o confirmadas (esta está %s)', v_cita.estado);
  end if;
  if p_fecha_hora is null and p_doctor_id is null and p_duracion_minutos is null then
    raise exception using errcode = 'PT400',
      message = 'SOLICITUD_INVALIDA: indica una nueva fecha, un nuevo doctor o ambos';
  end if;
  if p_duracion_minutos is not null and p_duracion_minutos not between 5 and 240 then
    raise exception using errcode = 'PT400',
      message = 'SOLICITUD_INVALIDA: la duración debe estar entre 5 y 240 minutos';
  end if;
  if coalesce(p_fecha_hora, v_cita.fecha_hora) < now() then
    raise exception using errcode = 'PT422', message = 'REGLA_DE_NEGOCIO: la cita no puede quedar en el pasado';
  end if;
  if p_doctor_id is not null and not exists (select 1 from public.personal p where p.id = p_doctor_id) then
    raise exception using errcode = 'PT400', message = 'REFERENCIA_INVALIDA: el doctor no existe';
  end if;

  update public.citas c
  set fecha_hora       = coalesce(p_fecha_hora, c.fecha_hora),
      doctor_id        = coalesce(p_doctor_id, c.doctor_id),
      duracion_minutos = coalesce(p_duracion_minutos, c.duracion_minutos),
      estado           = 'programada'
  where c.id = p_cita_id
  returning * into v_cita;

  return v_cita;
exception
  when exclusion_violation then
    raise exception using errcode = 'PT409',
      message = 'CITA_DUPLICADA: el horario se acaba de ocupar con otra cita; elige otro';
end;
$function$;

comment on function public.reprogramar_cita(uuid, timestamptz, uuid, integer) is
  'Cambia la fecha, el doctor o ambos de una cita activa (solo administrador y recepcionista); vuelve a quedar programada (HUNI-51).';

-- -----------------------------------------------------------------------------
-- Permisos de ejecución: nada para anon; las RPC y helpers para usuarios con sesión
-- -----------------------------------------------------------------------------
revoke execute on function
  public.rol_actual(),
  public.personal_actual_id(),
  public.paciente_actual_id(),
  public.exigir_rol(public.rol_usuario[]),
  public.rango_cita_local(timestamptz, integer),
  public.doctor_de_turno(uuid, timestamptz, integer),
  public.validar_turno(),
  public.validar_cita(),
  public.crear_cita(uuid, uuid, timestamptz, integer, text),
  public.doctores_disponibles(timestamptz, integer, uuid, uuid),
  public.reprogramar_cita(uuid, timestamptz, uuid, integer)
from public, anon, authenticated;

grant execute on function
  public.rol_actual(),
  public.personal_actual_id(),
  public.paciente_actual_id(),
  public.exigir_rol(public.rol_usuario[]),
  public.rango_cita_local(timestamptz, integer),
  public.doctor_de_turno(uuid, timestamptz, integer),
  public.crear_cita(uuid, uuid, timestamptz, integer, text),
  public.doctores_disponibles(timestamptz, integer, uuid, uuid),
  public.reprogramar_cita(uuid, timestamptz, uuid, integer)
to authenticated, service_role;
