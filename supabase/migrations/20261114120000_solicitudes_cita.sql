-- =============================================================================
-- HUNI-56: solicitudes de cita del paciente
--
-- El paciente no crea citas: pide atención (motivo, especialidad, preferencia) y recepción la
-- aprueba (se crea la cita 'programada' con crear_cita) o la rechaza con una respuesta.
--
--   1. Estado y tabla solicitudes_cita
--   2. RLS: el paciente ve las suyas; administrador y recepcionista ven todas; nadie escribe directo
--   3. Vista v_solicitudes_cita (con nombres y la cita creada)
--   4. RPC: solicitar_cita(), cancelar_solicitud_cita(), aprobar_solicitud_cita(), rechazar_solicitud_cita()
--   5. Realtime: solicitudes_cita y citas
--
-- Los errores se lanzan como 'CODIGO: detalle' con SQLSTATE PTxxx, igual que en HUNI-51.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabla
-- -----------------------------------------------------------------------------
create type public.estado_solicitud_cita as enum ('pendiente', 'aprobada', 'rechazada', 'cancelada');

create table public.solicitudes_cita (
  id               uuid primary key default gen_random_uuid(),
  paciente_id      uuid not null references public.pacientes (id) on delete restrict,
  motivo           text not null check (length(btrim(motivo)) > 0),
  especialidad     text not null check (length(btrim(especialidad)) > 0),
  fecha_preferida  date,
  franja           text check (franja in ('manana', 'tarde', 'cualquiera')),
  estado           public.estado_solicitud_cita not null default 'pendiente',
  respuesta        text,
  cita_id          uuid references public.citas (id) on delete set null,
  resuelta_por     uuid references public.perfiles (id) on delete set null,
  resuelta_en      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index solicitudes_cita_paciente_idx on public.solicitudes_cita (paciente_id, created_at desc);
create index solicitudes_cita_estado_idx on public.solicitudes_cita (estado, created_at);

create trigger solicitudes_cita_updated_at
  before update on public.solicitudes_cita
  for each row execute function public.set_updated_at();

comment on table public.solicitudes_cita is
  'Solicitud de atención del paciente; recepción la aprueba (crea la cita) o la rechaza (HUNI-56).';

-- -----------------------------------------------------------------------------
-- 2. RLS: solo lectura directa; todo cambio pasa por las RPC de abajo (security definer)
-- -----------------------------------------------------------------------------
alter table public.solicitudes_cita enable row level security;

revoke all on table public.solicitudes_cita from anon, authenticated;
grant select on table public.solicitudes_cita to authenticated;
grant all on table public.solicitudes_cita to service_role;

create policy solicitudes_cita_leer on public.solicitudes_cita
  for select to authenticated
  using (
    (select public.rol_actual()) in ('administrador', 'recepcionista')
    or ((select public.rol_actual()) = 'paciente' and paciente_id = (select public.paciente_actual_id()))
  );

-- -----------------------------------------------------------------------------
-- 3. Vista para los clientes. Corre con permisos del dueño, así que filtra con las mismas
--    reglas de la política de arriba (igual que v_citas).
-- -----------------------------------------------------------------------------
create or replace view public.v_solicitudes_cita as
select
  s.id,
  s.paciente_id,
  pa.nombres      as paciente_nombres,
  pa.apellidos    as paciente_apellidos,
  s.motivo,
  s.especialidad,
  s.fecha_preferida,
  s.franja,
  s.estado,
  s.respuesta,
  s.cita_id,
  c.fecha_hora    as cita_fecha_hora,
  s.resuelta_en,
  s.created_at
from public.solicitudes_cita s
join public.pacientes pa on pa.id = s.paciente_id
left join public.citas c on c.id = s.cita_id
where public.rol_actual() in ('administrador', 'recepcionista')
   or (public.rol_actual() = 'paciente' and s.paciente_id = public.paciente_actual_id())
   or (auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated'));

comment on view public.v_solicitudes_cita is
  'Solicitudes de cita con nombre del paciente y la cita creada, filtradas por rol como solicitudes_cita_leer (HUNI-56).';

revoke all on table public.v_solicitudes_cita from anon, authenticated;
grant select on table public.v_solicitudes_cita to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RPC
-- -----------------------------------------------------------------------------
create or replace function public.solicitar_cita(
  p_motivo          text,
  p_especialidad    text,
  p_fecha_preferida date default null,
  p_franja          text default 'cualquiera'
)
  returns public.solicitudes_cita
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_paciente uuid;
  v_solicitud public.solicitudes_cita;
begin
  perform public.exigir_rol(array['paciente']::public.rol_usuario[]);

  v_paciente := public.paciente_actual_id();
  if v_paciente is null then
    raise exception using errcode = 'PT422',
      message = 'REGLA_DE_NEGOCIO: tu cuenta no tiene un expediente de paciente asociado';
  end if;
  if nullif(btrim(p_motivo), '') is null or nullif(btrim(p_especialidad), '') is null then
    raise exception using errcode = 'PT400',
      message = 'SOLICITUD_INVALIDA: p_motivo y p_especialidad son obligatorios';
  end if;
  if coalesce(p_franja, 'cualquiera') not in ('manana', 'tarde', 'cualquiera') then
    raise exception using errcode = 'PT400',
      message = 'SOLICITUD_INVALIDA: p_franja debe ser manana, tarde o cualquiera';
  end if;

  insert into public.solicitudes_cita (paciente_id, motivo, especialidad, fecha_preferida, franja)
  values (v_paciente, btrim(p_motivo), btrim(p_especialidad), p_fecha_preferida, coalesce(p_franja, 'cualquiera'))
  returning * into v_solicitud;

  return v_solicitud;
end;
$function$;

comment on function public.solicitar_cita(text, text, date, text) is
  'El paciente pide atención; queda pendiente hasta que recepción la resuelva (HUNI-56).';

create or replace function public.cancelar_solicitud_cita(p_id uuid)
  returns public.solicitudes_cita
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_solicitud public.solicitudes_cita;
begin
  perform public.exigir_rol(array['paciente']::public.rol_usuario[]);

  select * into v_solicitud
  from public.solicitudes_cita s
  where s.id = p_id and s.paciente_id = public.paciente_actual_id()
  for update;

  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: la solicitud no existe';
  end if;
  if v_solicitud.estado <> 'pendiente' then
    raise exception using errcode = 'PT409',
      message = 'SOLICITUD_YA_RESUELTA: la solicitud ya fue ' || v_solicitud.estado::text;
  end if;

  update public.solicitudes_cita
  set estado = 'cancelada', resuelta_en = now()
  where id = p_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$function$;

comment on function public.cancelar_solicitud_cita(uuid) is
  'El paciente retira su solicitud mientras sigue pendiente (HUNI-56).';

create or replace function public.aprobar_solicitud_cita(
  p_id               uuid,
  p_doctor_id        uuid,
  p_fecha_hora       timestamptz,
  p_duracion_minutos integer default 30
)
  returns public.solicitudes_cita
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_solicitud public.solicitudes_cita;
  v_cita public.citas;
begin
  perform public.exigir_rol(array['administrador', 'recepcionista']::public.rol_usuario[]);

  select * into v_solicitud from public.solicitudes_cita s where s.id = p_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: la solicitud no existe';
  end if;
  if v_solicitud.estado <> 'pendiente' then
    raise exception using errcode = 'PT409',
      message = 'SOLICITUD_YA_RESUELTA: la solicitud ya fue ' || v_solicitud.estado::text;
  end if;

  -- crear_cita valida turno del doctor, doble reserva y fecha; la cita nace 'programada'.
  v_cita := public.crear_cita(v_solicitud.paciente_id, p_doctor_id, p_fecha_hora, p_duracion_minutos, v_solicitud.motivo);

  update public.solicitudes_cita
  set estado = 'aprobada', cita_id = v_cita.id, resuelta_por = auth.uid(), resuelta_en = now()
  where id = p_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$function$;

comment on function public.aprobar_solicitud_cita(uuid, uuid, timestamptz, integer) is
  'Recepción aprueba la solicitud: asigna doctor y fecha y crea la cita programada (HUNI-56).';

create or replace function public.rechazar_solicitud_cita(p_id uuid, p_respuesta text)
  returns public.solicitudes_cita
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_solicitud public.solicitudes_cita;
begin
  perform public.exigir_rol(array['administrador', 'recepcionista']::public.rol_usuario[]);

  if nullif(btrim(p_respuesta), '') is null then
    raise exception using errcode = 'PT400', message = 'SOLICITUD_INVALIDA: p_respuesta es obligatoria';
  end if;

  select * into v_solicitud from public.solicitudes_cita s where s.id = p_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: la solicitud no existe';
  end if;
  if v_solicitud.estado <> 'pendiente' then
    raise exception using errcode = 'PT409',
      message = 'SOLICITUD_YA_RESUELTA: la solicitud ya fue ' || v_solicitud.estado::text;
  end if;

  update public.solicitudes_cita
  set estado = 'rechazada', respuesta = btrim(p_respuesta), resuelta_por = auth.uid(), resuelta_en = now()
  where id = p_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$function$;

comment on function public.rechazar_solicitud_cita(uuid, text) is
  'Recepción rechaza la solicitud con una respuesta que ve el paciente (HUNI-56).';

revoke execute on function
  public.solicitar_cita(text, text, date, text),
  public.cancelar_solicitud_cita(uuid),
  public.aprobar_solicitud_cita(uuid, uuid, timestamptz, integer),
  public.rechazar_solicitud_cita(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.solicitar_cita(text, text, date, text),
  public.cancelar_solicitud_cita(uuid),
  public.aprobar_solicitud_cita(uuid, uuid, timestamptz, integer),
  public.rechazar_solicitud_cita(uuid, text)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Realtime (RLS limita los eventos a las filas que cada usuario puede leer)
-- -----------------------------------------------------------------------------
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'solicitudes_cita') then
      alter publication supabase_realtime add table public.solicitudes_cita;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'citas') then
      alter publication supabase_realtime add table public.citas;
    end if;
  end if;
end
$realtime$;
