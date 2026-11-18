-- =============================================================================
-- HUNI-102: el área del turno sale de un catálogo (antes era texto libre)
--
--   1. Catálogo `areas_hospital` (context.md §3.2: la lista no es cerrada). Crece sin migraciones: el
--      administrador agrega, renombra, reordena o desactiva áreas. No se borran: se desactivan.
--   2. `turnos_personal.area` sigue siendo texto (v_turnos, estado_publico(), Web e iOS no cambian), pero al
--      crear un turno o cambiarle el área el trigger `validar_area_turno` exige un área activa del catálogo
--      → AREA_INVALIDA. Se guarda el nombre tal como está en el catálogo (sin espacios ni otras mayúsculas),
--      así la vista del día agrupa siempre bajo el mismo nombre.
--   3. Renombrar un área en el catálogo renombra también sus turnos (sigue agrupando igual).
--   4. RLS: cualquier usuario con sesión lee las áreas activas; el administrador las lee todas y las crea y
--      edita directo desde Supabase, igual que los turnos (HUNI-51). Nadie las borra con su token.
--
-- Los turnos que ya existen no se revalidan: si su área no está en el catálogo se conservan, y al ajustarlos
-- solo se exige un área válida cuando se cambia el área (los clientes obligan a elegir una de la lista).
-- Errores como 'CODIGO: detalle' con SQLSTATE PTxxx (mismo patrón que HUNI-51).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catálogo
-- -----------------------------------------------------------------------------
create table public.areas_hospital (
  id         uuid        not null default gen_random_uuid(),
  nombre     text        not null,
  activo     boolean     not null default true,
  orden      smallint    not null default 0,
  created_at timestamptz not null default now(),
  constraint areas_hospital_pkey primary key (id),
  constraint areas_hospital_nombre_key unique (nombre),
  constraint areas_hospital_nombre_check check (length(trim(nombre)) > 0 and nombre = btrim(nombre))
);

-- "Emergencia" y "emergencia" son la misma área.
create unique index areas_hospital_nombre_ci_key on public.areas_hospital (lower(nombre));

comment on table public.areas_hospital is
  'Catálogo editable de áreas del hospital donde se asignan turnos (HUNI-102). turnos_personal.area guarda el nombre.';
comment on column public.areas_hospital.activo is
  'Solo las áreas activas se ofrecen y se aceptan en turnos nuevos; las desactivadas se conservan en los turnos viejos.';
comment on column public.areas_hospital.orden is
  'Orden en que los clientes muestran la lista (menor primero; a igual orden, por nombre).';

alter table public.areas_hospital enable row level security;

-- Áreas iniciales: las que ya usan los turnos del seed y otras áreas comunes del hospital.
insert into public.areas_hospital (nombre, orden) values
  ('Consulta externa', 10),
  ('Emergencia',       20),
  ('Hospitalización',  30),
  ('Pediatría',        40),
  ('Medicina interna', 50),
  ('Cirugía',          60),
  ('Alergología',      70),
  ('Enfermería',       80),
  ('Laboratorio',      90),
  ('Recepción',        100)
on conflict (nombre) do nothing;

-- -----------------------------------------------------------------------------
-- 2. El área del turno debe ser una del catálogo
-- -----------------------------------------------------------------------------
create or replace function public.validar_area_turno()
  returns trigger
  language plpgsql
  security definer  -- ve todo el catálogo aunque quien llama tenga RLS
  set search_path to ''
  as $function$
declare
  v_nombre text;
begin
  -- Ajustar un turno sin cambiarle el área no lo revalida (los turnos anteriores al catálogo se conservan).
  if tg_op = 'UPDATE' and new.area is not distinct from old.area then
    return new;
  end if;

  -- Renombrar un área del catálogo actualiza sus turnos desde otro trigger: ese cambio siempre pasa.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select a.nombre into v_nombre
  from public.areas_hospital a
  where a.activo and lower(a.nombre) = lower(btrim(new.area));

  if v_nombre is null then
    raise exception using errcode = 'PT422', message = format(
      'AREA_INVALIDA: el área "%s" no está en el catálogo de áreas activas; elige una de la lista',
      coalesce(btrim(new.area), ''));
  end if;

  new.area := v_nombre;
  return new;
end;
$function$;

comment on function public.validar_area_turno() is
  'Exige que turnos_personal.area sea un área activa de areas_hospital al crear el turno o cambiarle el área (HUNI-102).';

create trigger turnos_personal_validar_area
  before insert or update of area on public.turnos_personal
  for each row execute function public.validar_area_turno();

-- -----------------------------------------------------------------------------
-- 3. Renombrar un área renombra sus turnos
-- -----------------------------------------------------------------------------
create or replace function public.renombrar_area_turnos()
  returns trigger
  language plpgsql
  security definer  -- actualiza los turnos aunque quien llama tenga RLS
  set search_path to ''
  as $function$
begin
  update public.turnos_personal t set area = new.nombre where t.area = old.nombre;
  return null;
end;
$function$;

create trigger areas_hospital_renombrar
  after update of nombre on public.areas_hospital
  for each row when (old.nombre is distinct from new.nombre)
  execute function public.renombrar_area_turnos();

-- -----------------------------------------------------------------------------
-- 4. RLS: lectura con sesión (activas; el administrador también las inactivas) y escritura del administrador
-- -----------------------------------------------------------------------------
revoke all on table public.areas_hospital from anon, authenticated;
grant select, insert, update on table public.areas_hospital to authenticated;
grant all on table public.areas_hospital to service_role;

create policy areas_hospital_leer on public.areas_hospital
  for select to authenticated
  using (
    (select public.rol_actual()) is not null
    and (activo or (select public.rol_actual()) = 'administrador')
  );

create policy areas_hospital_crear on public.areas_hospital
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrador');

create policy areas_hospital_editar on public.areas_hospital
  for update to authenticated
  using ((select public.rol_actual()) = 'administrador')
  with check ((select public.rol_actual()) = 'administrador');

revoke execute on function public.validar_area_turno(), public.renombrar_area_turnos()
from public, anon, authenticated;
