-- HUNI-36: el sistema tiene 4 roles (HUNI-95). "Recepcionista/Asistente" es un solo rol
-- con el valor 'recepcionista'; el tipo de personal (enfermero, asistente...) va en personal.tipo.
-- Postgres no permite quitar valores de un enum, así que se recrea el tipo.

-- Por si existiera algún perfil con el valor anterior
update public.perfiles set rol = 'recepcionista' where rol = 'asistente';

alter type public.rol_usuario rename to rol_usuario_old;

create type public.rol_usuario as enum ('administrador', 'doctor', 'recepcionista', 'paciente');

comment on type public.rol_usuario is
  'Roles del sistema (HUNI-95). recepcionista = Recepcionista/Asistente (incluye enfermeros).';

alter table public.perfiles alter column rol drop default;
alter table public.perfiles
  alter column rol type public.rol_usuario using rol::text::public.rol_usuario;
alter table public.perfiles alter column rol set default 'paciente'::public.rol_usuario;

drop type public.rol_usuario_old;

grant usage on type public.rol_usuario to postgres;
