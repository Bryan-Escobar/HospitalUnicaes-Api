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
    ('11111111-1111-4111-8111-000000000004'::uuid, 'paciente@demo.hospitalunicaes.test',      'Carlos',  'Martínez Rivas')
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
  '11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-000000000004'
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
  ('11111111-1111-4111-8111-000000000004'::uuid, 'paciente')
) as r (id, rol) on r.id = u.id
on conflict (id) do update set rol = excluded.rol;

-- -----------------------------------------------------------------------------
-- Personal demo (3 con cuenta + 1 enfermera sin cuenta, que solo aparece en turnos)
-- -----------------------------------------------------------------------------
insert into public.personal (perfil_id, nombres, apellidos, tipo_personal_id, especialidad_id, codigo_empleado, num_licencia, fecha_contratacion)
select p.perfil_id, p.nombres, p.apellidos, tp.id, e.id, p.codigo, p.licencia, p.contratacion::date
from (values
  ('11111111-1111-4111-8111-000000000001'::uuid, 'Andrea',  'Méndez Ruiz',   'Administrativo', null,               'EMP-0001', null,         '2024-01-15'),
  ('11111111-1111-4111-8111-000000000002'::uuid, 'Roberto', 'Castillo Peña', 'Doctor',         'Medicina interna', 'EMP-0002', 'JVPM-10234', '2023-06-01'),
  ('11111111-1111-4111-8111-000000000003'::uuid, 'Lucía',   'Herrera Gómez', 'Recepcionista',  null,               'EMP-0003', null,         '2025-02-10'),
  (null::uuid,                                   'María',   'López Flores',  'Enfermero/a',    null,               'EMP-0004', 'JVPE-55821', '2024-09-01')
) as p (perfil_id, nombres, apellidos, tipo, especialidad, codigo, licencia, contratacion)
join public.tipos_personal tp on tp.nombre = p.tipo
left join public.especialidades e on e.nombre = p.especialidad
where p.perfil_id is null or exists (select 1 from public.perfiles pf where pf.id = p.perfil_id)
on conflict (codigo_empleado) do nothing;

-- -----------------------------------------------------------------------------
-- Paciente demo con su expediente
-- -----------------------------------------------------------------------------
insert into public.pacientes (perfil_id, nombres, apellidos, documento_identidad, fecha_nacimiento, sexo, telefono, contacto_emergencia, telefono_emergencia)
select pf.id, 'Carlos', 'Martínez Rivas', '01234567-8', '1990-05-14', 'masculino', '+503 7000-0004', 'María Rivas (madre)', '+503 7000-0005'
from public.perfiles pf
where pf.id = '11111111-1111-4111-8111-000000000004'
on conflict (perfil_id) do nothing;

insert into public.expedientes (paciente_id, numero_expediente, tipo_sangre, alergias)
select pa.id, 'EXP-2026-00001', 'O+', 'Penicilina'
from public.pacientes pa
where pa.perfil_id = '11111111-1111-4111-8111-000000000004'
on conflict (paciente_id) do nothing;
