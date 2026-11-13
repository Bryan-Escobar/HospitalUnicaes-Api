-- HUNI-98: un ítem solo se desactiva con stock 0 y, desactivado, no admite movimientos ni activos nuevos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Ítems de prueba: un insumo y un equipo, sin stock
insert into public.inventario_items (id, codigo, nombre, categoria, unidad_medida) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'TST-0001', 'Insumo de prueba', 'insumo', 'unidad'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'TST-0002', 'Equipo de prueba', 'equipo', 'unidad');

select set_config('t.admin', '11111111-1111-4111-8111-000000000001', true);
select set_config('t.proveedor', (select id::text from public.proveedores where activo order by nombre limit 1), true);

-- ---------- Con existencias no se desactiva ----------
select throws_like(
  $$ update public.inventario_items set activo = false where codigo = 'MED-0001' $$,
  'ITEM_CON_EXISTENCIAS%',
  'un medicamento con lotes con unidades no se desactiva'
);
select throws_like(
  $$ update public.inventario_items set activo = false where codigo = 'EQP-0001' $$,
  'ITEM_CON_EXISTENCIAS%',
  'un equipo con activos que no están dados de baja no se desactiva'
);

-- Insumo con un lote: se descarta con un ajuste y después sí se desactiva
select public.registrar_entrada_lote('aaaaaaaa-0000-4000-8000-000000000001', 'TST-L1', public.hoy_local() + 60, 10,
                                     current_setting('t.proveedor')::uuid, current_setting('t.admin')::uuid);
select throws_like(
  $$ update public.inventario_items set activo = false where codigo = 'TST-0001' $$,
  'ITEM_CON_EXISTENCIAS%',
  'el insumo con 10 unidades no se desactiva'
);

insert into public.movimientos_inventario (item_id, lote_id, tipo, cantidad, motivo, registrado_por)
select l.item_id, l.id, 'ajuste', -10, 'Descarte para la prueba', current_setting('t.admin')::uuid
from public.lotes_inventario l where l.numero_lote = 'TST-L1';

select lives_ok(
  $$ update public.inventario_items set activo = false where codigo = 'TST-0001' $$,
  'con stock 0 el insumo sí se desactiva'
);
select lives_ok(
  $$ update public.inventario_items set activo = false where codigo = 'TST-0002' $$,
  'un equipo sin activos se desactiva'
);

-- ---------- Desactivado no admite movimientos ni activos ----------
select throws_like(
  format($$ select public.registrar_entrada_lote('aaaaaaaa-0000-4000-8000-000000000001', 'TST-L2',
             public.hoy_local() + 60, 5, %L::uuid, %L::uuid) $$,
         current_setting('t.proveedor'), current_setting('t.admin')),
  'ITEM_INACTIVO%',
  'no se registran entradas en un ítem desactivado'
);
select is(
  (select count(*)::int from public.lotes_inventario where numero_lote = 'TST-L2'),
  0,
  'la entrada rechazada no deja un lote vacío creado'
);
select throws_like(
  $$ insert into public.movimientos_inventario (item_id, lote_id, tipo, cantidad, motivo, registrado_por)
     select l.item_id, l.id, 'ajuste', 1, 'x', '11111111-1111-4111-8111-000000000001'
     from public.lotes_inventario l where l.numero_lote = 'TST-L1' $$,
  'ITEM_INACTIVO%',
  'tampoco se registran ajustes'
);
select throws_like(
  format($$ insert into public.activos (item_id, numero_serie, proveedor_id, registrado_por)
            values ('aaaaaaaa-0000-4000-8000-000000000002', 'SER-0001', %L::uuid, %L::uuid) $$,
         current_setting('t.proveedor'), current_setting('t.admin')),
  'ITEM_INACTIVO%',
  'no se registran equipos nuevos en un ítem desactivado'
);

-- ---------- Reactivado vuelve a moverse ----------
update public.inventario_items set activo = true where codigo = 'TST-0001';
select lives_ok(
  format($$ select public.registrar_entrada_lote('aaaaaaaa-0000-4000-8000-000000000001', 'TST-L2',
             public.hoy_local() + 60, 5, %L::uuid, %L::uuid) $$,
         current_setting('t.proveedor'), current_setting('t.admin')),
  'al reactivarlo vuelve a admitir entradas'
);
select is(
  (select stock_actual from public.inventario_items where codigo = 'TST-0001'),
  5,
  'el stock refleja la nueva entrada'
);

select * from finish();
rollback;
