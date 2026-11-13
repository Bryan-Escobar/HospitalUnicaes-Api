-- =============================================================================
-- HUNI-98: ítems de inventario desactivados (decisión del equipo, 2026-11-12)
--
--   1. Un ítem solo se desactiva con stock 0 (ITEM_CON_EXISTENCIAS). Antes hay que descartar sus lotes
--      con un ajuste o dar de baja sus equipos, para que no quede stock fuera de las alertas de caducidad.
--   2. Un ítem desactivado no admite movimientos (entradas, salidas ni ajustes) ni activos nuevos
--      (ITEM_INACTIVO). Para moverlo otra vez se reactiva (activo = true).
-- =============================================================================

create or replace function public.validar_desactivacion_item()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if new.stock_actual > 0 then
    raise exception 'ITEM_CON_EXISTENCIAS: el ítem % todavía tiene % unidades', old.codigo, new.stock_actual
      using errcode = 'P0001',
            hint = 'Descarta sus lotes con un ajuste o da de baja sus equipos antes de desactivarlo';
  end if;
  return new;
end;
$function$;

create trigger inventario_items_validar_desactivacion
  before update of activo on public.inventario_items
  for each row when (old.activo and not new.activo)
  execute function public.validar_desactivacion_item();

-- Movimientos y activos nuevos: el ítem debe estar activo. Bloquea la fila del ítem para que una
-- desactivación simultánea espere a que termine el movimiento (y vea su stock).
create or replace function public.exigir_item_activo()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  perform 1 from public.inventario_items i where i.id = new.item_id and i.activo for update;
  if not found then
    raise exception 'ITEM_INACTIVO: el ítem % está desactivado', new.item_id
      using errcode = 'P0001', hint = 'Reactívalo (activo = true) antes de registrar movimientos o equipos';
  end if;
  return new;
end;
$function$;

create trigger movimientos_exigir_item_activo
  before insert on public.movimientos_inventario
  for each row execute function public.exigir_item_activo();

create trigger activos_exigir_item_activo
  before insert on public.activos
  for each row execute function public.exigir_item_activo();
