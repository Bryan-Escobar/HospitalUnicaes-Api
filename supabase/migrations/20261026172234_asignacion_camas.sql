-- =============================================================================
-- HUNI-66: asignación de camas (3ª planta VIP-301…305 con 1 cama; 2ª planta HAB-201…206 con 2 camas)
--
--   1. Historial: movimientos_cama registra cada ingreso, traslado y alta (quién y cuándo);
--      hospitalizaciones guarda quién ingresó / dio el alta y las notas del alta.
--   2. Reglas de la cama con errores legibles (PT409 → 409, como ERROR_CODES):
--      CAMA_OCUPADA, CAMA_NO_DISPONIBLE, PACIENTE_YA_HOSPITALIZADO, HOSPITALIZACION_FINALIZADA.
--      La cama pasa a `ocupada` al ingresar o recibir un traslado y a `limpieza` al liberarse.
--   3. Funciones transaccionales con bloqueo de fila: sugerir_cama, asignar_cama, trasladar_cama, dar_alta.
--      Dos peticiones simultáneas por la misma (o la última) cama: solo una gana.
--   4. RLS de lectura + Realtime de camas y hospitalizaciones.
-- Ya existían (HUNI-37): 1 hospitalización activa por cama y por paciente (índices únicos parciales)
-- y la capacidad de cada habitación (trigger de camas): nunca más de 1 paciente en VIP ni 2 en semiprivada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Historial
-- -----------------------------------------------------------------------------
alter table public.hospitalizaciones
  add column ingresado_por uuid references public.personal (id) on delete set null,
  add column alta_por      uuid references public.personal (id) on delete set null,
  add column notas_alta    text;

create type public.tipo_movimiento_cama as enum ('ingreso', 'traslado', 'alta');

create table public.movimientos_cama (
  id                 uuid        not null default gen_random_uuid(),
  hospitalizacion_id uuid        not null references public.hospitalizaciones (id) on delete cascade,
  tipo               public.tipo_movimiento_cama not null,
  cama_origen_id     uuid        references public.camas (id) on delete restrict,
  cama_destino_id    uuid        references public.camas (id) on delete restrict,
  registrado_por     uuid        references public.personal (id) on delete set null,
  notas              text,
  created_at         timestamptz not null default now(),
  constraint movimientos_cama_pkey primary key (id)
);

comment on table public.movimientos_cama is
  'Historial de camas de cada hospitalización: ingreso (destino), traslado (origen → destino) y alta (origen). HUNI-66.';

create index movimientos_cama_hospitalizacion_id_idx on public.movimientos_cama using btree (hospitalizacion_id, created_at);

alter table public.movimientos_cama enable row level security;
revoke all on table public.movimientos_cama from anon, authenticated;

-- Hospitalizaciones que ya existían: su ingreso queda en el historial (y su alta, si la tienen)
insert into public.movimientos_cama (hospitalizacion_id, tipo, cama_destino_id, registrado_por, created_at)
select h.id, 'ingreso', h.cama_id, null, h.fecha_ingreso from public.hospitalizaciones h;

insert into public.movimientos_cama (hospitalizacion_id, tipo, cama_origen_id, registrado_por, created_at)
select h.id, 'alta', h.cama_id, null, h.fecha_alta from public.hospitalizaciones h where h.fecha_alta is not null;

-- -----------------------------------------------------------------------------
-- 2. Reglas de la cama
-- -----------------------------------------------------------------------------
-- Antes de escribir: la cama de destino debe estar disponible (o ser la misma) y la hospitalización abierta.
create or replace function public.validar_hospitalizacion()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_cama record;
begin
  if tg_op = 'UPDATE' and old.fecha_alta is not null then
    raise exception using errcode = 'PT409',
      message = 'HOSPITALIZACION_FINALIZADA: la hospitalización ya tiene alta y no se modifica';
  end if;

  if new.fecha_alta is null and (tg_op = 'INSERT' or new.cama_id is distinct from old.cama_id) then
    select c.codigo, c.estado, h.activa into v_cama
    from public.camas c join public.habitaciones h on h.id = c.habitacion_id
    where c.id = new.cama_id;

    if not found then
      raise exception using errcode = 'PT400', message = 'REFERENCIA_INVALIDA: la cama no existe';
    end if;
    if v_cama.estado = 'ocupada' then
      raise exception using errcode = 'PT409',
        message = format('CAMA_OCUPADA: la cama %s ya tiene un paciente', v_cama.codigo);
    end if;
    if v_cama.estado <> 'disponible' or not v_cama.activa then
      raise exception using errcode = 'PT409',
        message = format('CAMA_NO_DISPONIBLE: la cama %s está en %s', v_cama.codigo,
                         case when v_cama.activa then v_cama.estado::text else 'una habitación inactiva' end);
    end if;
  end if;
  return new;
end;
$function$;

-- Después de escribir: estados de las camas + historial. El autor llega por la variable de sesión
-- hospital.personal_id (la ponen las funciones de abajo).
create or replace function public.sincronizar_estado_cama()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_autor uuid := nullif(current_setting('hospital.personal_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    update public.camas set estado = 'ocupada' where id = new.cama_id;
    insert into public.movimientos_cama (hospitalizacion_id, tipo, cama_destino_id, registrado_por)
    values (new.id, 'ingreso', new.cama_id, coalesce(v_autor, new.ingresado_por));
  elsif old.fecha_alta is null and new.fecha_alta is not null then
    update public.camas set estado = 'limpieza' where id = new.cama_id;
    insert into public.movimientos_cama (hospitalizacion_id, tipo, cama_origen_id, registrado_por, notas)
    values (new.id, 'alta', new.cama_id, coalesce(v_autor, new.alta_por), new.notas_alta);
  elsif new.cama_id is distinct from old.cama_id then
    update public.camas set estado = 'limpieza' where id = old.cama_id;
    update public.camas set estado = 'ocupada' where id = new.cama_id;
    insert into public.movimientos_cama (hospitalizacion_id, tipo, cama_origen_id, cama_destino_id, registrado_por)
    values (new.id, 'traslado', old.cama_id, new.cama_id, v_autor);
  end if;
  return null;
end;
$function$;

drop trigger if exists hospitalizaciones_estado_cama on public.hospitalizaciones;

create trigger hospitalizaciones_validar
  before insert or update on public.hospitalizaciones
  for each row execute function public.validar_hospitalizacion();

create trigger hospitalizaciones_estado_cama
  after insert or update of fecha_alta, cama_id on public.hospitalizaciones
  for each row execute function public.sincronizar_estado_cama();

-- El estado `ocupada` lo pone solo una hospitalización; una cama con paciente no se cambia a mano.
create or replace function public.proteger_estado_cama()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_ocupada boolean := exists (
    select 1 from public.hospitalizaciones h where h.cama_id = new.id and h.fecha_alta is null
  );
begin
  if new.estado = old.estado then
    return new;
  end if;
  if old.estado = 'ocupada' and v_ocupada then
    raise exception using errcode = 'PT409',
      message = format('CAMA_OCUPADA: la cama %s tiene un paciente; libérala con un alta o un traslado', new.codigo);
  end if;
  if new.estado = 'ocupada' and not v_ocupada then
    raise exception using errcode = 'PT422',
      message = 'REGLA_DE_NEGOCIO: una cama solo queda ocupada al ingresar a un paciente';
  end if;
  return new;
end;
$function$;

create trigger camas_proteger_estado
  before update of estado on public.camas
  for each row execute function public.proteger_estado_cama();

-- -----------------------------------------------------------------------------
-- 3. Funciones transaccionales
-- -----------------------------------------------------------------------------
-- Cama libre del tipo pedido: primero habitaciones vacías (privacidad, control de infecciones),
-- luego cualquier cama libre. Con p_bloquear la cama queda bloqueada hasta el fin de la transacción
-- y salta las que otra transacción está tomando (SKIP LOCKED): dos peticiones nunca reciben la misma.
create or replace function public.sugerir_cama(p_tipo public.tipo_habitacion, p_bloquear boolean default false)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_cama uuid;
begin
  if p_bloquear then
    select c.id into v_cama
    from public.camas c
    join public.habitaciones h on h.id = c.habitacion_id
    where h.tipo = p_tipo and h.activa and c.estado = 'disponible'
    order by
      exists (select 1 from public.camas o where o.habitacion_id = h.id and o.id <> c.id and o.estado = 'ocupada'),
      h.codigo, c.codigo
    limit 1
    for update of c skip locked;
  else
    select c.id into v_cama
    from public.camas c
    join public.habitaciones h on h.id = c.habitacion_id
    where h.tipo = p_tipo and h.activa and c.estado = 'disponible'
    order by
      exists (select 1 from public.camas o where o.habitacion_id = h.id and o.id <> c.id and o.estado = 'ocupada'),
      h.codigo, c.codigo
    limit 1;
  end if;
  return v_cama;
end;
$function$;

-- Ingreso: cama elegida (bloqueo de su fila) o la sugerida para el tipo. Devuelve el id de la hospitalización.
create or replace function public.asignar_cama(
  p_paciente_id    uuid,
  p_doctor_id      uuid,
  p_cama_id        uuid default null,
  p_tipo           public.tipo_habitacion default null,
  p_motivo         text default null,
  p_registrado_por uuid default null
)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_activo boolean;
  v_cama   uuid := p_cama_id;
  v_id     uuid;
begin
  -- Bloquea al paciente: dos ingresos simultáneos del mismo paciente se ordenan.
  select pa.activo into v_activo from public.pacientes pa where pa.id = p_paciente_id for update;
  if not found then
    raise exception using errcode = 'PT400', message = 'REFERENCIA_INVALIDA: el paciente no existe';
  end if;
  if not v_activo then
    raise exception using errcode = 'PT422', message = 'REGLA_DE_NEGOCIO: el paciente está desactivado';
  end if;
  if exists (select 1 from public.hospitalizaciones h where h.paciente_id = p_paciente_id and h.fecha_alta is null) then
    raise exception using errcode = 'PT409',
      message = 'PACIENTE_YA_HOSPITALIZADO: el paciente ya ocupa una cama; trasládalo o dale de alta';
  end if;
  if not exists (
    select 1 from public.personal p join public.tipos_personal tp on tp.id = p.tipo_personal_id
    where p.id = p_doctor_id and p.activo and tp.es_medico
  ) then
    raise exception using errcode = 'PT422', message = 'REGLA_DE_NEGOCIO: el doctor tratante debe ser un médico activo';
  end if;

  if v_cama is not null then
    -- Espera a que termine cualquier otra transacción sobre esta cama y relee su estado.
    perform 1 from public.camas c where c.id = v_cama for update;
    if not found then
      raise exception using errcode = 'PT400', message = 'REFERENCIA_INVALIDA: la cama no existe';
    end if;
  elsif p_tipo is not null then
    v_cama := public.sugerir_cama(p_tipo, true);
    if v_cama is null then
      raise exception using errcode = 'PT409',
        message = format('SIN_CAMAS_DISPONIBLES: no hay camas %s libres', p_tipo);
    end if;
  else
    raise exception using errcode = 'PT400', message = 'SOLICITUD_INVALIDA: envía la cama o el tipo de habitación';
  end if;

  perform set_config('hospital.personal_id', coalesce(p_registrado_por::text, ''), true);

  insert into public.hospitalizaciones (paciente_id, cama_id, doctor_tratante_id, motivo_ingreso, ingresado_por)
  values (p_paciente_id, v_cama, p_doctor_id, nullif(trim(p_motivo), ''), p_registrado_por)
  returning id into v_id;

  return v_id;
exception
  -- Respaldo de los índices únicos (no debería pasar con los bloqueos de arriba).
  when unique_violation then
    if sqlerrm like '%hospitalizaciones_paciente_activo%' then
      raise exception using errcode = 'PT409', message = 'PACIENTE_YA_HOSPITALIZADO: el paciente ya ocupa una cama';
    end if;
    raise exception using errcode = 'PT409', message = 'CAMA_OCUPADA: la cama se acaba de ocupar; elige otra';
end;
$function$;

-- Traslado: libera la cama actual (limpieza) y ocupa la nueva en una sola transacción.
create or replace function public.trasladar_cama(
  p_hospitalizacion_id uuid,
  p_cama_id            uuid,
  p_registrado_por     uuid default null
)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_hosp record;
begin
  select h.cama_id, h.fecha_alta into v_hosp from public.hospitalizaciones h where h.id = p_hospitalizacion_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: la hospitalización no existe';
  end if;
  if v_hosp.fecha_alta is not null then
    raise exception using errcode = 'PT409', message = 'HOSPITALIZACION_FINALIZADA: la hospitalización ya tiene alta';
  end if;
  if v_hosp.cama_id = p_cama_id then
    raise exception using errcode = 'PT400', message = 'SOLICITUD_INVALIDA: el paciente ya está en esa cama';
  end if;

  perform 1 from public.camas c where c.id = p_cama_id for update;
  if not found then
    raise exception using errcode = 'PT400', message = 'REFERENCIA_INVALIDA: la cama no existe';
  end if;

  perform set_config('hospital.personal_id', coalesce(p_registrado_por::text, ''), true);
  update public.hospitalizaciones set cama_id = p_cama_id where id = p_hospitalizacion_id;
  return p_hospitalizacion_id;
exception
  when unique_violation then
    raise exception using errcode = 'PT409', message = 'CAMA_OCUPADA: la cama se acaba de ocupar; elige otra';
end;
$function$;

-- Alta: cierra la hospitalización (queda en el historial) y la cama pasa a limpieza.
create or replace function public.dar_alta(
  p_hospitalizacion_id uuid,
  p_notas              text default null,
  p_registrado_por     uuid default null
)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_alta timestamptz;
begin
  select h.fecha_alta into v_alta from public.hospitalizaciones h where h.id = p_hospitalizacion_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: la hospitalización no existe';
  end if;
  if v_alta is not null then
    raise exception using errcode = 'PT409', message = 'HOSPITALIZACION_FINALIZADA: la hospitalización ya tiene alta';
  end if;

  perform set_config('hospital.personal_id', coalesce(p_registrado_por::text, ''), true);
  update public.hospitalizaciones
  set fecha_alta = now(), estado = 'alta', notas_alta = nullif(trim(p_notas), ''), alta_por = p_registrado_por
  where id = p_hospitalizacion_id;
  return p_hospitalizacion_id;
end;
$function$;

-- Solo la API (llave de servicio / conexión de Prisma) llama a estas funciones.
revoke execute on function
  public.validar_hospitalizacion(),
  public.sincronizar_estado_cama(),
  public.proteger_estado_cama(),
  public.sugerir_cama(public.tipo_habitacion, boolean),
  public.asignar_cama(uuid, uuid, uuid, public.tipo_habitacion, text, uuid),
  public.trasladar_cama(uuid, uuid, uuid),
  public.dar_alta(uuid, text, uuid)
from public, anon, authenticated;

grant execute on function
  public.sugerir_cama(public.tipo_habitacion, boolean),
  public.asignar_cama(uuid, uuid, uuid, public.tipo_habitacion, text, uuid),
  public.trasladar_cama(uuid, uuid, uuid),
  public.dar_alta(uuid, text, uuid)
to service_role;

-- -----------------------------------------------------------------------------
-- 4. RLS de lectura + Realtime
--    camas y habitaciones: cualquier usuario con sesión (no traen datos del paciente).
--    hospitalizaciones: administración, recepción, el médico tratante y el propio paciente.
-- -----------------------------------------------------------------------------
revoke all on table public.camas, public.habitaciones, public.hospitalizaciones from anon;

create policy camas_leer on public.camas
  for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy habitaciones_leer on public.habitaciones
  for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy hospitalizaciones_leer on public.hospitalizaciones
  for select to authenticated
  using (
    (select public.rol_actual()) in ('administrador', 'recepcionista')
    or ((select public.rol_actual()) = 'paciente' and paciente_id = (select public.paciente_actual_id()))
    or (select public.es_medico_tratante(paciente_id))
  );

do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'camas') then
      alter publication supabase_realtime add table public.camas;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hospitalizaciones') then
      alter publication supabase_realtime add table public.hospitalizaciones;
    end if;
  end if;
end
$realtime$;
