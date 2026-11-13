-- =============================================================================
-- HUNI-74: políticas RLS de privacidad y estado público (context.md §3.4)
--
--   1. Sin sesión (anon) no se lee ninguna tabla salvo los avisos públicos vigentes. Lo demás público
--      (ocupación agregada y médicos de turno) sale de la función `estado_publico()`.
--   2. Funciones de acceso: `es_personal()`, `puede_ver_historial(paciente)` y `puede_ver_consulta(consulta)`.
--   3. RLS de lectura en las tablas privadas que aún no tenían políticas:
--        - Datos personales (pacientes): administración, recepción, el médico tratante y el propio paciente.
--        - Expediente e historial (expedientes, consultas, diagnósticos, recetas y sus detalles):
--          administración, el médico tratante y el propio paciente. Recepción no ve información clínica.
--        - Cuentas (perfiles) y personal: administración y recepción; cada usuario ve su propia fila.
--        - Catálogos (especialidades, tipos de personal, exámenes): cualquier usuario con sesión.
--        - Avisos: los públicos y vigentes, todos (incluso sin sesión); los internos vigentes, solo el
--          personal; el administrador ve todos (también vencidos y programados).
--      Ya existían: laboratorio (HUNI-62), camas y hospitalizaciones (HUNI-66), turnos y citas (HUNI-51),
--      ambulancia (HUNI-70). `resultados_laboratorio` sigue sin política de lectura: el valor y el PDF los
--      entrega solo la API (HUNI-62).
--   4. Las tablas privadas solo se escriben desde la API (Prisma / service_role): sin INSERT, UPDATE ni DELETE
--      directos para anon ni authenticated.
--   5. `estado_publico()`: ocupación por tipo (solo cantidades), médicos de turno en este momento (hora de
--      El Salvador) y avisos públicos vigentes. Nunca devuelve pacientes ni habitaciones.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sin sesión: fuera de todas las tablas y vistas de public, salvo la lectura de avisos
-- -----------------------------------------------------------------------------
do $revocar_anon$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') and c.relname <> 'avisos'
  loop
    execute format('revoke all on table public.%I from anon', r.relname);
  end loop;
end
$revocar_anon$;

revoke all on table public.avisos from anon;
grant select on table public.avisos to anon;

-- -----------------------------------------------------------------------------
-- 2. Funciones de acceso (security definer: leen sin pasar por el RLS de las tablas que consultan)
-- -----------------------------------------------------------------------------
create or replace function public.es_personal()
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select coalesce(public.rol_actual() in ('administrador', 'doctor', 'recepcionista'), false);
$function$;

comment on function public.es_personal() is
  'true si la sesión es de un empleado activo (administrador, doctor o recepcionista) (HUNI-74).';

-- Expediente e historial clínico: administración (solo lectura), el médico tratante y el propio paciente.
create or replace function public.puede_ver_historial(p_paciente_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select coalesce(
    public.rol_actual() = 'administrador'
    or (public.rol_actual() = 'paciente' and p_paciente_id = public.paciente_actual_id())
    or public.es_medico_tratante(p_paciente_id),
    false
  );
$function$;

comment on function public.puede_ver_historial(uuid) is
  'Quién lee el expediente y el historial de un paciente: administración, médico tratante y el propio paciente (HUNI-74).';

create or replace function public.puede_ver_consulta(p_consulta_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select exists (
    select 1
    from public.consultas co
    join public.expedientes e on e.id = co.expediente_id
    where co.id = p_consulta_id and public.puede_ver_historial(e.paciente_id)
  );
$function$;

comment on function public.puede_ver_consulta(uuid) is
  'Una consulta (y sus diagnósticos, recetas y detalles) la leen quienes pueden ver el historial de su paciente (HUNI-74).';

-- -----------------------------------------------------------------------------
-- 3. RLS de lectura
-- -----------------------------------------------------------------------------

-- Datos personales del paciente
create policy pacientes_leer on public.pacientes
  for select to authenticated
  using (
    (select public.rol_actual()) in ('administrador', 'recepcionista')
    or ((select public.rol_actual()) = 'paciente' and id = (select public.paciente_actual_id()))
    or (select public.es_medico_tratante(id))
  );

-- Expediente e historial clínico
create policy expedientes_leer on public.expedientes
  for select to authenticated
  using ((select public.puede_ver_historial(paciente_id)));

create policy consultas_leer on public.consultas
  for select to authenticated
  using ((select public.puede_ver_consulta(id)));

create policy diagnosticos_leer on public.diagnosticos
  for select to authenticated
  using ((select public.puede_ver_consulta(consulta_id)));

create policy recetas_leer on public.recetas
  for select to authenticated
  using ((select public.puede_ver_consulta(consulta_id)));

create policy receta_detalles_leer on public.receta_detalles
  for select to authenticated
  using (exists (
    select 1 from public.recetas r where r.id = receta_id and (select public.puede_ver_consulta(r.consulta_id))
  ));

-- Cuentas y personal
create policy perfiles_leer on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.rol_actual()) in ('administrador', 'recepcionista'));

create policy personal_leer on public.personal
  for select to authenticated
  using (perfil_id = (select auth.uid()) or (select public.rol_actual()) in ('administrador', 'recepcionista'));

-- Catálogos
create policy especialidades_leer on public.especialidades
  for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy tipos_personal_leer on public.tipos_personal
  for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy examenes_catalogo_leer on public.examenes_catalogo
  for select to authenticated
  using ((select public.rol_actual()) is not null);

-- Avisos
create policy avisos_publicos_leer on public.avisos
  for select to anon, authenticated
  using (
    es_publico
    and fecha_publicacion <= now()
    and (fecha_expiracion is null or fecha_expiracion > now())
  );

create policy avisos_internos_leer on public.avisos
  for select to authenticated
  using (
    (select public.es_personal())
    and fecha_publicacion <= now()
    and (fecha_expiracion is null or fecha_expiracion > now())
  );

create policy avisos_administrador_leer on public.avisos
  for select to authenticated
  using ((select public.rol_actual()) = 'administrador');

-- -----------------------------------------------------------------------------
-- 4. Escrituras solo desde la API
-- -----------------------------------------------------------------------------
revoke insert, update, delete, truncate on table
  public.pacientes, public.expedientes, public.consultas, public.diagnosticos, public.recetas,
  public.receta_detalles, public.perfiles, public.personal, public.especialidades, public.tipos_personal,
  public.examenes_catalogo, public.avisos, public.resultados_laboratorio, public.ordenes_laboratorio,
  public.orden_examenes, public.hospitalizaciones, public.camas, public.habitaciones
from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Estado público del hospital
-- -----------------------------------------------------------------------------
create or replace function public.estado_publico()
  returns jsonb
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  with ahora as (
    select now() as ts, (now() at time zone 'America/El_Salvador') as local_ts
  ),
  camas_por_tipo as (
    select
      h.tipo,
      count(*)::int                                  as total,
      count(*) filter (where hz.id is not null)::int as ocupadas
    from public.camas c
    join public.habitaciones h on h.id = c.habitacion_id and h.activa
    left join public.hospitalizaciones hz on hz.cama_id = c.id and hz.fecha_alta is null
    group by h.tipo
  ),
  conteos as (
    select
      coalesce((select total    from camas_por_tipo where tipo = 'vip'), 0)         as vip_total,
      coalesce((select ocupadas from camas_por_tipo where tipo = 'vip'), 0)         as vip_ocupadas,
      coalesce((select total    from camas_por_tipo where tipo = 'semiprivada'), 0) as semi_total,
      coalesce((select ocupadas from camas_por_tipo where tipo = 'semiprivada'), 0) as semi_ocupadas
  ),
  medicos as (
    select p.nombres, p.apellidos, tp.nombre as tipo, e.nombre as especialidad, t.area, t.hora_inicio, t.hora_fin
    from public.turnos_personal t
    join public.personal p on p.id = t.personal_id and p.activo
    join public.tipos_personal tp on tp.id = p.tipo_personal_id and tp.es_medico
    left join public.especialidades e on e.id = p.especialidad_id
    cross join ahora a
    where public.rango_turno(t.fecha, t.hora_inicio, t.hora_fin) @> a.local_ts
  ),
  avisos_vigentes as (
    select av.id, av.titulo, av.contenido, av.fecha_publicacion, av.fecha_expiracion
    from public.avisos av
    cross join ahora a
    where av.es_publico
      and av.fecha_publicacion <= a.ts
      and (av.fecha_expiracion is null or av.fecha_expiracion > a.ts)
  )
  select jsonb_build_object(
    'ocupacion', jsonb_build_object(
      'vip', jsonb_build_object(
        'ocupadas', c.vip_ocupadas, 'disponibles', c.vip_total - c.vip_ocupadas, 'total', c.vip_total),
      'semiprivada', jsonb_build_object(
        'ocupadas', c.semi_ocupadas, 'disponibles', c.semi_total - c.semi_ocupadas, 'total', c.semi_total),
      'total', jsonb_build_object(
        'ocupadas', c.vip_ocupadas + c.semi_ocupadas,
        'disponibles', (c.vip_total + c.semi_total) - (c.vip_ocupadas + c.semi_ocupadas),
        'total', c.vip_total + c.semi_total)
    ),
    'medicos_de_turno', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'nombres', m.nombres, 'apellidos', m.apellidos, 'tipo', m.tipo, 'especialidad', m.especialidad,
          'area', m.area, 'hora_inicio', m.hora_inicio, 'hora_fin', m.hora_fin)
        order by m.area, m.apellidos, m.nombres)
       from medicos m),
      '[]'::jsonb),
    'avisos', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'id', av.id, 'titulo', av.titulo, 'contenido', av.contenido,
          'fecha_publicacion', av.fecha_publicacion, 'fecha_expiracion', av.fecha_expiracion)
        order by av.fecha_publicacion desc)
       from avisos_vigentes av),
      '[]'::jsonb),
    'actualizado_en', (select ts from ahora)
  )
  from conteos c;
$function$;

comment on function public.estado_publico() is
  'Información pública (context.md §3.4, HUNI-74): ocupación agregada, médicos de turno ahora y avisos públicos vigentes. '
  'Sin nombres de pacientes ni habitaciones. La pueden llamar anon y authenticated.';

revoke all on function public.estado_publico() from public;
grant execute on function public.estado_publico() to anon, authenticated, service_role;
