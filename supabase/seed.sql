-- =============================================================================
-- HUNI-37: datos semilla. IDEMPOTENTE: se puede correr cuantas veces se quiera.
--
-- Local:   supabase db reset            (migraciones + este seed)
-- Remoto:  supabase db push --include-seed
--
-- Usuarios demo (uno por rol). Contraseña de todos: HospitalDemo2026
--   administrador@demo.hospitalunicaes.test  → administrador
--   doctor@demo.hospitalunicaes.test         → doctor
--   recepcion@demo.hospitalunicaes.test      → recepcionista (Recepcionista/Asistente)
--   paciente@demo.hospitalunicaes.test       → paciente
--   pediatria@demo.hospitalunicaes.test      → doctor (Pediatría, turnos de tarde y fines de semana)
--   emergencia@demo.hospitalunicaes.test     → doctor (Medicina de emergencia, turnos de noche)
--   paciente2@demo.hospitalunicaes.test      → paciente
--
-- Turnos y citas (HUNI-51) se generan relativos al día en que corre el seed (de hoy - 7 a hoy + 14),
-- así el demo siempre tiene agenda pasada, de hoy y futura.
-- ⚠ La contraseña es pública (está en el repo): cámbiala en el remoto antes de la demo final.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Habitaciones: 5 VIP en la 3ª planta (1 cama) y 6 semiprivadas en la 2ª (2 camas)
-- -----------------------------------------------------------------------------
insert into public.habitaciones (codigo, planta, tipo, capacidad)
select 'VIP-' || n, 3, 'vip'::public.tipo_habitacion, 1 from generate_series(301, 305) as n
union all
select 'HAB-' || n, 2, 'semiprivada'::public.tipo_habitacion, 2 from generate_series(201, 206) as n
on conflict (codigo) do nothing;

-- Camas: VIP-301-A … VIP-305-A (5) y HAB-201-A/B … HAB-206-A/B (12) = 17
-- (WHERE NOT EXISTS y no ON CONFLICT: el trigger de capacidad corre antes del conflicto)
insert into public.camas (habitacion_id, codigo)
select h.id, h.codigo || '-' || letra
from public.habitaciones h
cross join lateral (
  select chr(64 + i) as letra from generate_series(1, h.capacidad) as i
) camas_por_habitacion
where h.codigo ~ '^(VIP-30[1-5]|HAB-20[1-6])$'
  and not exists (select 1 from public.camas c where c.codigo = h.codigo || '-' || letra);

-- -----------------------------------------------------------------------------
-- La única ambulancia, disponible
-- -----------------------------------------------------------------------------
insert into public.ambulancias (placa, estado)
select 'AMB-001', 'disponible'
where not exists (select 1 from public.ambulancias);

-- -----------------------------------------------------------------------------
-- Catálogos
-- -----------------------------------------------------------------------------
insert into public.especialidades (nombre, descripcion) values
  ('Medicina general',   'Atención primaria y consulta general'),
  ('Medicina interna',   'Enfermedades de órganos internos en adultos'),
  ('Pediatría',          'Atención de niños y adolescentes'),
  ('Ginecología',        'Salud reproductiva femenina'),
  ('Cirugía general',    'Procedimientos quirúrgicos'),
  ('Cardiología',        'Corazón y sistema circulatorio'),
  ('Alergología',        'Alergias e inmunología'),
  ('Medicina de emergencia', 'Atención de urgencias')
on conflict (nombre) do nothing;

insert into public.examenes_catalogo (nombre, categoria, tipo_muestra, tiempo_entrega_horas) values
  ('Hemograma completo',        'Hematología',  'Sangre venosa', 4),
  ('Glucosa en ayunas',         'Química',      'Sangre venosa', 2),
  ('Perfil lipídico',           'Química',      'Sangre venosa', 24),
  ('Creatinina',                'Química',      'Sangre venosa', 4),
  ('Examen general de orina',   'Uroanálisis',  'Orina',         2),
  ('Examen general de heces',   'Parasitología','Heces',         24),
  ('Prueba de embarazo (hCG)',  'Inmunología',  'Sangre venosa', 2),
  ('Tiempo de protrombina',     'Coagulación',  'Sangre venosa', 4),
  ('Radiografía de tórax',      'Imagenología', 'No aplica',     2),
  ('Electrocardiograma',        'Cardiología',  'No aplica',     1)
on conflict (nombre) do nothing;

-- -----------------------------------------------------------------------------
-- Usuarios demo en Supabase Auth (ids fijos para que sean idempotentes)
-- El trigger on_auth_user_created crea su perfil con rol 'paciente'; abajo se ajusta el rol.
-- -----------------------------------------------------------------------------
with demo (id, email, nombres, apellidos) as (
  values
    ('11111111-1111-4111-8111-000000000001'::uuid, 'administrador@demo.hospitalunicaes.test', 'Andrea',  'Méndez Ruiz'),
    ('11111111-1111-4111-8111-000000000002'::uuid, 'doctor@demo.hospitalunicaes.test',        'Roberto', 'Castillo Peña'),
    ('11111111-1111-4111-8111-000000000003'::uuid, 'recepcion@demo.hospitalunicaes.test',     'Lucía',   'Herrera Gómez'),
    ('11111111-1111-4111-8111-000000000004'::uuid, 'paciente@demo.hospitalunicaes.test',      'Carlos',  'Martínez Rivas'),
    ('11111111-1111-4111-8111-000000000005'::uuid, 'pediatria@demo.hospitalunicaes.test',     'Gabriela', 'Ortiz Lemus'),
    ('11111111-1111-4111-8111-000000000006'::uuid, 'emergencia@demo.hospitalunicaes.test',    'Fernando', 'Aguilar Soto'),
    ('11111111-1111-4111-8111-000000000007'::uuid, 'paciente2@demo.hospitalunicaes.test',     'Ana Sofía', 'Ramírez Cruz')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated', d.email,
  extensions.crypt('HospitalDemo2026', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  jsonb_build_object('nombres', d.nombres, 'apellidos', d.apellidos),
  now(), now(), '', '', '', ''
from demo d
where not exists (select 1 from auth.users u where u.id = d.id or u.email = d.email);

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in (
  '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000002',
  '11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-000000000004',
  '11111111-1111-4111-8111-000000000005', '11111111-1111-4111-8111-000000000006',
  '11111111-1111-4111-8111-000000000007'
)
on conflict (provider_id, provider) do nothing;

-- Perfiles con su rol (upsert por si el trigger no existía cuando se crearon)
insert into public.perfiles (id, email, nombres, apellidos, rol)
select u.id, u.email, u.raw_user_meta_data ->> 'nombres', u.raw_user_meta_data ->> 'apellidos', r.rol::public.rol_usuario
from auth.users u
join (values
  ('11111111-1111-4111-8111-000000000001'::uuid, 'administrador'),
  ('11111111-1111-4111-8111-000000000002'::uuid, 'doctor'),
  ('11111111-1111-4111-8111-000000000003'::uuid, 'recepcionista'),
  ('11111111-1111-4111-8111-000000000004'::uuid, 'paciente'),
  ('11111111-1111-4111-8111-000000000005'::uuid, 'doctor'),
  ('11111111-1111-4111-8111-000000000006'::uuid, 'doctor'),
  ('11111111-1111-4111-8111-000000000007'::uuid, 'paciente')
) as r (id, rol) on r.id = u.id
on conflict (id) do update set rol = excluded.rol;

-- -----------------------------------------------------------------------------
-- Personal demo: 5 con cuenta y 4 sin cuenta (solo aparecen en turnos; la alergista también atiende citas).
-- EMP-0009 está desactivado para probar los filtros de activo.
-- -----------------------------------------------------------------------------
insert into public.personal (perfil_id, nombres, apellidos, tipo_personal_id, especialidad_id, codigo_empleado, num_licencia, fecha_contratacion)
select p.perfil_id, p.nombres, p.apellidos, tp.id, e.id, p.codigo, p.licencia, p.contratacion::date
from (values
  ('11111111-1111-4111-8111-000000000001'::uuid, 'Andrea',  'Méndez Ruiz',   'Administrativo', null,               'EMP-0001', null,         '2024-01-15'),
  ('11111111-1111-4111-8111-000000000002'::uuid, 'Roberto', 'Castillo Peña', 'Doctor',         'Medicina interna', 'EMP-0002', 'JVPM-10234', '2023-06-01'),
  ('11111111-1111-4111-8111-000000000003'::uuid, 'Lucía',   'Herrera Gómez', 'Recepcionista',  null,               'EMP-0003', null,         '2025-02-10'),
  (null::uuid,                                   'María',   'López Flores',  'Enfermero/a',    null,               'EMP-0004', 'JVPE-55821', '2024-09-01'),
  ('11111111-1111-4111-8111-000000000005'::uuid, 'Gabriela', 'Ortiz Lemus',  'Doctor',         'Pediatría',        'EMP-0005', 'JVPM-11872', '2022-03-01'),
  ('11111111-1111-4111-8111-000000000006'::uuid, 'Fernando', 'Aguilar Soto', 'Médico de emergencia', 'Medicina de emergencia', 'EMP-0006', 'JVPM-12950', '2021-08-16'),
  (null::uuid,                                   'José',     'Navarro Paz',  'Enfermero/a',    null,               'EMP-0007', 'JVPE-60117', '2025-01-06'),
  (null::uuid,                                   'Patricia', 'Villalta Ríos', 'Alergista',     'Alergología',      'EMP-0008', 'JVPM-13304', '2023-11-20'),
  (null::uuid,                                   'Óscar',    'Mejía Lara',   'Asistente',      null,               'EMP-0009', null,         '2024-04-01')
) as p (perfil_id, nombres, apellidos, tipo, especialidad, codigo, licencia, contratacion)
join public.tipos_personal tp on tp.nombre = p.tipo
left join public.especialidades e on e.nombre = p.especialidad
where p.perfil_id is null or exists (select 1 from public.perfiles pf where pf.id = p.perfil_id)
on conflict (codigo_empleado) do nothing;

update public.personal set activo = false where codigo_empleado = 'EMP-0009' and activo;

-- -----------------------------------------------------------------------------
-- Pacientes demo con su expediente: 2 con cuenta y 4 sin cuenta (registrados en recepción).
-- Miguel Ángel Torres está desactivado para probar los filtros de activo.
-- -----------------------------------------------------------------------------
insert into public.pacientes (perfil_id, nombres, apellidos, documento_identidad, fecha_nacimiento, sexo, telefono, direccion, contacto_emergencia, telefono_emergencia)
select p.perfil_id, p.nombres, p.apellidos, p.documento, p.nacimiento::date, p.sexo::public.sexo, p.telefono, p.direccion, p.contacto, p.tel_contacto
from (values
  ('11111111-1111-4111-8111-000000000004'::uuid, 'Carlos',       'Martínez Rivas',   '01234567-8', '1990-05-14', 'masculino', '+503 7000-0004', 'Santa Ana, colonia El Palmar', 'María Rivas (madre)',   '+503 7000-0005'),
  ('11111111-1111-4111-8111-000000000007'::uuid, 'Ana Sofía',    'Ramírez Cruz',     '02345678-9', '1995-09-02', 'femenino',  '+503 7000-0007', 'Santa Ana, barrio San Rafael', 'Luis Ramírez (esposo)', '+503 7000-0008'),
  (null::uuid,                                   'Jorge',        'Hernández Alas',   '03456789-0', '1978-01-23', 'masculino', '+503 7000-0010', 'Chalchuapa',                   'Elena Alas (hermana)',  '+503 7000-0011'),
  (null::uuid,                                   'Daniela',      'Pineda Morán',     null,         '2018-06-30', 'femenino',  '+503 7000-0012', 'Metapán',                      'Karla Morán (madre)',   '+503 7000-0012'),
  (null::uuid,                                   'Rosa Elena',   'Guzmán de Flores', '04567890-1', '1951-11-08', 'femenino',  '+503 7000-0014', 'Santa Ana, centro',            'Pedro Flores (hijo)',   '+503 7000-0015'),
  (null::uuid,                                   'Miguel Ángel', 'Torres Valle',     '05678901-2', '1985-03-17', 'masculino', '+503 7000-0016', 'Coatepeque',                   null,                    null)
) as p (perfil_id, nombres, apellidos, documento, nacimiento, sexo, telefono, direccion, contacto, tel_contacto)
where (p.perfil_id is null and not exists (
         select 1 from public.pacientes x
         where x.nombres = p.nombres and x.apellidos = p.apellidos and x.fecha_nacimiento = p.nacimiento::date))
   or (p.perfil_id is not null
       and exists (select 1 from public.perfiles pf where pf.id = p.perfil_id)
       and not exists (select 1 from public.pacientes x where x.perfil_id = p.perfil_id));

update public.pacientes set activo = false
where nombres = 'Miguel Ángel' and apellidos = 'Torres Valle' and activo;

-- El número sigue la secuencia que usa la API (EXP-<año>-<00000>) para no chocar con pacientes reales.
insert into public.expedientes (paciente_id, numero_expediente, tipo_sangre, alergias, antecedentes, enfermedades_cronicas)
select x.paciente_id,
       'EXP-' || extract(year from public.hoy_local()) || '-' || lpad((x.base + x.n)::text, 5, '0'),
       x.sangre, x.alergias, x.antecedentes, x.cronicas
from (
  select pa.id as paciente_id, e.sangre, e.alergias, e.antecedentes, e.cronicas,
         row_number() over (order by e.orden) as n,
         (select coalesce(max(substring(ex.numero_expediente from 10)::int), 0) from public.expedientes ex
           where ex.numero_expediente like 'EXP-' || extract(year from public.hoy_local()) || '-_____') as base
  from (values
    (1, 'Carlos',       'Martínez Rivas',   'O+',  'Penicilina',    'Apendicectomía (2012)',       null),
    (2, 'Ana Sofía',    'Ramírez Cruz',     'A+',  null,            null,                          null),
    (3, 'Jorge',        'Hernández Alas',   'B+',  'Mariscos',      'Fumador por 15 años',         'Hipertensión arterial'),
    (4, 'Daniela',      'Pineda Morán',     'O-',  'Polen, ácaros', 'Esquema de vacunas completo', 'Asma leve'),
    (5, 'Rosa Elena',   'Guzmán de Flores', 'AB+', 'Sulfas',        'Fractura de cadera (2019)',   'Diabetes tipo 2'),
    (6, 'Miguel Ángel', 'Torres Valle',     'A-',  null,            null,                          null)
  ) as e (orden, nombres, apellidos, sangre, alergias, antecedentes, cronicas)
  join public.pacientes pa on pa.nombres = e.nombres and pa.apellidos = e.apellidos
  where not exists (select 1 from public.expedientes ex where ex.paciente_id = pa.id)
) x;

-- -----------------------------------------------------------------------------
-- Inventario demo (HUNI-97): proveedores, ítems, lotes con caducidad y equipos
-- Las fechas de los lotes son relativas al día del seed para que el demo
-- tenga alertas de 15 y 30 días. Los nombres son ficticios.
-- -----------------------------------------------------------------------------
insert into public.proveedores (nombre, nit, nrc, contacto, telefono, email, direccion) values
  ('Distribuidora Médica Demo, S.A. de C.V.', '0614-010190-101-0', '100001-1', 'Sofía Alvarado', '+503 2200-0001',
   'ventas@distribuidora-demo.test', 'San Salvador'),
  ('Equipos Hospitalarios Demo, S.A. de C.V.', '0614-020290-102-1', '100002-2', 'Javier Molina', '+503 2200-0002',
   'contacto@equipos-demo.test', 'Santa Ana')
on conflict (nit) do nothing;

insert into public.inventario_items (codigo, nombre, categoria, unidad_medida, stock_minimo, ubicacion) values
  ('MED-0001', 'Paracetamol 500 mg',            'medicamento', 'tableta', 200, 'Farmacia'),
  ('MED-0002', 'Amoxicilina 500 mg',            'medicamento', 'cápsula', 100, 'Farmacia'),
  ('INS-0001', 'Jeringa descartable 5 ml',      'insumo',      'unidad',  150, 'Bodega central'),
  ('INS-0002', 'Guantes de nitrilo talla M',    'insumo',      'caja',    20,  'Bodega central'),
  ('EQP-0001', 'Monitor de signos vitales',     'equipo',      'unidad',  2,   'Biomédica'),
  ('EQP-0002', 'Bomba de infusión volumétrica', 'equipo',      'unidad',  1,   'Biomédica')
on conflict (codigo) do nothing;

-- Entradas por lote: solo la primera vez (si el lote ya existe no se repite la entrada)
select public.registrar_entrada_lote(i.id, l.lote, public.hoy_local() + l.dias, l.cantidad, p.id,
                                     '11111111-1111-4111-8111-000000000001', 'Carga inicial (seed)')
from (values
  ('MED-0001', 'PCT-2401', 10,  120),   -- vence en 10 días → alerta de 15 días
  ('MED-0001', 'PCT-2402', 400, 300),
  ('MED-0002', 'AMX-2403', 25,  80),    -- vence en 25 días → alerta de 30 días
  ('INS-0001', 'JER-2404', 720, 500),
  ('INS-0002', 'GUA-2405', 540, 15)     -- debajo del mínimo
) as l (codigo, lote, dias, cantidad)
join public.inventario_items i on i.codigo = l.codigo
join public.proveedores p on p.nit = '0614-010190-101-0'
where exists (select 1 from public.perfiles pf where pf.id = '11111111-1111-4111-8111-000000000001')
  and not exists (select 1 from public.lotes_inventario x where x.item_id = i.id and x.numero_lote = l.lote);

insert into public.activos (item_id, numero_serie, proveedor_id, estado, ubicacion, registrado_por)
select i.id, a.serie, p.id, a.estado::public.estado_activo, a.ubicacion, pf.id
from (values
  ('EQP-0001', 'MSV-10001', 'en_uso',           'VIP-301'),
  ('EQP-0001', 'MSV-10002', 'disponible',       'Biomédica'),
  ('EQP-0002', 'BIF-20001', 'en_mantenimiento', 'Taller biomédico')
) as a (codigo, serie, estado, ubicacion)
join public.inventario_items i on i.codigo = a.codigo
join public.proveedores p on p.nit = '0614-020290-102-1'
join public.perfiles pf on pf.id = '11111111-1111-4111-8111-000000000001'
on conflict (item_id, numero_serie) do nothing;

-- -----------------------------------------------------------------------------
-- Turnos (HUNI-51): semana tipo, de hoy - 7 a hoy + 14. Entre los médicos cubren las 24 horas:
--   Roberto (interna)     lun–vie 07:00–15:00 · Gabriela (pediatría) lun–vie 13:00–21:00, sáb–dom 07:00–19:00
--   Fernando (emergencia) todos 19:00–07:00   · Patricia (alergista) mar y jue 08:00–12:00
--   María y José (enfermería) y Lucía (recepción) en sus horarios
-- isodow: 1 = lunes … 7 = domingo. Se salta el día si el empleado ya tiene un turno que se cruza.
-- -----------------------------------------------------------------------------
insert into public.turnos_personal (personal_id, area, fecha, hora_inicio, hora_fin, tipo_turno, notas)
select p.id, t.area, d.fecha, t.inicio::time, t.fin::time, t.tipo::public.tipo_turno, t.notas
from (values
  ('EMP-0002', 'Consulta externa', array[1,2,3,4,5],     '07:00', '15:00', 'manana',  null),
  ('EMP-0005', 'Pediatría',        array[1,2,3,4,5],     '13:00', '21:00', 'tarde',   null),
  ('EMP-0005', 'Pediatría',        array[6,7],           '07:00', '19:00', 'guardia', 'Guardia de fin de semana'),
  ('EMP-0006', 'Emergencia',       array[1,2,3,4,5,6,7], '19:00', '07:00', 'noche',   'Turno nocturno: termina al día siguiente'),
  ('EMP-0008', 'Alergología',      array[2,4],           '08:00', '12:00', 'manana',  null),
  ('EMP-0004', 'Hospitalización',  array[1,2,3,4,5],     '07:00', '15:00', 'manana',  null),
  ('EMP-0007', 'Emergencia',       array[1,2,3,4,5],     '15:00', '23:00', 'tarde',   null),
  ('EMP-0003', 'Recepción',        array[1,2,3,4,5],     '07:00', '15:00', 'manana',  null)
) as t (codigo, area, dias, inicio, fin, tipo, notas)
join public.personal p on p.codigo_empleado = t.codigo
cross join lateral (
  select public.hoy_local() + n as fecha from generate_series(-7, 14) as n
) d
where extract(isodow from d.fecha)::int = any (t.dias)
  and not exists (
    select 1 from public.turnos_personal x
    where x.personal_id = p.id
      and public.rango_turno(x.fecha, x.hora_inicio, x.hora_fin)
          && public.rango_turno(d.fecha, t.inicio::time, t.fin::time)
  );

-- -----------------------------------------------------------------------------
-- Citas (HUNI-51) dentro de los turnos de los médicos. Pasadas: atendidas, alguna cancelada o
-- no_asistio; de hoy en adelante: programadas y confirmadas. Los pacientes activos rotan.
-- Se insertan una por una para que el trigger vea las anteriores (sin doble reserva).
-- -----------------------------------------------------------------------------
do $seed_citas$
declare
  r           record;
  v_adultos   uuid[];
  v_nina      uuid;
  v_paciente  uuid;
  v_estado    public.estado_cita;
  v_i         int := 0;
begin
  select array_agg(pa.id order by pa.fecha_nacimiento) into v_adultos
  from public.pacientes pa
  where pa.activo
    and (pa.perfil_id in ('11111111-1111-4111-8111-000000000004', '11111111-1111-4111-8111-000000000007')
         or (pa.nombres, pa.apellidos) in (('Jorge', 'Hernández Alas'), ('Rosa Elena', 'Guzmán de Flores')));

  select pa.id into v_nina
  from public.pacientes pa where pa.nombres = 'Daniela' and pa.apellidos = 'Pineda Morán' and pa.activo;

  if v_adultos is null then
    return;
  end if;

  -- Pediatría (EMP-0005) solo atiende a la paciente niña y en días alternos; el resto, a los adultos.
  for r in
    select t.personal_id, t.fecha, s.motivo, p.codigo_empleado,
           (t.fecha + t.hora_inicio + s.desfase) at time zone 'America/El_Salvador' as fecha_hora
    from public.turnos_personal t
    join public.personal p on p.id = t.personal_id
    join (values
      ('EMP-0002', interval '1 hour',             'Control de presión arterial'),
      ('EMP-0002', interval '2 hours 30 minutes', 'Dolor abdominal'),
      ('EMP-0005', interval '1 hour',             'Control de niño sano'),
      ('EMP-0008', interval '1 hour',             'Evaluación de alergias'),
      ('EMP-0006', interval '2 hours',            'Dolor torácico')
    ) as s (codigo, desfase, motivo) on s.codigo = p.codigo_empleado
    where t.fecha between public.hoy_local() - 7 and public.hoy_local() + 14
      and (p.codigo_empleado <> 'EMP-0006' or extract(isodow from t.fecha) in (5, 6))
      and (p.codigo_empleado <> 'EMP-0005' or (t.fecha - public.hoy_local()) % 2 = 0)
    order by 5
  loop
    v_i := v_i + 1;
    if r.codigo_empleado = 'EMP-0005' then
      continue when v_nina is null;
      v_paciente := v_nina;
    else
      v_paciente := v_adultos[1 + (v_i % array_length(v_adultos, 1))];
    end if;
    v_estado := case
      when r.fecha < public.hoy_local() then
        (array['atendida', 'atendida', 'atendida', 'no_asistio', 'cancelada']::public.estado_cita[])[1 + v_i % 5]
      else
        (array['programada', 'confirmada']::public.estado_cita[])[1 + v_i % 2]
    end;

    -- Idempotente: ese doctor ya tiene cita a esa hora, o el paciente ya está ocupado a esa hora.
    continue when exists (
      select 1 from public.citas c where c.doctor_id = r.personal_id and c.fecha_hora = r.fecha_hora
    );
    continue when v_estado in ('programada', 'confirmada') and exists (
      select 1 from public.citas c
      where c.paciente_id = v_paciente and c.estado in ('programada', 'confirmada')
        and public.rango_cita(c.fecha_hora, c.duracion_minutos) && public.rango_cita(r.fecha_hora, 30::smallint)
    );

    insert into public.citas (paciente_id, doctor_id, fecha_hora, duracion_minutos, motivo, estado)
    values (v_paciente, r.personal_id, r.fecha_hora, 30, r.motivo, v_estado);
  end loop;
end
$seed_citas$;

-- Carlos (paciente demo) siempre tiene una cita próxima con el doctor demo, para probar "mis citas".
insert into public.citas (paciente_id, doctor_id, fecha_hora, duracion_minutos, motivo, estado)
select pa.id, d.id, t.inicio, 30, 'Revisión de exámenes', 'confirmada'
from public.pacientes pa
join public.personal d on d.codigo_empleado = 'EMP-0002'
join lateral (
  select (x.fecha + time '14:00') at time zone 'America/El_Salvador' as inicio
  from public.turnos_personal x
  where x.personal_id = d.id and x.fecha > public.hoy_local()
  order by x.fecha
  limit 1
) t on true
where pa.perfil_id = '11111111-1111-4111-8111-000000000004'
  and not exists (
    select 1 from public.citas c
    where c.paciente_id = pa.id and c.motivo = 'Revisión de exámenes' and c.fecha_hora > now()
  )
  and not exists (
    select 1 from public.citas c
    where (c.doctor_id = d.id or c.paciente_id = pa.id) and c.estado in ('programada', 'confirmada')
      and public.rango_cita(c.fecha_hora, c.duracion_minutos) && public.rango_cita(t.inicio, 30::smallint)
  );

-- -----------------------------------------------------------------------------
-- Consulta cerrada de Carlos con el doctor demo: diagnóstico, receta y laboratorio.
-- Ids fijos; los hijos se insertan antes de cerrar la consulta y una sola vez.
-- -----------------------------------------------------------------------------
insert into public.consultas (id, expediente_id, cita_id, doctor_id, fecha, motivo_consulta, signos_vitales, examen_fisico, notas)
select '55555555-5555-4555-8555-000000000001', e.id,
       (select c.id from public.citas c
         where c.paciente_id = pa.id and c.doctor_id = d.id and c.estado = 'atendida'
           and not exists (select 1 from public.consultas x where x.cita_id = c.id)
         order by c.fecha_hora limit 1),
       d.id, now() - interval '3 days', 'Dolor abdominal y acidez',
       '{"presion": "120/80", "frecuencia_cardiaca": 76, "temperatura": 36.8, "peso_kg": 78}'::jsonb,
       'Abdomen blando, dolor leve en epigastrio', 'Dieta blanda y control en 2 semanas'
from public.pacientes pa
join public.expedientes e on e.paciente_id = pa.id
join public.personal d on d.codigo_empleado = 'EMP-0002'
where pa.perfil_id = '11111111-1111-4111-8111-000000000004'
on conflict (id) do nothing;

insert into public.diagnosticos (id, consulta_id, codigo_cie10, descripcion, tipo)
select '55555555-5555-4555-8555-000000000011', c.id, 'K29.7', 'Gastritis, no especificada', 'principal'
from public.consultas c
where c.id = '55555555-5555-4555-8555-000000000001' and c.cerrada_en is null
  and not exists (select 1 from public.diagnosticos x where x.id = '55555555-5555-4555-8555-000000000011');

insert into public.recetas (id, consulta_id, indicaciones)
select '55555555-5555-4555-8555-000000000021', c.id, 'Tomar después de las comidas'
from public.consultas c
where c.id = '55555555-5555-4555-8555-000000000001' and c.cerrada_en is null
  and not exists (select 1 from public.recetas x where x.id = '55555555-5555-4555-8555-000000000021');

insert into public.receta_detalles (receta_id, medicamento, dosis, frecuencia, duracion, cantidad)
select r.id, 'Omeprazol 20 mg', '1 cápsula', 'Cada 24 horas en ayunas', '14 días', 14
from public.recetas r
where r.id = '55555555-5555-4555-8555-000000000021'
  and not exists (select 1 from public.receta_detalles x where x.receta_id = r.id);

insert into public.ordenes_laboratorio (id, consulta_id, indicaciones, estado, prioridad)
select '55555555-5555-4555-8555-000000000031', c.id, 'En ayunas de 8 horas', 'en_proceso', 'normal'
from public.consultas c
where c.id = '55555555-5555-4555-8555-000000000001' and c.cerrada_en is null
  and not exists (select 1 from public.ordenes_laboratorio x where x.id = '55555555-5555-4555-8555-000000000031');

insert into public.orden_examenes (id, orden_id, examen_id, estado, fecha_inicio, fecha_completado)
select x.id::uuid, '55555555-5555-4555-8555-000000000031', ec.id, x.estado::public.estado_laboratorio,
       case when x.estado <> 'pendiente' then now() - interval '2 days' end,
       case when x.estado = 'completado' then now() - interval '1 day' end
from (values
  ('55555555-5555-4555-8555-000000000041', 'Hemograma completo', 'completado'),
  ('55555555-5555-4555-8555-000000000042', 'Glucosa en ayunas',  'pendiente')
) as x (id, examen, estado)
join public.examenes_catalogo ec on ec.nombre = x.examen
where exists (select 1 from public.ordenes_laboratorio o where o.id = '55555555-5555-4555-8555-000000000031')
on conflict (id) do nothing;

insert into public.resultados_laboratorio (orden_examen_id, valor, unidad, rango_referencia, observaciones, validado_por)
select '55555555-5555-4555-8555-000000000041', '13.8', 'g/dL', '13.0 – 17.0', 'Hemoglobina dentro de rango', d.id
from public.personal d
where d.codigo_empleado = 'EMP-0002'
  and exists (select 1 from public.orden_examenes x where x.id = '55555555-5555-4555-8555-000000000041')
  and not exists (select 1 from public.resultados_laboratorio x where x.orden_examen_id = '55555555-5555-4555-8555-000000000041');

update public.consultas set cerrada_en = fecha + interval '40 minutes'
where id = '55555555-5555-4555-8555-000000000001' and cerrada_en is null;

-- Consulta abierta de Rosa Elena con una orden pendiente, para que el dashboard tenga laboratorio en cola
insert into public.consultas (id, expediente_id, doctor_id, fecha, motivo_consulta, notas)
select '55555555-5555-4555-8555-000000000002', e.id, d.id, now() - interval '1 day',
       'Control de diabetes', 'Consulta abierta: falta revisar resultados'
from public.pacientes pa
join public.expedientes e on e.paciente_id = pa.id
join public.personal d on d.codigo_empleado = 'EMP-0002'
where pa.nombres = 'Rosa Elena' and pa.apellidos = 'Guzmán de Flores'
on conflict (id) do nothing;

insert into public.ordenes_laboratorio (id, consulta_id, indicaciones, estado, prioridad)
select '55555555-5555-4555-8555-000000000032', c.id, 'Control trimestral', 'pendiente', 'urgente'
from public.consultas c
where c.id = '55555555-5555-4555-8555-000000000002' and c.cerrada_en is null
  and not exists (select 1 from public.ordenes_laboratorio x where x.id = '55555555-5555-4555-8555-000000000032');

insert into public.orden_examenes (id, orden_id, examen_id)
select '55555555-5555-4555-8555-000000000043', '55555555-5555-4555-8555-000000000032', ec.id
from public.examenes_catalogo ec
where ec.nombre = 'Glucosa en ayunas'
  and exists (select 1 from public.ordenes_laboratorio o where o.id = '55555555-5555-4555-8555-000000000032')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Hospitalizaciones activas (ocupación del dashboard y "médico tratante")
-- -----------------------------------------------------------------------------
insert into public.hospitalizaciones (paciente_id, cama_id, doctor_tratante_id, fecha_ingreso, motivo_ingreso)
select pa.id, c.id, d.id, now() - h.dias * interval '1 day', h.motivo
from (values
  ('Rosa Elena', 'Guzmán de Flores', 'VIP-301-A', 'EMP-0002', 2, 'Descompensación de diabetes'),
  ('Jorge',      'Hernández Alas',   'HAB-201-A', 'EMP-0006', 1, 'Crisis hipertensiva')
) as h (nombres, apellidos, cama, doctor, dias, motivo)
join public.pacientes pa on pa.nombres = h.nombres and pa.apellidos = h.apellidos
join public.camas c on c.codigo = h.cama and c.estado = 'disponible'
join public.personal d on d.codigo_empleado = h.doctor
where not exists (select 1 from public.hospitalizaciones x where x.paciente_id = pa.id and x.fecha_alta is null);

-- -----------------------------------------------------------------------------
-- Avisos generales (2 públicos y 1 interno)
-- -----------------------------------------------------------------------------
insert into public.avisos (titulo, contenido, autor_id, es_publico, fecha_expiracion)
select a.titulo, a.contenido, '11111111-1111-4111-8111-000000000001', a.publico, now() + a.vigencia
from (values
  ('Jornada de vacunación', 'Este sábado de 8:00 a 12:00 en el vestíbulo principal. Trae tu tarjeta de vacunación.', true, interval '30 days'),
  ('Horario de visitas', 'Hospitalización: de 10:00 a 12:00 y de 16:00 a 18:00. Máximo 2 visitantes por paciente.', true, interval '365 days'),
  ('Capacitación interna', 'Capacitación sobre el nuevo sistema de citas el viernes a las 14:00 en el auditorio.', false, interval '15 days')
) as a (titulo, contenido, publico, vigencia)
where exists (select 1 from public.perfiles pf where pf.id = '11111111-1111-4111-8111-000000000001')
  and not exists (select 1 from public.avisos x where x.titulo = a.titulo);

-- -----------------------------------------------------------------------------
-- Ambulancia: dos servicios ya finalizados para la bitácora (la ambulancia sigue disponible)
-- -----------------------------------------------------------------------------
insert into public.solicitudes_ambulancia (ambulancia_id, solicitada_por, paciente_id, direccion_origen, destino,
  descripcion_emergencia, fecha_solicitud, fecha_despacho, fecha_cierre, estado, prioridad)
select am.id, '11111111-1111-4111-8111-000000000003', pa.id, s.origen, 'Hospital Universitario Central',
       s.descripcion, now() - s.hace, now() - s.hace + interval '5 minutes', now() - s.hace + interval '50 minutes',
       'finalizada', s.prioridad::public.prioridad
from (values
  ('Jorge', 'Hernández Alas', 'Chalchuapa, calle principal', 'Dolor de cabeza intenso y presión alta', interval '1 day 2 hours', 'urgente'),
  (null,    null,             'Carretera a Metapán, km 70',  'Accidente de tránsito, un herido leve',  interval '4 days',         'critica')
) as s (nombres, apellidos, origen, descripcion, hace, prioridad)
cross join (select a.id from public.ambulancias a limit 1) am
left join public.pacientes pa on pa.nombres = s.nombres and pa.apellidos = s.apellidos
where exists (select 1 from public.perfiles pf where pf.id = '11111111-1111-4111-8111-000000000003')
  and not exists (select 1 from public.solicitudes_ambulancia x where x.direccion_origen = s.origen);
