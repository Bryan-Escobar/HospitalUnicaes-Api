-- =============================================================================
-- HUNI-62: órdenes y resultados de laboratorio
--
--   1. Máquina de estados de cada examen: pendiente → en_proceso → completado (nada más).
--      Pasar a completado exige un resultado con valor y/o archivo (PDF).
--      Un resultado solo se registra con el examen en proceso y no cambia una vez completado.
--   2. El estado de la orden se deriva de sus exámenes (completado cuando todos lo están).
--   3. Bucket privado `resultados-laboratorio` (solo PDF, máx. 10 MB). Lo usa la API con la
--      llave de servicio; los clientes descargan con la URL firmada que entrega la API.
--   4. Realtime: ordenes_laboratorio y orden_examenes se publican; el RLS de lectura decide quién
--      recibe cada cambio (médico tratante, el paciente, administración y recepción, que procesa).
-- Errores 'CODIGO: detalle' con SQLSTATE PT422 (PostgREST responde 422, como ERROR_CODES).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Máquina de estados del examen
-- -----------------------------------------------------------------------------
alter table public.resultados_laboratorio
  add constraint resultados_laboratorio_valor_o_archivo_check
    check (nullif(trim(valor), '') is not null or nullif(trim(archivo_url), '') is not null);

comment on column public.resultados_laboratorio.archivo_url is
  'Ruta del PDF dentro del bucket resultados-laboratorio (no una URL pública). Se descarga con URL firmada (HUNI-62).';

create or replace function public.validar_estado_examen()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if tg_op = 'INSERT' then
    if new.estado <> 'pendiente' then
      raise exception using errcode = 'PT422',
        message = 'TRANSICION_INVALIDA: un examen nuevo empieza en pendiente';
    end if;
    return new;
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  if not ((old.estado = 'pendiente' and new.estado = 'en_proceso')
          or (old.estado = 'en_proceso' and new.estado = 'completado')) then
    raise exception using errcode = 'PT422', message = format(
      'TRANSICION_INVALIDA: un examen no pasa de %s a %s (solo pendiente → en_proceso → completado)',
      old.estado, new.estado);
  end if;

  if new.estado = 'en_proceso' then
    new.fecha_inicio := coalesce(new.fecha_inicio, now());
  else
    if not exists (select 1 from public.resultados_laboratorio r where r.orden_examen_id = new.id) then
      raise exception using errcode = 'PT422',
        message = 'RESULTADO_REQUERIDO: para completar el examen registra su resultado (valor y/o archivo)';
    end if;
    new.fecha_completado := coalesce(new.fecha_completado, now());
  end if;
  return new;
end;
$function$;

create trigger orden_examenes_estado
  before insert or update of estado on public.orden_examenes
  for each row execute function public.validar_estado_examen();

-- El resultado se registra con el examen en proceso y queda fijo al completarlo.
create or replace function public.validar_resultado_laboratorio()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_estado public.estado_laboratorio;
begin
  select oe.estado into v_estado from public.orden_examenes oe where oe.id = new.orden_examen_id;

  if v_estado = 'completado' then
    raise exception using errcode = 'PT422',
      message = 'TRANSICION_INVALIDA: el examen ya está completado; su resultado no se modifica';
  end if;
  if v_estado = 'pendiente' then
    raise exception using errcode = 'PT422',
      message = 'TRANSICION_INVALIDA: el examen está pendiente; inícialo (en_proceso) antes de registrar el resultado';
  end if;
  return new;
end;
$function$;

create trigger resultados_laboratorio_validar
  before insert or update on public.resultados_laboratorio
  for each row execute function public.validar_resultado_laboratorio();

-- -----------------------------------------------------------------------------
-- 2. Estado de la orden = estado de sus exámenes
-- -----------------------------------------------------------------------------
create or replace function public.estado_de_orden(p_orden_id uuid)
  returns public.estado_laboratorio
  language sql
  stable
  set search_path to ''
  as $function$
  select case
    when count(*) > 0 and bool_and(oe.estado = 'completado') then 'completado'::public.estado_laboratorio
    when bool_or(oe.estado <> 'pendiente') then 'en_proceso'::public.estado_laboratorio
    else 'pendiente'::public.estado_laboratorio
  end
  from public.orden_examenes oe
  where oe.orden_id = p_orden_id;
$function$;

create or replace function public.sincronizar_estado_orden()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_orden_id uuid := case when tg_op = 'DELETE' then old.orden_id else new.orden_id end;
  v_estado   public.estado_laboratorio := public.estado_de_orden(v_orden_id);
begin
  update public.ordenes_laboratorio o set estado = v_estado
  where o.id = v_orden_id and o.estado is distinct from v_estado;
  return null;
end;
$function$;

create trigger orden_examenes_sincronizar_orden
  after insert or update of estado or delete on public.orden_examenes
  for each row execute function public.sincronizar_estado_orden();

-- Órdenes que ya existen
update public.ordenes_laboratorio o set estado = public.estado_de_orden(o.id)
where exists (select 1 from public.orden_examenes oe where oe.orden_id = o.id)
  and o.estado is distinct from public.estado_de_orden(o.id);

-- -----------------------------------------------------------------------------
-- 3. Bucket privado para los PDF de resultados
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resultados-laboratorio', 'resultados-laboratorio', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- 4. RLS de lectura + Realtime
-- -----------------------------------------------------------------------------
-- Médico tratante (HUNI-45): cita no cancelada, consulta u hospitalización con el paciente.
create or replace function public.es_medico_tratante(p_paciente_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select public.rol_actual() = 'doctor' and exists (
    select 1 from public.personal p
    where p.id = public.personal_actual_id()
      and (
        exists (select 1 from public.citas c
                where c.paciente_id = p_paciente_id and c.doctor_id = p.id and c.estado <> 'cancelada')
        or exists (select 1 from public.consultas co
                   join public.expedientes e on e.id = co.expediente_id
                   where e.paciente_id = p_paciente_id and co.doctor_id = p.id)
        or exists (select 1 from public.hospitalizaciones h
                   where h.paciente_id = p_paciente_id and h.doctor_tratante_id = p.id)
      )
  );
$function$;

-- Quién ve una orden: administración y recepción (procesa los exámenes), el médico tratante y el paciente.
create or replace function public.puede_ver_orden(p_orden_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select exists (
    select 1
    from public.ordenes_laboratorio o
    join public.consultas co on co.id = o.consulta_id
    join public.expedientes e on e.id = co.expediente_id
    where o.id = p_orden_id
      and (
        public.rol_actual() in ('administrador', 'recepcionista')
        or (public.rol_actual() = 'paciente' and e.paciente_id = public.paciente_actual_id())
        or public.es_medico_tratante(e.paciente_id)
      )
  );
$function$;

revoke all on table public.ordenes_laboratorio, public.orden_examenes, public.resultados_laboratorio from anon;

create policy ordenes_laboratorio_leer on public.ordenes_laboratorio
  for select to authenticated
  using ((select public.puede_ver_orden(id)));

create policy orden_examenes_leer on public.orden_examenes
  for select to authenticated
  using ((select public.puede_ver_orden(orden_id)));

-- Los resultados no se publican por Realtime ni se leen directo: el valor y el PDF los entrega la API.

do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orden_examenes') then
      alter publication supabase_realtime add table public.orden_examenes;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ordenes_laboratorio') then
      alter publication supabase_realtime add table public.ordenes_laboratorio;
    end if;
  end if;
end
$realtime$;

revoke execute on function
  public.validar_estado_examen(),
  public.validar_resultado_laboratorio(),
  public.sincronizar_estado_orden(),
  public.estado_de_orden(uuid),
  public.es_medico_tratante(uuid),
  public.puede_ver_orden(uuid)
from public, anon;

grant execute on function public.es_medico_tratante(uuid), public.puede_ver_orden(uuid), public.estado_de_orden(uuid)
  to authenticated, service_role;
