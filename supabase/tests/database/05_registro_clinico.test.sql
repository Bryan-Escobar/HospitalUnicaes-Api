-- HUNI-57: cada registro clínico guarda autor y fecha; con la consulta cerrada nada cambia
-- (ni los detalles de la receta ni los exámenes de una orden).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Consulta abierta de Carlos con el doctor demo (EMP-0002)
insert into public.consultas (id, expediente_id, doctor_id, motivo_consulta)
select '66666666-6666-4666-8666-000000000001', e.id, d.id, 'Prueba HUNI-57'
from public.pacientes pa
join public.expedientes e on e.paciente_id = pa.id
join public.personal d on d.codigo_empleado = 'EMP-0002'
where pa.perfil_id = '11111111-1111-4111-8111-000000000004';

-- ---------- Autor y fecha ----------
insert into public.diagnosticos (id, consulta_id, descripcion)
values ('66666666-6666-4666-8666-000000000011', '66666666-6666-4666-8666-000000000001', 'Cefalea tensional');

select is(
  (select registrado_por from public.diagnosticos where id = '66666666-6666-4666-8666-000000000011'),
  (select id from public.personal where codigo_empleado = 'EMP-0002'),
  'sin autor explícito, el diagnóstico queda a nombre del doctor de la consulta'
);
select ok(
  (select created_at from public.diagnosticos where id = '66666666-6666-4666-8666-000000000011') is not null,
  'el diagnóstico guarda su fecha de registro'
);

insert into public.recetas (id, consulta_id, registrado_por)
select '66666666-6666-4666-8666-000000000021', '66666666-6666-4666-8666-000000000001', id
from public.personal where codigo_empleado = 'EMP-0005';
select is(
  (select registrado_por from public.recetas where id = '66666666-6666-4666-8666-000000000021'),
  (select id from public.personal where codigo_empleado = 'EMP-0005'),
  'si se envía el autor, se respeta'
);

insert into public.receta_detalles (receta_id, medicamento)
values ('66666666-6666-4666-8666-000000000021', 'Ibuprofeno 400 mg');

insert into public.ordenes_laboratorio (id, consulta_id)
values ('66666666-6666-4666-8666-000000000031', '66666666-6666-4666-8666-000000000001');
select is(
  (select registrado_por from public.ordenes_laboratorio where id = '66666666-6666-4666-8666-000000000031'),
  (select id from public.personal where codigo_empleado = 'EMP-0002'),
  'la orden de laboratorio también guarda su autor'
);
insert into public.orden_examenes (orden_id, examen_id)
select '66666666-6666-4666-8666-000000000031', id from public.examenes_catalogo where nombre = 'Hemograma completo';

select throws_ok(
  $$ insert into public.diagnosticos (consulta_id, descripcion, registrado_por)
     values ('66666666-6666-4666-8666-000000000001', 'X', gen_random_uuid()) $$,
  '23503', null, 'el autor debe ser un empleado que existe'
);

-- ---------- La receta no toca el inventario ----------
select is(
  (select stock_actual from public.inventario_items where codigo = 'MED-0001'),
  (select coalesce(sum(cantidad_actual), 0)::int from public.lotes_inventario l
     join public.inventario_items i on i.id = l.item_id where i.codigo = 'MED-0001'),
  'antes de recetar: el stock es la suma de los lotes'
);
insert into public.receta_detalles (receta_id, item_id, medicamento, cantidad)
select '66666666-6666-4666-8666-000000000021', id, 'Paracetamol 500 mg', 30
from public.inventario_items where codigo = 'MED-0001';
select is(
  (select stock_actual from public.inventario_items where codigo = 'MED-0001'),
  (select coalesce(sum(cantidad_actual), 0)::int from public.lotes_inventario l
     join public.inventario_items i on i.id = l.item_id where i.codigo = 'MED-0001'),
  'recetar un ítem del inventario (item_id) no descuenta stock'
);

-- ---------- Consulta cerrada: nada cambia ----------
update public.consultas set cerrada_en = now() where id = '66666666-6666-4666-8666-000000000001';

select throws_like(
  $$ insert into public.receta_detalles (receta_id, medicamento)
     values ('66666666-6666-4666-8666-000000000021', 'Otro') $$,
  'CONSULTA_CERRADA%', 'a una receta de consulta cerrada no se le agregan medicamentos'
);
select throws_like(
  $$ update public.receta_detalles set dosis = '2 tabletas'
     where receta_id = '66666666-6666-4666-8666-000000000021' $$,
  'CONSULTA_CERRADA%', 'los medicamentos de una receta cerrada no se editan'
);
select throws_like(
  $$ delete from public.receta_detalles where receta_id = '66666666-6666-4666-8666-000000000021' $$,
  'CONSULTA_CERRADA%', 'los medicamentos de una receta cerrada no se borran'
);
select throws_like(
  $$ insert into public.orden_examenes (orden_id, examen_id)
     select '66666666-6666-4666-8666-000000000031', id from public.examenes_catalogo where nombre = 'Creatinina' $$,
  'CONSULTA_CERRADA%', 'a una orden de consulta cerrada no se le agregan exámenes'
);
select lives_ok(
  $$ update public.orden_examenes set estado = 'en_proceso', fecha_inicio = now()
     where orden_id = '66666666-6666-4666-8666-000000000031' $$,
  'laboratorio sí puede avanzar el estado de un examen aunque la consulta esté cerrada'
);

select * from finish();
rollback;
