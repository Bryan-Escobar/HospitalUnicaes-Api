alter table public.perfiles
  add column ultima_conexion_app_at timestamptz;

-- El historial permite conservar la primera apertura de cada turno aunque el doctor vuelva a entrar.
create table public.conexiones_app_medicos (
  personal_id uuid not null references public.personal(id) on delete cascade,
  conectada_at timestamptz not null,
  primary key (personal_id, conectada_at)
);

alter table public.conexiones_app_medicos enable row level security;
revoke all on table public.conexiones_app_medicos from public, anon, authenticated;
grant select, insert on table public.conexiones_app_medicos to service_role;

create function public.registrar_conexion_app(p_perfil_id uuid)
  returns timestamptz
  language plpgsql
  set search_path to ''
as $$
declare
  v_conectada_at timestamptz := statement_timestamp();
  v_ultima_conexion timestamptz;
begin
  update public.perfiles
  set ultima_conexion_app_at = greatest(ultima_conexion_app_at, v_conectada_at)
  where id = p_perfil_id and activo
  returning ultima_conexion_app_at into v_ultima_conexion;

  if not found then
    return null;
  end if;

  insert into public.conexiones_app_medicos (personal_id, conectada_at)
  select p.id, v_conectada_at
  from public.personal p
  join public.tipos_personal tp on tp.id = p.tipo_personal_id
  where p.perfil_id = p_perfil_id and p.activo and tp.es_medico
  on conflict do nothing;

  return v_ultima_conexion;
end;
$$;

revoke execute on function public.registrar_conexion_app(uuid) from public, anon, authenticated;
grant execute on function public.registrar_conexion_app(uuid) to service_role;

create or replace view public.v_turnos as
select
  t.id,
  t.personal_id,
  p.nombres,
  p.apellidos,
  tp.nombre as tipo_personal,
  tp.es_medico,
  p.especialidad_id,
  e.nombre as especialidad,
  t.area,
  t.tipo_turno,
  t.fecha,
  t.hora_inicio,
  t.hora_fin,
  horario.inicio,
  horario.fin,
  t.notas,
  case
    when not tp.es_medico or not acceso.puede_ver_asistencia then null
    when statement_timestamp() < horario.inicio then 'programado'
    when conexion.conectada_at <= horario.inicio + interval '15 minutes' then 'presente'
    when conexion.conectada_at is not null then 'tarde'
    when statement_timestamp() >= horario.fin then 'ausente'
    else 'sin_conexion'
  end as estado_asistencia
from public.turnos_personal t
join public.personal p on p.id = t.personal_id
join public.tipos_personal tp on tp.id = p.tipo_personal_id
left join public.especialidades e on e.id = p.especialidad_id
cross join lateral (
  select
    lower(public.rango_turno(t.fecha, t.hora_inicio, t.hora_fin)) at time zone 'America/El_Salvador' as inicio,
    upper(public.rango_turno(t.fecha, t.hora_inicio, t.hora_fin)) at time zone 'America/El_Salvador' as fin
) horario
cross join lateral (
  select coalesce((select public.rol_actual()) in ('administrador', 'recepcionista')
    or p.perfil_id = (select auth.uid()), false)
    or ((select auth.uid()) is null and coalesce((select auth.role()), '') not in ('anon', 'authenticated'))
    as puede_ver_asistencia
) acceso
left join lateral (
  select c.conectada_at
  from public.conexiones_app_medicos c
  where tp.es_medico and acceso.puede_ver_asistencia
    and c.personal_id = p.id and c.conectada_at >= horario.inicio and c.conectada_at < horario.fin
  order by c.conectada_at
  limit 1
) conexion on true
where (select public.rol_actual()) is not null
   or ((select auth.uid()) is null and coalesce((select auth.role()), '') not in ('anon', 'authenticated'));

comment on column public.v_turnos.estado_asistencia is
  'Asistencia del personal médico según la primera apertura de la app durante el turno. Tolerancia de 15 minutos.';
