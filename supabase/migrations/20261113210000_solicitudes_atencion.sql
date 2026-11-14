-- =============================================================================
-- HUNI-56: solicitudes de atención del paciente (iOS → bandeja de recepción en Android)
--
--   1. Tabla `solicitudes_atencion`: motivo, especialidad y día/franja preferidos; estado
--      pendiente → atendida (con la cita que se agendó) o rechazada (con la respuesta de recepción).
--   2. RLS de lectura: el paciente ve las suyas; recepción y administración, todas. Nadie escribe directo.
--   3. Vista `v_solicitudes_atencion` con el nombre del paciente y de la especialidad para la bandeja.
--   4. RPC: `crear_solicitud_atencion()` (paciente) y `responder_solicitud_atencion()` (recepción/admin).
--   5. Realtime: la tabla se publica para que la bandeja vea las nuevas sin recargar.
--
-- Errores como 'CODIGO: detalle' con SQLSTATE PTxxx (mismo patrón que HUNI-51).
-- =============================================================================

create type public.estado_solicitud_atencion as enum ('pendiente', 'atendida', 'rechazada');
create type public.franja_horaria as enum ('manana', 'tarde', 'cualquiera');

-- -----------------------------------------------------------------------------
-- 1. Tabla
-- -----------------------------------------------------------------------------
create table public.solicitudes_atencion (
  id               uuid                             not null default gen_random_uuid(),
  paciente_id      uuid                             not null,
  motivo           text                             not null,
  especialidad_id  uuid,
  fecha_preferida  date,
  franja           public.franja_horaria            not null default 'cualquiera',
  estado           public.estado_solicitud_atencion not null default 'pendiente',
  cita_id          uuid,
  respuesta        text,
  respondida_por   uuid,
  respondida_en    timestamp with time zone,
  created_at       timestamp with time zone         not null default now(),
  updated_at       timestamp with time zone         not null default now(),
  constraint solicitudes_atencion_pkey primary key (id),
  constraint solicitudes_atencion_paciente_id_fkey
    foreign key (paciente_id) references public.pacientes (id) on delete cascade,
  constraint solicitudes_atencion_especialidad_id_fkey
    foreign key (especialidad_id) references public.especialidades (id) on delete set null,
  constraint solicitudes_atencion_cita_id_fkey
    foreign key (cita_id) references public.citas (id) on delete set null,
  constraint solicitudes_atencion_respondida_por_fkey
    foreign key (respondida_por) references public.perfiles (id) on delete set null,
  constraint solicitudes_atencion_motivo_check check (char_length(btrim(motivo)) between 3 and 500),
  -- Una solicitud respondida siempre dice quién y cuándo; una pendiente no tiene respuesta.
  constraint solicitudes_atencion_respuesta_check check (
    (estado = 'pendiente' and respondida_en is null and cita_id is null)
    or (estado <> 'pendiente' and respondida_en is not null)
  )
);

create index solicitudes_atencion_paciente_idx on public.solicitudes_atencion (paciente_id, created_at desc);
create index solicitudes_atencion_pendientes_idx on public.solicitudes_atencion (created_at)
  where estado = 'pendiente';

create trigger solicitudes_atencion_updated_at
  before update on public.solicitudes_atencion
  for each row execute function public.set_updated_at();

comment on table public.solicitudes_atencion is
  'Solicitudes de atención que el paciente envía desde iOS; recepción las atiende agendando una cita o las rechaza (HUNI-56).';

-- -----------------------------------------------------------------------------
-- 2. RLS: solo lectura directa; las escrituras van por las RPC de abajo
-- -----------------------------------------------------------------------------
alter table public.solicitudes_atencion enable row level security;

revoke all on table public.solicitudes_atencion from anon, authenticated;
grant select on table public.solicitudes_atencion to authenticated;
grant all on table public.solicitudes_atencion to service_role;

create policy solicitudes_atencion_leer on public.solicitudes_atencion
  for select to authenticated
  using (
    (select public.rol_actual()) in ('administrador', 'recepcionista')
    or ((select public.rol_actual()) = 'paciente' and paciente_id = (select public.paciente_actual_id()))
  );

-- -----------------------------------------------------------------------------
-- 3. Vista para clientes (corre con permisos del dueño: filtra con las mismas reglas de la política)
-- -----------------------------------------------------------------------------
create or replace view public.v_solicitudes_atencion as
select
  s.id,
  s.paciente_id,
  pa.nombres     as paciente_nombres,
  pa.apellidos   as paciente_apellidos,
  s.motivo,
  s.especialidad_id,
  e.nombre       as especialidad,
  s.fecha_preferida,
  s.franja,
  s.estado,
  s.cita_id,
  s.respuesta,
  s.respondida_en,
  s.created_at
from public.solicitudes_atencion s
join public.pacientes pa on pa.id = s.paciente_id
left join public.especialidades e on e.id = s.especialidad_id
where public.rol_actual() in ('administrador', 'recepcionista')
   or (public.rol_actual() = 'paciente' and s.paciente_id = public.paciente_actual_id())
   or (auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated'));

comment on view public.v_solicitudes_atencion is
  'Solicitudes de atención con nombre del paciente y especialidad, filtradas por rol como su política (HUNI-56).';

revoke all on table public.v_solicitudes_atencion from anon, authenticated;
grant select on table public.v_solicitudes_atencion to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RPC
-- -----------------------------------------------------------------------------
create or replace function public.crear_solicitud_atencion(
  p_motivo          text,
  p_especialidad_id uuid default null,
  p_fecha_preferida date default null,
  p_franja          public.franja_horaria default 'cualquiera'
)
  returns public.solicitudes_atencion
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_paciente_id uuid;
  v_solicitud   public.solicitudes_atencion;
begin
  perform public.exigir_rol(array['paciente']::public.rol_usuario[]);

  v_paciente_id := public.paciente_actual_id();
  if v_paciente_id is null then
    raise exception using errcode = '42501', message = 'PERFIL_INCOMPLETO: la cuenta no tiene registro de paciente';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 500 then
    raise exception using errcode = 'PT400',
      message = 'SOLICITUD_INVALIDA: el motivo debe tener entre 3 y 500 caracteres';
  end if;
  if p_fecha_preferida is not null and p_fecha_preferida < public.hoy_local() then
    raise exception using errcode = 'PT422', message = 'REGLA_DE_NEGOCIO: el día preferido no puede estar en el pasado';
  end if;
  if p_especialidad_id is not null
     and not exists (select 1 from public.especialidades e where e.id = p_especialidad_id) then
    raise exception using errcode = 'PT400', message = 'REFERENCIA_INVALIDA: la especialidad no existe';
  end if;
  -- Evita que una misma persona llene la bandeja mientras recepción no responde.
  if (select count(*) from public.solicitudes_atencion s
      where s.paciente_id = v_paciente_id and s.estado = 'pendiente') >= 3 then
    raise exception using errcode = 'PT422',
      message = 'REGLA_DE_NEGOCIO: ya tienes 3 solicitudes pendientes; espera a que recepción las atienda';
  end if;

  insert into public.solicitudes_atencion (paciente_id, motivo, especialidad_id, fecha_preferida, franja)
  values (v_paciente_id, btrim(p_motivo), p_especialidad_id, p_fecha_preferida, coalesce(p_franja, 'cualquiera'))
  returning * into v_solicitud;

  return v_solicitud;
end;
$function$;

comment on function public.crear_solicitud_atencion(text, uuid, date, public.franja_horaria) is
  'El paciente de la sesión envía una solicitud de atención (máximo 3 pendientes) (HUNI-56).';

create or replace function public.responder_solicitud_atencion(
  p_solicitud_id uuid,
  p_estado       public.estado_solicitud_atencion,
  p_cita_id      uuid default null,
  p_respuesta    text default null
)
  returns public.solicitudes_atencion
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_solicitud public.solicitudes_atencion;
begin
  perform public.exigir_rol(array['administrador', 'recepcionista']::public.rol_usuario[]);

  if p_estado is null or p_estado = 'pendiente' then
    raise exception using errcode = 'PT400', message = 'SOLICITUD_INVALIDA: responde con atendida o rechazada';
  end if;

  select * into v_solicitud from public.solicitudes_atencion s where s.id = p_solicitud_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: la solicitud no existe';
  end if;
  if v_solicitud.estado <> 'pendiente' then
    raise exception using errcode = 'PT422',
      message = format('TRANSICION_INVALIDA: la solicitud ya está %s', v_solicitud.estado);
  end if;
  if p_estado = 'rechazada' and p_cita_id is not null then
    raise exception using errcode = 'PT400', message = 'SOLICITUD_INVALIDA: una solicitud rechazada no lleva cita';
  end if;
  if p_cita_id is not null and not exists (
    select 1 from public.citas c where c.id = p_cita_id and c.paciente_id = v_solicitud.paciente_id
  ) then
    raise exception using errcode = 'PT400',
      message = 'REFERENCIA_INVALIDA: la cita no existe o es de otro paciente';
  end if;

  update public.solicitudes_atencion s
  set estado         = p_estado,
      cita_id        = p_cita_id,
      respuesta      = nullif(btrim(p_respuesta), ''),
      respondida_por = auth.uid(),
      respondida_en  = now()
  where s.id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$function$;

comment on function public.responder_solicitud_atencion(uuid, public.estado_solicitud_atencion, uuid, text) is
  'Recepción o administración marca una solicitud pendiente como atendida (con la cita agendada) o rechazada (HUNI-56).';

revoke execute on function
  public.crear_solicitud_atencion(text, uuid, date, public.franja_horaria),
  public.responder_solicitud_atencion(uuid, public.estado_solicitud_atencion, uuid, text)
from public, anon, authenticated;

grant execute on function
  public.crear_solicitud_atencion(text, uuid, date, public.franja_horaria),
  public.responder_solicitud_atencion(uuid, public.estado_solicitud_atencion, uuid, text)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Realtime (el RLS de lectura decide quién recibe cada cambio)
-- -----------------------------------------------------------------------------
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public'
                       and tablename = 'solicitudes_atencion') then
    alter publication supabase_realtime add table public.solicitudes_atencion;
  end if;
end
$realtime$;
