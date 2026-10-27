-- =============================================================================
-- HUNI-57: cada registro clínico guarda autor y fecha, y nada cambia al cerrar la consulta
--
--   1. diagnosticos, recetas y ordenes_laboratorio: registrado_por (personal que lo creó)
--      y la fecha que faltaba (diagnosticos.created_at). Si no se envía el autor, se usa el
--      doctor de la consulta (así siguen funcionando el seed y cualquier inserción vieja).
--   2. receta_detalles y orden_examenes: tampoco se agregan ni se borran con la consulta cerrada
--      (orden_examenes sí se puede actualizar: laboratorio cambia el estado de cada examen).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Autor y fecha
-- -----------------------------------------------------------------------------
alter table public.diagnosticos
  add column registrado_por uuid,
  add column created_at timestamptz not null default now();

alter table public.recetas
  add column registrado_por uuid;

alter table public.ordenes_laboratorio
  add column registrado_por uuid;

-- Registros existentes: el autor es el doctor de su consulta. Los triggers de "consulta cerrada"
-- se apagan solo durante este relleno (si no, rechazarían el UPDATE de consultas ya cerradas).
alter table public.diagnosticos disable trigger diagnosticos_consulta_abierta;
alter table public.recetas disable trigger recetas_consulta_abierta;

update public.diagnosticos d
set registrado_por = c.doctor_id, created_at = c.fecha
from public.consultas c
where c.id = d.consulta_id;

update public.recetas r
set registrado_por = c.doctor_id
from public.consultas c
where c.id = r.consulta_id;

update public.ordenes_laboratorio o
set registrado_por = c.doctor_id
from public.consultas c
where c.id = o.consulta_id;

alter table public.diagnosticos enable trigger diagnosticos_consulta_abierta;
alter table public.recetas enable trigger recetas_consulta_abierta;

alter table public.diagnosticos
  alter column registrado_por set not null,
  add constraint diagnosticos_registrado_por_fkey
    foreign key (registrado_por) references public.personal (id) on delete restrict;

alter table public.recetas
  alter column registrado_por set not null,
  add constraint recetas_registrado_por_fkey
    foreign key (registrado_por) references public.personal (id) on delete restrict;

alter table public.ordenes_laboratorio
  alter column registrado_por set not null,
  add constraint ordenes_laboratorio_registrado_por_fkey
    foreign key (registrado_por) references public.personal (id) on delete restrict;

comment on column public.diagnosticos.registrado_por is 'Empleado (personal) que registró el diagnóstico (HUNI-57).';
comment on column public.recetas.registrado_por is 'Empleado (personal) que emitió la receta (HUNI-57).';
comment on column public.ordenes_laboratorio.registrado_por is 'Empleado (personal) que solicitó los exámenes (HUNI-57).';

create index if not exists diagnosticos_consulta_id_idx on public.diagnosticos using btree (consulta_id);
create index if not exists recetas_consulta_id_idx on public.recetas using btree (consulta_id);
create index if not exists ordenes_laboratorio_consulta_id_idx on public.ordenes_laboratorio using btree (consulta_id);

-- Sin autor explícito, el autor es el doctor de la consulta.
create or replace function public.asignar_autor_registro_clinico()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if new.registrado_por is null then
    select c.doctor_id into new.registrado_por from public.consultas c where c.id = new.consulta_id;
  end if;
  return new;
end;
$function$;

create trigger diagnosticos_autor
  before insert on public.diagnosticos
  for each row execute function public.asignar_autor_registro_clinico();

create trigger recetas_autor
  before insert on public.recetas
  for each row execute function public.asignar_autor_registro_clinico();

create trigger ordenes_laboratorio_autor
  before insert on public.ordenes_laboratorio
  for each row execute function public.asignar_autor_registro_clinico();

-- -----------------------------------------------------------------------------
-- 2. Detalles de receta y exámenes de una orden: congelados al cerrar la consulta
-- -----------------------------------------------------------------------------
create or replace function public.verificar_consulta_abierta_detalle()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_fila        record := case when tg_op = 'DELETE' then old else new end;
  v_consulta_id uuid;
begin
  if tg_table_name = 'receta_detalles' then
    select r.consulta_id into v_consulta_id from public.recetas r where r.id = v_fila.receta_id;
  else
    select o.consulta_id into v_consulta_id from public.ordenes_laboratorio o where o.id = v_fila.orden_id;
  end if;

  if exists (select 1 from public.consultas c where c.id = v_consulta_id and c.cerrada_en is not null) then
    raise exception 'CONSULTA_CERRADA: la consulta % ya está cerrada', v_consulta_id
      using errcode = 'P0001', hint = 'Las consultas cerradas no se pueden modificar';
  end if;
  return v_fila;
end;
$function$;

create trigger receta_detalles_consulta_abierta
  before insert or update or delete on public.receta_detalles
  for each row execute function public.verificar_consulta_abierta_detalle();

create trigger orden_examenes_consulta_abierta
  before insert or delete on public.orden_examenes
  for each row execute function public.verificar_consulta_abierta_detalle();

revoke execute on function public.asignar_autor_registro_clinico(), public.verificar_consulta_abierta_detalle()
  from public, anon, authenticated;
