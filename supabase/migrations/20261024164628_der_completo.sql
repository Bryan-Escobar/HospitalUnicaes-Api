-- =============================================================================
-- HUNI-37: completa el esquema según el DER (HUNI-34)
--   1. Tipos de personal como catálogo editable (antes enum)
--   2. Personal sin cuenta de usuario
--   3. Pacientes desactivables
--   4. Consultas que se cierran y ya no se editan
--   5. Turnos sin solape (exclusion constraint)
--   6. Citas con duración y sin doble reserva (exclusion constraint)
--   7. Vista v_dashboard_summary
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Catálogo de tipos de personal
-- -----------------------------------------------------------------------------
create table public.tipos_personal (
  id           uuid        not null default gen_random_uuid(),
  nombre       text        not null,
  rol_sugerido public.rol_usuario,
  es_medico    boolean     not null default false,
  activo       boolean     not null default true,
  created_at   timestamptz not null default now(),
  constraint tipos_personal_pkey primary key (id),
  constraint tipos_personal_nombre_key unique (nombre),
  constraint tipos_personal_nombre_check check (length(trim(nombre)) > 0)
);

comment on table public.tipos_personal is
  'Catálogo editable de tipos de personal (HUNI-34). El tipo no da permisos: solo etiqueta turnos y filtros.';
comment on column public.tipos_personal.rol_sugerido is
  'Rol que se sugiere al crear la cuenta de un empleado de este tipo (HUNI-95). null = sin cuenta por defecto.';
comment on column public.tipos_personal.es_medico is
  'Si aparece en "médicos de turno" del endpoint público.';

alter table public.tipos_personal enable row level security;

-- Tipos iniciales con el mapeo tipo → rol de HUNI-95
insert into public.tipos_personal (nombre, rol_sugerido, es_medico) values
  ('Doctor',               'doctor',        true),
  ('Alergista',            'doctor',        true),
  ('Médico de emergencia', 'doctor',        true),
  ('Enfermero/a',          'recepcionista', false),
  ('Asistente',            'recepcionista', false),
  ('Recepcionista',        'recepcionista', false),
  ('Administrativo',       'administrador', false);

-- Migra personal.tipo (enum) → personal.tipo_personal_id
alter table public.personal add column tipo_personal_id uuid;

update public.personal p
set tipo_personal_id = t.id
from public.tipos_personal t
where t.nombre = case p.tipo::text
  when 'doctor'         then 'Doctor'
  when 'alergista'      then 'Alergista'
  when 'emergencista'   then 'Médico de emergencia'
  when 'enfermero'      then 'Enfermero/a'
  when 'asistente'      then 'Asistente'
  when 'recepcionista'  then 'Recepcionista'
  when 'administrativo' then 'Administrativo'
end;

alter table public.personal
  alter column tipo_personal_id set not null,
  add constraint personal_tipo_personal_id_fkey
    foreign key (tipo_personal_id) references public.tipos_personal (id) on delete restrict,
  drop column tipo;

drop type public.tipo_personal;

create index personal_tipo_personal_id_idx on public.personal using btree (tipo_personal_id);

-- -----------------------------------------------------------------------------
-- 2. Personal sin cuenta: la cuenta (perfil) es opcional; nombre propio en personal
-- -----------------------------------------------------------------------------
alter table public.personal
  add column nombres   text,
  add column apellidos text,
  add column telefono  text;

update public.personal p
set nombres = pf.nombres, apellidos = pf.apellidos, telefono = pf.telefono
from public.perfiles pf
where pf.id = p.perfil_id;

alter table public.personal
  alter column nombres set not null,
  alter column apellidos set not null,
  alter column perfil_id drop not null,
  add constraint personal_nombres_check check (length(trim(nombres)) > 0);

comment on column public.personal.perfil_id is
  'Cuenta de acceso. null = empleado sin login (solo aparece en turnos).';

-- -----------------------------------------------------------------------------
-- 3. Pacientes desactivables (sin borrar su historial)
-- -----------------------------------------------------------------------------
alter table public.pacientes add column activo boolean not null default true;

-- -----------------------------------------------------------------------------
-- 4. Consultas cerradas: no se editan ni se les agregan registros
-- -----------------------------------------------------------------------------
alter table public.consultas add column cerrada_en timestamptz;

comment on column public.consultas.cerrada_en is
  'Momento en que el doctor cerró la consulta. Cerrada = no se edita (HUNI-57).';

create or replace function public.proteger_consulta_cerrada()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if old.cerrada_en is not null then
    raise exception 'CONSULTA_CERRADA: la consulta % ya está cerrada', old.id
      using errcode = 'P0001', hint = 'Las consultas cerradas no se pueden modificar';
  end if;
  return new;
end;
$function$;

create trigger consultas_proteger_cerrada
  before update on public.consultas
  for each row execute function public.proteger_consulta_cerrada();

-- Diagnósticos, recetas y órdenes de laboratorio de una consulta cerrada tampoco cambian
create or replace function public.verificar_consulta_abierta()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_consulta_id uuid := case when tg_op = 'DELETE' then old.consulta_id else new.consulta_id end;
begin
  if exists (select 1 from public.consultas c where c.id = v_consulta_id and c.cerrada_en is not null) then
    raise exception 'CONSULTA_CERRADA: la consulta % ya está cerrada', v_consulta_id
      using errcode = 'P0001', hint = 'Las consultas cerradas no se pueden modificar';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger diagnosticos_consulta_abierta
  before insert or update or delete on public.diagnosticos
  for each row execute function public.verificar_consulta_abierta();

create trigger recetas_consulta_abierta
  before insert or update or delete on public.recetas
  for each row execute function public.verificar_consulta_abierta();

create trigger ordenes_laboratorio_consulta_abierta
  before insert or delete on public.ordenes_laboratorio
  for each row execute function public.verificar_consulta_abierta();

-- -----------------------------------------------------------------------------
-- 5. Turnos sin solape para el mismo empleado
--    Un turno que termina a una hora menor o igual a la de inicio cruza la medianoche.
-- -----------------------------------------------------------------------------
create or replace function public.rango_turno(p_fecha date, p_inicio time, p_fin time)
  returns tsrange
  language sql
  immutable
  parallel safe
  set search_path to ''
  as $function$
  select tsrange(
    p_fecha + p_inicio,
    case when p_fin > p_inicio then p_fecha + p_fin else (p_fecha + 1) + p_fin end
  );
$function$;

comment on function public.rango_turno(date, time, time) is
  'Intervalo de un turno; si hora_fin <= hora_inicio, termina al día siguiente (turno nocturno).';

alter table public.turnos_personal
  add constraint turnos_personal_horas_check check (hora_inicio <> hora_fin),
  add constraint turnos_personal_sin_solape exclude using gist (
    personal_id with =,
    public.rango_turno(fecha, hora_inicio, hora_fin) with &&
  );

-- -----------------------------------------------------------------------------
-- 6. Citas con duración: ni el doctor ni el paciente tienen dos citas activas que se crucen
-- -----------------------------------------------------------------------------
alter table public.citas
  add column duracion_minutos smallint not null default 30,
  add constraint citas_duracion_minutos_check check (duracion_minutos between 5 and 240);

-- Solo suma minutos (sin días ni meses), así que no depende de la zona horaria: es inmutable.
create or replace function public.rango_cita(p_inicio timestamptz, p_minutos smallint)
  returns tstzrange
  language sql
  immutable
  parallel safe
  set search_path to ''
  as $function$
  select tstzrange(p_inicio, p_inicio + make_interval(mins => p_minutos::integer));
$function$;

-- Reemplaza el índice que solo bloqueaba la misma hora exacta
drop index if exists public.citas_doctor_hora_unica;

alter table public.citas
  add constraint citas_doctor_sin_solape exclude using gist (
    doctor_id with =,
    public.rango_cita(fecha_hora, duracion_minutos) with &&
  ) where (estado in ('programada', 'confirmada')),
  add constraint citas_paciente_sin_solape exclude using gist (
    paciente_id with =,
    public.rango_cita(fecha_hora, duracion_minutos) with &&
  ) where (estado in ('programada', 'confirmada'));

create index citas_doctor_id_idx on public.citas using btree (doctor_id);

-- -----------------------------------------------------------------------------
-- 7. Vista del dashboard administrativo (HUNI-45). Una sola fila, solo agregados.
--    Horario local: America/El_Salvador.
-- -----------------------------------------------------------------------------
create or replace view public.v_dashboard_summary
  with (security_invoker = true)
  as
with ahora as (
  select now() as ts, (now() at time zone 'America/El_Salvador') as local_ts
),
camas_ocupacion as (
  select
    h.tipo,
    count(*)                                          as total,
    count(*) filter (where hz.id is not null)         as ocupadas
  from public.camas c
  join public.habitaciones h on h.id = c.habitacion_id and h.activa
  left join public.hospitalizaciones hz on hz.cama_id = c.id and hz.fecha_alta is null
  group by h.tipo
),
turnos_ahora as (
  select tp.nombre as tipo
  from public.turnos_personal t
  join public.personal p on p.id = t.personal_id and p.activo
  join public.tipos_personal tp on tp.id = p.tipo_personal_id
  cross join ahora a
  where public.rango_turno(t.fecha, t.hora_inicio, t.hora_fin) @> a.local_ts
),
citas_hoy as (
  select ci.estado
  from public.citas ci
  cross join ahora a
  where (ci.fecha_hora at time zone 'America/El_Salvador')::date = a.local_ts::date
)
select
  coalesce((select total    from camas_ocupacion where tipo = 'vip'), 0)::int          as vip_total,
  coalesce((select ocupadas from camas_ocupacion where tipo = 'vip'), 0)::int          as vip_ocupadas,
  coalesce((select total    from camas_ocupacion where tipo = 'semiprivada'), 0)::int  as semiprivada_total,
  coalesce((select ocupadas from camas_ocupacion where tipo = 'semiprivada'), 0)::int  as semiprivada_ocupadas,
  (select count(*) from turnos_ahora)::int                                             as personal_de_turno,
  coalesce(
    (select jsonb_agg(jsonb_build_object('tipo', tipo, 'cantidad', n) order by tipo)
       from (select tipo, count(*) as n from turnos_ahora group by tipo) x),
    '[]'::jsonb
  )                                                                                    as personal_de_turno_por_tipo,
  (select am.estado from public.ambulancias am limit 1)                                as ambulancia_estado,
  (select s.id from public.solicitudes_ambulancia s
     where s.estado in ('despachada', 'en_curso') limit 1)                             as solicitud_activa_id,
  (select count(*) from citas_hoy)::int                                                as citas_hoy,
  coalesce(
    (select jsonb_agg(jsonb_build_object('estado', estado, 'cantidad', n) order by estado)
       from (select estado, count(*) as n from citas_hoy group by estado) x),
    '[]'::jsonb
  )                                                                                    as citas_hoy_por_estado,
  (select count(*) from public.ordenes_laboratorio where estado = 'pendiente')::int     as laboratorio_pendientes,
  (select count(*) from public.ordenes_laboratorio where estado = 'en_proceso')::int    as laboratorio_en_proceso,
  (select count(*) from public.inventario_items
     where activo and stock_actual < stock_minimo)::int                                as inventario_bajo_minimo,
  (select ts from ahora)                                                               as generado_en;

comment on view public.v_dashboard_summary is
  'Resumen del panel administrativo (HUNI-45): una fila con agregados, sin datos de pacientes. Solo lo lee la API.';

-- El dashboard es del administrador: se consulta solo desde la API, no directo desde los clientes
revoke all on public.v_dashboard_summary from anon, authenticated;
