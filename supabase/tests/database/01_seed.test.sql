-- HUNI-37: el seed carga la infraestructura fija del hospital y un usuario demo por rol.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Habitaciones
select is((select count(*)::int from public.habitaciones where tipo = 'vip'), 5, '5 habitaciones VIP');
select is((select count(*)::int from public.habitaciones where tipo = 'vip' and planta = 3 and capacidad = 1), 5,
  'las VIP están en la 3ª planta con capacidad 1');
select is((select count(*)::int from public.habitaciones where tipo = 'semiprivada'), 6, '6 habitaciones semiprivadas');
select is((select count(*)::int from public.habitaciones where tipo = 'semiprivada' and planta = 2 and capacidad = 2), 6,
  'las semiprivadas están en la 2ª planta con capacidad 2');
select set_eq(
  $$ select codigo from public.habitaciones $$,
  $$ values ('VIP-301'),('VIP-302'),('VIP-303'),('VIP-304'),('VIP-305'),
            ('HAB-201'),('HAB-202'),('HAB-203'),('HAB-204'),('HAB-205'),('HAB-206') $$,
  'códigos VIP-301…305 y HAB-201…206'
);

-- Camas
select is((select count(*)::int from public.camas c join public.habitaciones h on h.id = c.habitacion_id where h.planta = 2), 12,
  '12 camas en la 2ª planta');
select is((select count(*)::int from public.camas c join public.habitaciones h on h.id = c.habitacion_id where h.planta = 3), 5,
  '5 camas en la 3ª planta');
select is((select count(*)::int from public.camas), 17, '17 camas en total');

-- Ambulancia
select is((select count(*)::int from public.ambulancias), 1, 'exactamente 1 ambulancia');
select is((select estado::text from public.ambulancias limit 1), 'disponible', 'la ambulancia empieza disponible');

-- Usuarios demo: uno por cada uno de los 4 roles
select set_eq(
  $$ select pf.rol::text from public.perfiles pf join auth.users u on u.id = pf.id
     where u.email like '%@demo.hospitalunicaes.test' $$,
  $$ values ('administrador'),('doctor'),('recepcionista'),('paciente') $$,
  'hay un usuario demo para cada rol'
);
select is(
  (select count(*)::int from auth.identities i join auth.users u on u.id = i.user_id
    where u.email like '%@demo.hospitalunicaes.test' and i.provider = 'email'),
  4, 'los usuarios demo pueden iniciar sesión con email'
);
select is(
  (select count(*)::int from public.pacientes pa join public.expedientes e on e.paciente_id = pa.id
    where pa.perfil_id = '11111111-1111-4111-8111-000000000004'),
  1, 'el paciente demo tiene expediente'
);
select ok(
  exists (select 1 from public.personal where perfil_id is null),
  'existe personal sin cuenta (solo aparece en turnos)'
);

select * from finish();
rollback;
