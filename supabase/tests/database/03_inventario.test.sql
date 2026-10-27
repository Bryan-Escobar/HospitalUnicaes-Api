-- HUNI-97: inventario por lote (medicamentos/insumos) y por número de serie (equipos), con proveedores.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------- Seed ----------
select is((select count(*)::int from public.proveedores where nit like '0614-%'), 2, 'el seed carga 2 proveedores');
select is((select stock_actual from public.inventario_items where codigo = 'MED-0001'), 420,
  'el stock de un medicamento es la suma de sus lotes');
select is((select stock_actual from public.inventario_items where codigo = 'EQP-0001'), 2,
  'el stock de un equipo es la cantidad de activos que no están dados de baja');

-- ---------- Alertas de caducidad ----------
select is((select alerta from public.v_lotes_por_vencer where numero_lote = 'PCT-2401'), '15_dias',
  'un lote que vence en 10 días tiene alerta de 15 días');
select is((select alerta from public.v_lotes_por_vencer where numero_lote = 'AMX-2403'), '30_dias',
  'un lote que vence en 25 días tiene alerta de 30 días');
select ok(not exists (select 1 from public.v_lotes_por_vencer where numero_lote = 'PCT-2402'),
  'un lote que vence en más de 30 días no tiene alerta');
select ok((select lotes_vencen_15_dias >= 1 and lotes_vencen_30_dias >= 1 from public.v_dashboard_summary),
  'el dashboard cuenta los lotes por vencer');

-- ---------- Movimientos por lote ----------
-- Salida normal
insert into public.movimientos_inventario (item_id, lote_id, tipo, cantidad, registrado_por)
select l.item_id, l.id, 'salida', 20, '11111111-1111-4111-8111-000000000001'
from public.lotes_inventario l where l.numero_lote = 'PCT-2402';

select is((select cantidad_actual from public.lotes_inventario where numero_lote = 'PCT-2402'), 280,
  'la salida descuenta del lote');
select is((select stock_actual from public.inventario_items where codigo = 'MED-0001'), 400,
  'la salida descuenta del total del ítem');

select throws_like(
  $$ insert into public.movimientos_inventario (item_id, lote_id, tipo, cantidad, registrado_por)
     select l.item_id, l.id, 'salida', 1000, '11111111-1111-4111-8111-000000000001'
     from public.lotes_inventario l where l.numero_lote = 'PCT-2402' $$,
  'STOCK_INSUFICIENTE:%', 'no se puede sacar más de lo que tiene el lote'
);
select throws_like(
  $$ insert into public.movimientos_inventario (item_id, tipo, cantidad, registrado_por)
     select id, 'salida', 1, '11111111-1111-4111-8111-000000000001' from public.inventario_items where codigo = 'MED-0001' $$,
  'TIPO_CONTROL_INVALIDO:%', 'un medicamento no se mueve sin lote'
);
select throws_like(
  $$ insert into public.movimientos_inventario (item_id, lote_id, tipo, cantidad, registrado_por)
     select i.id, l.id, 'salida', 1, '11111111-1111-4111-8111-000000000001'
     from public.inventario_items i, public.lotes_inventario l
     where i.codigo = 'MED-0002' and l.numero_lote = 'PCT-2402' $$,
  'REFERENCIA_INVALIDA:%', 'el lote debe ser del mismo ítem'
);

-- Entradas: proveedor obligatorio y activo
select throws_like(
  $$ insert into public.movimientos_inventario (item_id, lote_id, tipo, cantidad, registrado_por)
     select l.item_id, l.id, 'entrada', 10, '11111111-1111-4111-8111-000000000001'
     from public.lotes_inventario l where l.numero_lote = 'PCT-2402' $$,
  'PROVEEDOR_INVALIDO:%', 'una entrada sin proveedor se rechaza'
);
update public.proveedores set activo = false where nit = '0614-020290-102-1';
select throws_like(
  $$ select public.registrar_entrada_lote(i.id, 'PCT-9999', public.hoy_local() + 200, 10, p.id,
                                         '11111111-1111-4111-8111-000000000001')
     from public.inventario_items i, public.proveedores p
     where i.codigo = 'MED-0001' and p.nit = '0614-020290-102-1' $$,
  'PROVEEDOR_INVALIDO:%', 'una entrada con proveedor desactivado se rechaza'
);

-- registrar_entrada_lote: mismo lote suma, otra caducidad se rechaza
select lives_ok(
  $$ select public.registrar_entrada_lote(i.id, 'pct-2402', l.fecha_caducidad, 20, p.id,
                                         '11111111-1111-4111-8111-000000000001')
     from public.inventario_items i
     join public.lotes_inventario l on l.item_id = i.id and l.numero_lote = 'PCT-2402'
     join public.proveedores p on p.nit = '0614-010190-101-0'
     where i.codigo = 'MED-0001' $$,
  'una entrada a un lote existente con la misma caducidad se acepta'
);
select is((select cantidad_actual from public.lotes_inventario where numero_lote = 'PCT-2402'), 300,
  'la entrada suma al lote existente (el número de lote se normaliza a mayúsculas)');
select throws_like(
  $$ select public.registrar_entrada_lote(i.id, 'PCT-2402', public.hoy_local() + 5, 20, p.id,
                                         '11111111-1111-4111-8111-000000000001')
     from public.inventario_items i, public.proveedores p
     where i.codigo = 'MED-0001' and p.nit = '0614-010190-101-0' $$,
  'LOTE_CADUCIDAD_DISTINTA:%', 'el mismo lote no puede tener dos fechas de caducidad'
);

-- Lote vencido: no sale, pero se puede descartar con un ajuste
update public.lotes_inventario set fecha_caducidad = public.hoy_local() - 1 where numero_lote = 'PCT-2401';
select throws_like(
  $$ insert into public.movimientos_inventario (item_id, lote_id, tipo, cantidad, registrado_por)
     select l.item_id, l.id, 'salida', 1, '11111111-1111-4111-8111-000000000001'
     from public.lotes_inventario l where l.numero_lote = 'PCT-2401' $$,
  'LOTE_VENCIDO:%', 'no se puede sacar de un lote vencido'
);
select lives_ok(
  $$ insert into public.movimientos_inventario (item_id, lote_id, tipo, cantidad, motivo, registrado_por)
     select l.item_id, l.id, 'ajuste', -l.cantidad_actual, 'Descarte por vencimiento', '11111111-1111-4111-8111-000000000001'
     from public.lotes_inventario l where l.numero_lote = 'PCT-2401' $$,
  'un lote vencido se puede descartar con un ajuste'
);

-- ---------- Tipo de control según la categoría ----------
select throws_like(
  $$ insert into public.lotes_inventario (item_id, numero_lote, fecha_caducidad)
     select id, 'X-1', public.hoy_local() + 100 from public.inventario_items where codigo = 'EQP-0001' $$,
  'TIPO_CONTROL_INVALIDO:%', 'un equipo no lleva lote'
);
select throws_like(
  $$ insert into public.activos (item_id, numero_serie, proveedor_id, registrado_por)
     select i.id, 'S-1', p.id, '11111111-1111-4111-8111-000000000001'
     from public.inventario_items i, public.proveedores p
     where i.codigo = 'MED-0001' and p.nit = '0614-010190-101-0' $$,
  'TIPO_CONTROL_INVALIDO:%', 'un medicamento no lleva número de serie'
);

-- ---------- Activos ----------
select throws_ok(
  $$ insert into public.activos (item_id, numero_serie, proveedor_id, registrado_por)
     select i.id, 'MSV-10001', p.id, '11111111-1111-4111-8111-000000000001'
     from public.inventario_items i, public.proveedores p
     where i.codigo = 'EQP-0001' and p.nit = '0614-010190-101-0' $$,
  '23505', null, 'un número de serie no se repite en el mismo equipo'
);

update public.activos set estado = 'dado_de_baja' where numero_serie = 'MSV-10002';
select is((select stock_actual from public.inventario_items where codigo = 'EQP-0001'), 1,
  'dar de baja un activo lo saca del stock');
select throws_like(
  $$ update public.activos set estado = 'disponible' where numero_serie = 'MSV-10002' $$,
  'ACTIVO_DADO_DE_BAJA:%', 'un activo dado de baja no vuelve a cambiar'
);

select * from finish();
rollback;
