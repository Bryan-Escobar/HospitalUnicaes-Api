-- =============================================================================
-- HUNI-70: despacho de la única ambulancia y bitácora
--
--   1. Solicitudes: tipo de emergencia, ubicación GPS (latitud/longitud/precisión), contacto opcional y
--      canal (`app` con sesión, `publico` desde el botón del login, sin cuenta y con código de seguimiento).
--      Basta la dirección o las coordenadas; el resto lo completa recepción después.
--   2. Estados de la ambulancia: disponible ⇄ en_servicio (despacho / cierre o cancelación del servicio) y
--      disponible ⇄ en_mantenimiento (administrador). Errores legibles: AMBULANCIA_NO_DISPONIBLE,
--      AMBULANCIA_EN_SERVICIO, TRANSICION_INVALIDA.
--   3. Bitácora: cada cambio de estado guarda la solicitud, una descripción y quién lo hizo.
--   4. Funciones transaccionales con bloqueo de la fila de la ambulancia: despachar_ambulancia,
--      marcar_solicitud_en_curso, cerrar_servicio_ambulancia, cancelar_solicitud_ambulancia,
--      cambiar_estado_ambulancia. Dos despachos simultáneos: solo uno gana.
--   5. RLS de lectura + Realtime de ambulancias y solicitudes_ambulancia.
-- Ya existían (HUNI-37): una sola ambulancia (índice único sobre `true`) y un solo servicio activo
-- (índice único parcial sobre solicitudes despachadas o en curso).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Solicitudes
-- -----------------------------------------------------------------------------
create type public.tipo_emergencia as enum (
  'accidente', 'cardiaca', 'respiratoria', 'neurologica', 'obstetrica', 'intoxicacion', 'traslado', 'otra'
);

create type public.canal_solicitud as enum ('app', 'publico');

alter table public.solicitudes_ambulancia
  alter column solicitada_por drop not null,
  alter column direccion_origen drop not null,
  add column canal              public.canal_solicitud not null default 'app',
  add column tipo_emergencia    public.tipo_emergencia,
  add column latitud            numeric(9, 6),
  add column longitud           numeric(9, 6),
  add column precision_m        integer,
  add column telefono_contacto  text,
  add column nombre_contacto    text,
  add column codigo_seguimiento text,
  add column fecha_en_curso     timestamptz,
  add column despachada_por     uuid references public.perfiles (id) on delete set null,
  add column cerrada_por        uuid references public.perfiles (id) on delete set null,
  add column notas_cierre       text,
  add column motivo_cancelacion text,
  add constraint solicitudes_ambulancia_codigo_seguimiento_key unique (codigo_seguimiento),
  add constraint solicitudes_ambulancia_ubicacion check (direccion_origen is not null or latitud is not null),
  add constraint solicitudes_ambulancia_coordenadas check (
    (latitud is null) = (longitud is null)
    and (latitud is null or latitud between -90 and 90)
    and (longitud is null or longitud between -180 and 180)
    and (precision_m is null or precision_m >= 0)
  ),
  -- Con sesión siempre se sabe quién la pidió; la pública no tiene cuenta y se sigue con su código.
  add constraint solicitudes_ambulancia_canal check (
    (canal = 'app' and solicitada_por is not null and codigo_seguimiento is null)
    or (canal = 'publico' and solicitada_por is null and codigo_seguimiento is not null)
  );

comment on column public.solicitudes_ambulancia.canal is
  '`app`: con sesión (paciente, recepción o doctor). `publico`: botón del login, sin cuenta (HUNI-70).';
comment on column public.solicitudes_ambulancia.codigo_seguimiento is
  'Solo canal `publico`: secreto aleatorio con el que quien la pidió ve el estado, agrega datos o la cancela.';
comment on column public.solicitudes_ambulancia.cerrada_por is
  'Quién la finalizó o canceló (null si la canceló el solicitante público).';

create index solicitudes_ambulancia_fecha_solicitud_idx on public.solicitudes_ambulancia using btree (fecha_solicitud desc);
create index solicitudes_ambulancia_pendientes_idx on public.solicitudes_ambulancia using btree (canal)
  where estado = 'pendiente';

-- -----------------------------------------------------------------------------
-- 2. Estados de la ambulancia
-- -----------------------------------------------------------------------------
-- en_servicio solo lo pone un despacho y solo se deja cerrando o cancelando el servicio;
-- desde en_servicio no se pasa a mantenimiento.
create or replace function public.proteger_estado_ambulancia()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_servicio_activo boolean := exists (
    select 1 from public.solicitudes_ambulancia s
    where s.ambulancia_id = new.id and s.estado in ('despachada', 'en_curso')
  );
begin
  if new.estado = old.estado then
    return new;
  end if;
  if old.estado = 'en_servicio' and new.estado = 'en_mantenimiento' then
    raise exception using errcode = 'PT422',
      message = 'AMBULANCIA_EN_SERVICIO: cierra el servicio en curso antes de pasar a mantenimiento';
  end if;
  if old.estado = 'en_servicio' and v_servicio_activo then
    raise exception using errcode = 'PT422',
      message = 'AMBULANCIA_EN_SERVICIO: la ambulancia tiene un servicio en curso; ciérralo o cancélalo';
  end if;
  if new.estado = 'en_servicio' and not v_servicio_activo then
    raise exception using errcode = 'PT422',
      message = 'TRANSICION_INVALIDA: la ambulancia solo queda en servicio al despachar una solicitud';
  end if;
  return new;
end;
$function$;

create trigger ambulancias_proteger_estado
  before update of estado on public.ambulancias
  for each row execute function public.proteger_estado_ambulancia();

-- -----------------------------------------------------------------------------
-- 3. Bitácora
--    La solicitud, la descripción y el autor llegan por variables de sesión que ponen las funciones de abajo.
-- -----------------------------------------------------------------------------
alter table public.bitacora_ambulancia
  add column registrado_por uuid references public.perfiles (id) on delete set null;

create index bitacora_ambulancia_created_at_idx on public.bitacora_ambulancia using btree (created_at desc);

create or replace function public.registrar_bitacora_ambulancia()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  insert into public.bitacora_ambulancia
    (ambulancia_id, solicitud_id, estado_anterior, estado_nuevo, descripcion, registrado_por)
  values (
    new.id,
    coalesce(
      nullif(current_setting('hospital.solicitud_id', true), '')::uuid,
      (select s.id from public.solicitudes_ambulancia s
        where s.ambulancia_id = new.id and s.estado in ('despachada', 'en_curso')
        limit 1)
    ),
    old.estado,
    new.estado,
    nullif(current_setting('hospital.bitacora_descripcion', true), ''),
    nullif(current_setting('hospital.perfil_id', true), '')::uuid
  );
  return new;
end;
$function$;

drop trigger if exists ambulancias_bitacora on public.ambulancias;

create trigger ambulancias_bitacora
  after update of estado on public.ambulancias
  for each row
  when (old.estado is distinct from new.estado)
  execute function public.registrar_bitacora_ambulancia();

-- Servicios que ya existían sin bitácora (datos de prueba de HUNI-37): su salida y su regreso.
insert into public.bitacora_ambulancia (ambulancia_id, solicitud_id, estado_anterior, estado_nuevo, descripcion, created_at)
select s.ambulancia_id, s.id, 'disponible', 'en_servicio', 'Despacho', s.fecha_despacho
from public.solicitudes_ambulancia s
where s.fecha_despacho is not null
  and not exists (select 1 from public.bitacora_ambulancia b where b.solicitud_id = s.id);

insert into public.bitacora_ambulancia (ambulancia_id, solicitud_id, estado_anterior, estado_nuevo, descripcion, created_at)
select s.ambulancia_id, s.id, 'en_servicio', 'disponible', 'Servicio finalizado', s.fecha_cierre
from public.solicitudes_ambulancia s
where s.estado = 'finalizada' and s.fecha_cierre is not null and s.fecha_despacho is not null
  and not exists (select 1 from public.bitacora_ambulancia b where b.solicitud_id = s.id and b.estado_nuevo = 'disponible');

-- -----------------------------------------------------------------------------
-- 4. Funciones transaccionales
--    Todas bloquean primero la fila de la (única) ambulancia y después la solicitud: las operaciones
--    se ordenan y nunca se cruzan dos despachos.
-- -----------------------------------------------------------------------------
create or replace function public.preparar_bitacora_ambulancia(p_solicitud_id uuid, p_descripcion text, p_perfil_id uuid)
  returns void
  language sql
  set search_path to ''
  as $function$
  select set_config('hospital.solicitud_id', coalesce(p_solicitud_id::text, ''), true),
         set_config('hospital.bitacora_descripcion', coalesce(nullif(trim(p_descripcion), ''), ''), true),
         set_config('hospital.perfil_id', coalesce(p_perfil_id::text, ''), true);
$function$;

-- Despacho: solo una solicitud pendiente y solo con la ambulancia disponible (→ en_servicio).
create or replace function public.despachar_ambulancia(p_solicitud_id uuid, p_perfil_id uuid default null)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_ambulancia record;
  v_estado     public.estado_solicitud;
begin
  -- Un despacho simultáneo espera aquí y, al continuar, ve la ambulancia ya en servicio.
  select a.id, a.estado into v_ambulancia from public.ambulancias a limit 1 for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: no hay ambulancia registrada';
  end if;

  select s.estado into v_estado from public.solicitudes_ambulancia s where s.id = p_solicitud_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: la solicitud no existe';
  end if;
  if v_ambulancia.estado <> 'disponible' then
    raise exception using errcode = 'PT409',
      message = format('AMBULANCIA_NO_DISPONIBLE: la ambulancia está %s', v_ambulancia.estado);
  end if;
  if v_estado <> 'pendiente' then
    raise exception using errcode = 'PT422',
      message = format('TRANSICION_INVALIDA: la solicitud está %s; solo se despacha una pendiente', v_estado);
  end if;

  update public.solicitudes_ambulancia
  set estado = 'despachada', fecha_despacho = now(), despachada_por = p_perfil_id, ambulancia_id = v_ambulancia.id
  where id = p_solicitud_id;

  perform public.preparar_bitacora_ambulancia(p_solicitud_id, 'Despacho', p_perfil_id);
  update public.ambulancias set estado = 'en_servicio' where id = v_ambulancia.id;
  return p_solicitud_id;
exception
  -- Respaldo del índice de un solo servicio activo (no debería pasar con el bloqueo de arriba).
  when unique_violation then
    raise exception using errcode = 'PT409', message = 'AMBULANCIA_NO_DISPONIBLE: la ambulancia ya fue despachada';
end;
$function$;

-- La ambulancia llegó y lleva al paciente: despachada → en_curso (la ambulancia sigue en servicio).
create or replace function public.marcar_solicitud_en_curso(p_solicitud_id uuid)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_estado public.estado_solicitud;
begin
  select s.estado into v_estado from public.solicitudes_ambulancia s where s.id = p_solicitud_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: la solicitud no existe';
  end if;
  if v_estado <> 'despachada' then
    raise exception using errcode = 'PT422',
      message = format('TRANSICION_INVALIDA: la solicitud está %s; solo pasa a en curso una despachada', v_estado);
  end if;

  update public.solicitudes_ambulancia set estado = 'en_curso', fecha_en_curso = now() where id = p_solicitud_id;
  return p_solicitud_id;
end;
$function$;

-- Cierre: finaliza el servicio (despachada o en curso) y la ambulancia vuelve a disponible.
create or replace function public.cerrar_servicio_ambulancia(
  p_solicitud_id uuid,
  p_notas        text default null,
  p_perfil_id    uuid default null
)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_ambulancia uuid;
  v_estado     public.estado_solicitud;
begin
  select a.id into v_ambulancia from public.ambulancias a limit 1 for update;
  select s.estado into v_estado from public.solicitudes_ambulancia s where s.id = p_solicitud_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: la solicitud no existe';
  end if;
  if v_estado not in ('despachada', 'en_curso') then
    raise exception using errcode = 'PT422',
      message = format('TRANSICION_INVALIDA: la solicitud está %s; solo se cierra un servicio en curso', v_estado);
  end if;

  update public.solicitudes_ambulancia
  set estado = 'finalizada', fecha_cierre = now(), cerrada_por = p_perfil_id, notas_cierre = nullif(trim(p_notas), '')
  where id = p_solicitud_id;

  perform public.preparar_bitacora_ambulancia(p_solicitud_id, coalesce(nullif(trim(p_notas), ''), 'Servicio finalizado'), p_perfil_id);
  update public.ambulancias set estado = 'disponible' where id = v_ambulancia;
  return p_solicitud_id;
end;
$function$;

-- Cancelación: una pendiente siempre; una despachada o en curso solo si p_permitir_en_servicio
-- (recepción, administración o el solicitante público): la ambulancia vuelve a disponible.
create or replace function public.cancelar_solicitud_ambulancia(
  p_solicitud_id          uuid,
  p_motivo                text default null,
  p_perfil_id             uuid default null,
  p_permitir_en_servicio  boolean default false
)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_ambulancia uuid;
  v_estado     public.estado_solicitud;
  v_motivo     text := nullif(trim(p_motivo), '');
begin
  select a.id into v_ambulancia from public.ambulancias a limit 1 for update;
  select s.estado into v_estado from public.solicitudes_ambulancia s where s.id = p_solicitud_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: la solicitud no existe';
  end if;
  if v_estado not in ('pendiente', 'despachada', 'en_curso')
     or (v_estado <> 'pendiente' and not p_permitir_en_servicio) then
    raise exception using errcode = 'PT422',
      message = format('TRANSICION_INVALIDA: la solicitud está %s y no se puede cancelar', v_estado);
  end if;

  update public.solicitudes_ambulancia
  set estado = 'cancelada', fecha_cierre = now(), cerrada_por = p_perfil_id, motivo_cancelacion = v_motivo
  where id = p_solicitud_id;

  if v_estado <> 'pendiente' then
    perform public.preparar_bitacora_ambulancia(
      p_solicitud_id, 'Servicio cancelado' || coalesce(': ' || v_motivo, ''), p_perfil_id);
    update public.ambulancias set estado = 'disponible' where id = v_ambulancia;
  end if;
  return p_solicitud_id;
end;
$function$;

-- Mantenimiento (administrador): disponible ⇄ en_mantenimiento.
create or replace function public.cambiar_estado_ambulancia(
  p_estado      public.estado_ambulancia,
  p_descripcion text default null,
  p_perfil_id   uuid default null
)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_ambulancia record;
begin
  select a.id, a.estado into v_ambulancia from public.ambulancias a limit 1 for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO: no hay ambulancia registrada';
  end if;
  if p_estado = 'en_servicio' then
    raise exception using errcode = 'PT422',
      message = 'TRANSICION_INVALIDA: en_servicio no se pone a mano; lo marca el despacho';
  end if;
  if v_ambulancia.estado = 'en_servicio' then
    raise exception using errcode = 'PT422',
      message = 'AMBULANCIA_EN_SERVICIO: cierra el servicio en curso antes de cambiar el estado';
  end if;
  if v_ambulancia.estado = p_estado then
    raise exception using errcode = 'PT422',
      message = format('TRANSICION_INVALIDA: la ambulancia ya está %s', p_estado);
  end if;

  perform public.preparar_bitacora_ambulancia(null, p_descripcion, p_perfil_id);
  update public.ambulancias set estado = p_estado where id = v_ambulancia.id;
  return v_ambulancia.id;
end;
$function$;

-- Solo la API (conexión de Prisma / llave de servicio) llama a estas funciones.
revoke execute on function
  public.proteger_estado_ambulancia(),
  public.registrar_bitacora_ambulancia(),
  public.preparar_bitacora_ambulancia(uuid, text, uuid),
  public.despachar_ambulancia(uuid, uuid),
  public.marcar_solicitud_en_curso(uuid),
  public.cerrar_servicio_ambulancia(uuid, text, uuid),
  public.cancelar_solicitud_ambulancia(uuid, text, uuid, boolean),
  public.cambiar_estado_ambulancia(public.estado_ambulancia, text, uuid)
from public, anon, authenticated;

grant execute on function
  public.despachar_ambulancia(uuid, uuid),
  public.marcar_solicitud_en_curso(uuid),
  public.cerrar_servicio_ambulancia(uuid, text, uuid),
  public.cancelar_solicitud_ambulancia(uuid, text, uuid, boolean),
  public.cambiar_estado_ambulancia(public.estado_ambulancia, text, uuid)
to service_role;

-- -----------------------------------------------------------------------------
-- 5. RLS de lectura + Realtime
--    ambulancias: cualquier usuario con sesión (no trae datos de pacientes).
--    solicitudes_ambulancia: el personal; el paciente solo las suyas. Las públicas (sin cuenta) no se
--    leen por Realtime: quien la pidió consulta su estado con el código en la API.
--    bitacora_ambulancia: administración, recepción y doctores (sin Realtime).
--    Escribir solo desde la API: sin políticas de INSERT/UPDATE/DELETE.
-- -----------------------------------------------------------------------------
revoke all on table public.ambulancias, public.solicitudes_ambulancia, public.bitacora_ambulancia from anon;
revoke insert, update, delete, truncate on table
  public.ambulancias, public.solicitudes_ambulancia, public.bitacora_ambulancia
from authenticated;

create policy ambulancias_leer on public.ambulancias
  for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy solicitudes_ambulancia_leer on public.solicitudes_ambulancia
  for select to authenticated
  using (
    (select public.rol_actual()) in ('administrador', 'recepcionista', 'doctor')
    or (
      (select public.rol_actual()) = 'paciente'
      and (solicitada_por = (select auth.uid()) or paciente_id = (select public.paciente_actual_id()))
    )
  );

create policy bitacora_ambulancia_leer on public.bitacora_ambulancia
  for select to authenticated
  using ((select public.rol_actual()) in ('administrador', 'recepcionista', 'doctor'));

do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ambulancias') then
      alter publication supabase_realtime add table public.ambulancias;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'solicitudes_ambulancia') then
      alter publication supabase_realtime add table public.solicitudes_ambulancia;
    end if;
  end if;
end
$realtime$;
