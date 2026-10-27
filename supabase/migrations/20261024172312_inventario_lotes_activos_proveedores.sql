-- =============================================================================
-- HUNI-97: inventario con trazabilidad (cambio de alcance 2026-10-24)
--   1. Proveedores (desactivables)
--   2. Lotes con fecha de caducidad para medicamentos e insumos
--   3. Movimientos por lote: entrada con proveedor, salida bloqueada si el lote venció
--   4. Activos (equipos) por número de serie, con estado y ubicación
--   5. Alertas de caducidad a 15 y 30 días (vista v_lotes_por_vencer)
--   6. Dashboard con los lotes vencidos y por vencer
--
-- Reglas:
--   - categoria 'equipo'                  → se controla por número de serie (activos)
--   - categoria 'medicamento' / 'insumo'  → se controla por lote (lotes_inventario)
--   - inventario_items.stock_actual queda como total calculado por triggers:
--     suma de los lotes, o cantidad de activos que no están dados de baja.
-- =============================================================================

-- Antes de este cambio el stock no tenía lote ni número de serie. Si ya hay
-- stock cargado no se puede inventar su caducidad: hay que registrarlo de nuevo.
do $$
begin
  if exists (select 1 from public.inventario_items where stock_actual <> 0) then
    raise exception 'Hay ítems de inventario con stock sin lote ni número de serie. '
      'Ponlos en 0 con un ajuste y vuelve a registrarlos como lotes o activos después de esta migración.';
  end if;
end;
$$;

-- Fecha de hoy en el horario del hospital (los lotes vencen por día, no por hora)
create or replace function public.hoy_local()
  returns date
  language sql
  stable
  set search_path to ''
  as $function$
  select (now() at time zone 'America/El_Salvador')::date;
$function$;

-- -----------------------------------------------------------------------------
-- 1. Proveedores
-- -----------------------------------------------------------------------------
create table public.proveedores (
  id         uuid        not null default gen_random_uuid(),
  nombre     text        not null,
  nit        text,
  nrc        text,
  contacto   text,
  telefono   text,
  email      text,
  direccion  text,
  activo     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proveedores_pkey primary key (id),
  constraint proveedores_nit_key unique (nit),
  constraint proveedores_nrc_key unique (nrc),
  constraint proveedores_nombre_check check (length(trim(nombre)) > 0),
  constraint proveedores_email_check check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

comment on table public.proveedores is
  'Proveedores de medicamentos, insumos y equipos. No se borran: se desactivan (activo = false).';
comment on column public.proveedores.contacto is 'Nombre de la persona de contacto.';

alter table public.proveedores enable row level security;

create trigger proveedores_updated_at
  before update on public.proveedores
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Lotes (medicamentos e insumos)
-- -----------------------------------------------------------------------------
create table public.lotes_inventario (
  id              uuid        not null default gen_random_uuid(),
  item_id         uuid        not null,
  numero_lote     text        not null,
  fecha_caducidad date        not null,
  cantidad_actual integer     not null default 0,
  created_at      timestamptz not null default now(),
  constraint lotes_inventario_pkey primary key (id),
  constraint lotes_inventario_item_id_fkey
    foreign key (item_id) references public.inventario_items (id) on delete restrict,
  constraint lotes_inventario_item_lote_key unique (item_id, numero_lote),
  constraint lotes_inventario_numero_lote_check check (length(trim(numero_lote)) > 0),
  constraint lotes_inventario_cantidad_actual_check check (cantidad_actual >= 0)
);

comment on table public.lotes_inventario is
  'Lotes de medicamentos e insumos. Cada unidad que sale se descuenta de un lote. '
  'cantidad_actual la mantiene el trigger de movimientos_inventario.';

-- Orden FEFO (primero el que vence antes)
create index lotes_inventario_item_caducidad_idx
  on public.lotes_inventario using btree (item_id, fecha_caducidad);

alter table public.lotes_inventario enable row level security;

-- Solo medicamentos e insumos llevan lote
create or replace function public.validar_lote_inventario()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if not exists (
    select 1 from public.inventario_items i
    where i.id = new.item_id and i.categoria in ('medicamento', 'insumo')
  ) then
    raise exception 'TIPO_CONTROL_INVALIDO: el ítem % no es medicamento ni insumo; los equipos van por número de serie', new.item_id
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create trigger lotes_inventario_validar
  before insert or update of item_id on public.lotes_inventario
  for each row execute function public.validar_lote_inventario();

-- -----------------------------------------------------------------------------
-- 3. Movimientos por lote
-- -----------------------------------------------------------------------------
alter table public.movimientos_inventario
  add column lote_id      uuid,
  add column proveedor_id uuid,
  add constraint movimientos_inventario_lote_id_fkey
    foreign key (lote_id) references public.lotes_inventario (id) on delete restrict,
  add constraint movimientos_inventario_proveedor_id_fkey
    foreign key (proveedor_id) references public.proveedores (id) on delete restrict;

comment on column public.movimientos_inventario.lote_id is 'Lote afectado. Obligatorio en movimientos nuevos.';
comment on column public.movimientos_inventario.proveedor_id is 'Proveedor de la entrada. Obligatorio si tipo = entrada.';

create index movimientos_inventario_lote_id_idx on public.movimientos_inventario using btree (lote_id);
create index movimientos_inventario_proveedor_id_idx on public.movimientos_inventario using btree (proveedor_id);

create or replace function public.validar_movimiento_inventario()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_categoria public.categoria_inventario;
  v_lote      public.lotes_inventario%rowtype;
begin
  select i.categoria into v_categoria from public.inventario_items i where i.id = new.item_id;

  if v_categoria = 'equipo' then
    raise exception 'TIPO_CONTROL_INVALIDO: los equipos se registran como activos con número de serie, no con movimientos'
      using errcode = 'P0001';
  end if;

  if new.lote_id is null then
    raise exception 'TIPO_CONTROL_INVALIDO: los medicamentos e insumos se mueven por lote (falta lote_id)'
      using errcode = 'P0001';
  end if;

  select * into v_lote from public.lotes_inventario l where l.id = new.lote_id;
  if v_lote.item_id is distinct from new.item_id then
    raise exception 'REFERENCIA_INVALIDA: el lote % no pertenece al ítem %', new.lote_id, new.item_id
      using errcode = 'P0001';
  end if;

  if new.tipo = 'entrada' then
    if new.proveedor_id is null
       or not exists (select 1 from public.proveedores p where p.id = new.proveedor_id and p.activo) then
      raise exception 'PROVEEDOR_INVALIDO: la entrada necesita un proveedor activo'
        using errcode = 'P0001';
    end if;
  else
    new.proveedor_id := null;  -- el proveedor solo aplica a las entradas
  end if;

  -- Un lote vencido no entra ni sale; solo se puede dar de baja con un ajuste
  if new.tipo in ('entrada', 'salida') and v_lote.fecha_caducidad < public.hoy_local() then
    raise exception 'LOTE_VENCIDO: el lote % venció el %', v_lote.numero_lote, v_lote.fecha_caducidad
      using errcode = 'P0001', hint = 'Para descartarlo usa un movimiento de tipo ajuste';
  end if;

  return new;
end;
$function$;

create trigger movimientos_validar
  before insert on public.movimientos_inventario
  for each row execute function public.validar_movimiento_inventario();

-- Aplica el movimiento al lote y al total del ítem. El UPDATE con condición es
-- atómico: dos salidas simultáneas del mismo lote no pueden dejarlo negativo.
create or replace function public.aplicar_movimiento_inventario()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_delta integer := case new.tipo
                       when 'entrada' then new.cantidad
                       when 'salida'  then -new.cantidad
                       else new.cantidad  -- ajuste (con signo)
                     end;
begin
  update public.lotes_inventario
  set cantidad_actual = cantidad_actual + v_delta
  where id = new.lote_id and cantidad_actual + v_delta >= 0;

  if not found then
    raise exception 'STOCK_INSUFICIENTE: el lote % no tiene unidades suficientes', new.lote_id
      using errcode = 'P0001';
  end if;

  update public.inventario_items
  set stock_actual = stock_actual + v_delta
  where id = new.item_id;

  return new;
end;
$function$;

-- Entrada de un lote en una sola llamada: crea el lote si no existe y registra
-- la entrada. Si el número de lote ya existe con otra caducidad, lo rechaza.
create or replace function public.registrar_entrada_lote(
  p_item_id         uuid,
  p_numero_lote     text,
  p_fecha_caducidad date,
  p_cantidad        integer,
  p_proveedor_id    uuid,
  p_registrado_por  uuid,
  p_motivo          text default null
)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_lote          public.lotes_inventario%rowtype;
  v_movimiento_id uuid;
begin
  insert into public.lotes_inventario (item_id, numero_lote, fecha_caducidad)
  values (p_item_id, upper(trim(p_numero_lote)), p_fecha_caducidad)
  on conflict (item_id, numero_lote) do nothing;

  select * into v_lote
  from public.lotes_inventario
  where item_id = p_item_id and numero_lote = upper(trim(p_numero_lote))
  for update;

  if v_lote.fecha_caducidad <> p_fecha_caducidad then
    raise exception 'LOTE_CADUCIDAD_DISTINTA: el lote % ya existe con caducidad %', v_lote.numero_lote, v_lote.fecha_caducidad
      using errcode = 'P0001';
  end if;

  insert into public.movimientos_inventario (item_id, lote_id, tipo, cantidad, proveedor_id, motivo, registrado_por)
  values (p_item_id, v_lote.id, 'entrada', p_cantidad, p_proveedor_id, p_motivo, p_registrado_por)
  returning id into v_movimiento_id;

  return v_movimiento_id;
end;
$function$;

comment on function public.registrar_entrada_lote(uuid, text, date, integer, uuid, uuid, text) is
  'Registra la entrada de un lote (lo crea si no existe). Devuelve el id del movimiento.';

-- -----------------------------------------------------------------------------
-- 4. Activos (equipos) por número de serie
-- -----------------------------------------------------------------------------
create type public.estado_activo as enum (
  'disponible',
  'en_uso',
  'en_mantenimiento',
  'dado_de_baja'
);

grant usage on type public.estado_activo to postgres;

create table public.activos (
  id             uuid                 not null default gen_random_uuid(),
  item_id        uuid                 not null,
  numero_serie   text                 not null,
  proveedor_id   uuid                 not null,
  estado         public.estado_activo not null default 'disponible',
  ubicacion      text,
  fecha_ingreso  date                 not null default public.hoy_local(),
  notas          text,
  registrado_por uuid                 not null,
  created_at     timestamptz          not null default now(),
  updated_at     timestamptz          not null default now(),
  constraint activos_pkey primary key (id),
  constraint activos_item_id_fkey
    foreign key (item_id) references public.inventario_items (id) on delete restrict,
  constraint activos_proveedor_id_fkey
    foreign key (proveedor_id) references public.proveedores (id) on delete restrict,
  constraint activos_registrado_por_fkey
    foreign key (registrado_por) references public.perfiles (id) on delete restrict,
  constraint activos_item_serie_key unique (item_id, numero_serie),
  constraint activos_numero_serie_check check (length(trim(numero_serie)) > 0)
);

comment on table public.activos is
  'Equipos controlados uno por uno por número de serie. dado_de_baja es definitivo.';
comment on column public.activos.ubicacion is 'Texto libre (ej. "Quirófano 1", "HAB-203").';

create index activos_proveedor_id_idx on public.activos using btree (proveedor_id);
create index activos_estado_idx on public.activos using btree (estado);

alter table public.activos enable row level security;

create trigger activos_updated_at
  before update on public.activos
  for each row execute function public.set_updated_at();

create or replace function public.validar_activo()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if tg_op = 'UPDATE' and old.estado = 'dado_de_baja' then
    raise exception 'ACTIVO_DADO_DE_BAJA: el activo % ya está dado de baja', old.numero_serie
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.inventario_items i where i.id = new.item_id and i.categoria = 'equipo') then
    raise exception 'TIPO_CONTROL_INVALIDO: el ítem % no es un equipo; medicamentos e insumos van por lote', new.item_id
      using errcode = 'P0001';
  end if;

  if (tg_op = 'INSERT' or new.proveedor_id is distinct from old.proveedor_id)
     and not exists (select 1 from public.proveedores p where p.id = new.proveedor_id and p.activo) then
    raise exception 'PROVEEDOR_INVALIDO: el activo necesita un proveedor activo'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

create trigger activos_validar
  before insert or update on public.activos
  for each row execute function public.validar_activo();

-- stock_actual de un equipo = activos que no están dados de baja.
-- Se suma o resta 1 (no se recuenta) para que sea seguro con inserciones simultáneas.
create or replace function public.contar_activos_en_stock()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.estado <> 'dado_de_baja' then
    update public.inventario_items set stock_actual = stock_actual - 1 where id = old.item_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.estado <> 'dado_de_baja' then
    update public.inventario_items set stock_actual = stock_actual + 1 where id = new.item_id;
  end if;
  return null;
end;
$function$;

create trigger activos_stock
  after insert or update of item_id, estado or delete on public.activos
  for each row execute function public.contar_activos_en_stock();

-- Un ítem con lotes o activos no puede cambiar de categoría (cambiaría su tipo de control)
create or replace function public.proteger_categoria_inventario()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if exists (select 1 from public.lotes_inventario l where l.item_id = old.id)
     or exists (select 1 from public.activos a where a.item_id = old.id) then
    raise exception 'TIPO_CONTROL_INVALIDO: el ítem % ya tiene lotes o activos; no puede cambiar de categoría', old.codigo
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create trigger inventario_items_proteger_categoria
  before update of categoria on public.inventario_items
  for each row when (old.categoria is distinct from new.categoria)
  execute function public.proteger_categoria_inventario();

-- -----------------------------------------------------------------------------
-- 5. Alertas de caducidad: lotes con existencias vencidos o que vencen en ≤ 30 días
--    alerta: 'vencido' (ya pasó la fecha), '15_dias' (0 a 15 días), '30_dias' (16 a 30 días)
-- -----------------------------------------------------------------------------
create or replace view public.v_lotes_por_vencer
  with (security_invoker = true)
  as
select
  l.id                                  as lote_id,
  l.item_id,
  i.codigo                              as item_codigo,
  i.nombre                              as item_nombre,
  i.categoria,
  l.numero_lote,
  l.fecha_caducidad,
  l.cantidad_actual,
  (l.fecha_caducidad - public.hoy_local()) as dias_restantes,
  case
    when l.fecha_caducidad < public.hoy_local()       then 'vencido'
    when l.fecha_caducidad <= public.hoy_local() + 15 then '15_dias'
    else '30_dias'
  end                                   as alerta
from public.lotes_inventario l
join public.inventario_items i on i.id = l.item_id and i.activo
where l.cantidad_actual > 0
  and l.fecha_caducidad <= public.hoy_local() + 30;

comment on view public.v_lotes_por_vencer is
  'Alertas de caducidad (15 y 30 días) de lotes con existencias. Solo la lee la API.';

revoke all on public.v_lotes_por_vencer from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Dashboard: se agregan los lotes vencidos y por vencer.
--    Se recrea porque las columnas nuevas no van al final (generado_en lo es).
-- -----------------------------------------------------------------------------
drop view public.v_dashboard_summary;

create view public.v_dashboard_summary
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
  (select count(*) from public.v_lotes_por_vencer where alerta = 'vencido')::int       as lotes_vencidos,
  (select count(*) from public.v_lotes_por_vencer where alerta = '15_dias')::int       as lotes_vencen_15_dias,
  (select count(*) from public.v_lotes_por_vencer where alerta = '30_dias')::int       as lotes_vencen_30_dias,
  (select ts from ahora)                                                               as generado_en;

comment on view public.v_dashboard_summary is
  'Resumen del panel administrativo (HUNI-45): una fila con agregados, sin datos de pacientes. Solo lo lee la API.';

revoke all on public.v_dashboard_summary from anon, authenticated;

-- Las funciones de inventario las usa solo la API
revoke execute on function public.registrar_entrada_lote(uuid, text, date, integer, uuid, uuid, text) from anon, authenticated;
