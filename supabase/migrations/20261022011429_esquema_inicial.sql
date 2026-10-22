SET local check_function_bodies = off;

CREATE TABLE "public"."ambulancias" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "placa"            text                     NOT NULL,
  "ubicacion_actual" text,
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ambulancias_pkey" PRIMARY KEY (id),
  CONSTRAINT "ambulancias_placa_key" UNIQUE (placa)
);

ALTER TABLE "public"."ambulancias"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."avisos" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "titulo"            text                     NOT NULL,
  "contenido"         text                     NOT NULL,
  "autor_id"          uuid                     NOT NULL,
  "es_publico"        boolean                  NOT NULL DEFAULT true,
  "fecha_publicacion" timestamp with time zone NOT NULL DEFAULT now(),
  "fecha_expiracion"  timestamp with time zone,
  CONSTRAINT "avisos_check" CHECK (((fecha_expiracion IS NULL) OR (fecha_expiracion > fecha_publicacion))),
  CONSTRAINT "avisos_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."avisos"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."bitacora_ambulancia" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "ambulancia_id" uuid                     NOT NULL,
  "solicitud_id"  uuid,
  "descripcion"   text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bitacora_ambulancia_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."bitacora_ambulancia"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."camas" (
  "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
  "habitacion_id" uuid NOT NULL,
  "codigo"        text NOT NULL,
  CONSTRAINT "camas_codigo_key" UNIQUE (codigo),
  CONSTRAINT "camas_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."camas"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."citas" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "paciente_id" uuid                     NOT NULL,
  "doctor_id"   uuid                     NOT NULL,
  "fecha_hora"  timestamp with time zone NOT NULL,
  "motivo"      text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "citas_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."citas"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."consultas" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "expediente_id"   uuid                     NOT NULL,
  "cita_id"         uuid,
  "doctor_id"       uuid                     NOT NULL,
  "fecha"           timestamp with time zone NOT NULL DEFAULT now(),
  "motivo_consulta" text,
  "signos_vitales"  jsonb,
  "examen_fisico"   text,
  "notas"           text,
  CONSTRAINT "consultas_cita_id_key" UNIQUE (cita_id),
  CONSTRAINT "consultas_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."consultas"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."diagnosticos" (
  "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
  "consulta_id"  uuid NOT NULL,
  "codigo_cie10" text,
  "descripcion"  text NOT NULL,
  CONSTRAINT "diagnosticos_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."diagnosticos"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."especialidades" (
  "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
  "nombre"      text NOT NULL,
  "descripcion" text,
  CONSTRAINT "especialidades_nombre_key" UNIQUE (nombre),
  CONSTRAINT "especialidades_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."especialidades"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."examenes_catalogo" (
  "id"                   uuid    NOT NULL DEFAULT gen_random_uuid(),
  "nombre"               text    NOT NULL,
  "categoria"            text,
  "tipo_muestra"         text,
  "tiempo_entrega_horas" integer,
  "activo"               boolean NOT NULL DEFAULT true,
  CONSTRAINT "examenes_catalogo_nombre_key" UNIQUE (nombre),
  CONSTRAINT "examenes_catalogo_pkey" PRIMARY KEY (id),
  CONSTRAINT "examenes_catalogo_tiempo_entrega_horas_check" CHECK ((tiempo_entrega_horas > 0))
);

ALTER TABLE "public"."examenes_catalogo"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."expedientes" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "paciente_id"           uuid                     NOT NULL,
  "numero_expediente"     text                     NOT NULL,
  "tipo_sangre"           text,
  "alergias"              text,
  "antecedentes"          text,
  "enfermedades_cronicas" text,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "expedientes_numero_expediente_key" UNIQUE (numero_expediente),
  CONSTRAINT "expedientes_paciente_id_key" UNIQUE (paciente_id),
  CONSTRAINT "expedientes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."expedientes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."habitaciones" (
  "id"        uuid     NOT NULL DEFAULT gen_random_uuid(),
  "codigo"    text     NOT NULL,
  "planta"    smallint NOT NULL,
  "capacidad" smallint NOT NULL,
  "activa"    boolean  NOT NULL DEFAULT true,
  CONSTRAINT "habitaciones_codigo_key" UNIQUE (codigo),
  CONSTRAINT "habitaciones_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."habitaciones"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."hospitalizaciones" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "paciente_id"        uuid                     NOT NULL,
  "cama_id"            uuid                     NOT NULL,
  "doctor_tratante_id" uuid                     NOT NULL,
  "fecha_ingreso"      timestamp with time zone NOT NULL DEFAULT now(),
  "fecha_alta"         timestamp with time zone,
  "motivo_ingreso"     text,
  CONSTRAINT "hospitalizaciones_check" CHECK (((fecha_alta IS NULL) OR (fecha_alta >= fecha_ingreso))),
  CONSTRAINT "hospitalizaciones_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."hospitalizaciones"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."inventario_items" (
  "id"            uuid    NOT NULL DEFAULT gen_random_uuid(),
  "codigo"        text    NOT NULL,
  "nombre"        text    NOT NULL,
  "unidad_medida" text    NOT NULL,
  "stock_actual"  integer NOT NULL DEFAULT 0,
  "stock_minimo"  integer NOT NULL DEFAULT 0,
  "ubicacion"     text,
  "activo"        boolean NOT NULL DEFAULT true,
  CONSTRAINT "inventario_items_codigo_key" UNIQUE (codigo),
  CONSTRAINT "inventario_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "inventario_items_stock_actual_check" CHECK ((stock_actual >= 0)),
  CONSTRAINT "inventario_items_stock_minimo_check" CHECK ((stock_minimo >= 0))
);

ALTER TABLE "public"."inventario_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."movimientos_inventario" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "item_id"        uuid                     NOT NULL,
  "cantidad"       integer                  NOT NULL,
  "motivo"         text,
  "registrado_por" uuid                     NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "movimientos_inventario_cantidad_check" CHECK ((cantidad <> 0)),
  CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."movimientos_inventario"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."orden_examenes" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "orden_id"         uuid                     NOT NULL,
  "examen_id"        uuid                     NOT NULL,
  "fecha_inicio"     timestamp with time zone,
  "fecha_completado" timestamp with time zone,
  CONSTRAINT "orden_examenes_orden_id_examen_id_key" UNIQUE (orden_id, examen_id),
  CONSTRAINT "orden_examenes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."orden_examenes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."ordenes_laboratorio" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "consulta_id"     uuid                     NOT NULL,
  "fecha_solicitud" timestamp with time zone NOT NULL DEFAULT now(),
  "indicaciones"    text,
  CONSTRAINT "ordenes_laboratorio_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."ordenes_laboratorio"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pacientes" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "perfil_id"           uuid,
  "nombres"             text                     NOT NULL,
  "apellidos"           text                     NOT NULL,
  "documento_identidad" text,
  "fecha_nacimiento"    date,
  "telefono"            text,
  "direccion"           text,
  "contacto_emergencia" text,
  "telefono_emergencia" text,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pacientes_documento_identidad_key" UNIQUE (documento_identidad),
  CONSTRAINT "pacientes_perfil_id_key" UNIQUE (perfil_id),
  CONSTRAINT "pacientes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."pacientes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."perfiles" (
  "id"         uuid                     NOT NULL,
  "nombres"    text                     NOT NULL DEFAULT ''::text,
  "apellidos"  text                     NOT NULL DEFAULT ''::text,
  "email"      text,
  "telefono"   text,
  "avatar_url" text,
  "activo"     boolean                  NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "perfiles_email_key" UNIQUE (email),
  CONSTRAINT "perfiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."perfiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."personal" (
  "id"                 uuid    NOT NULL DEFAULT gen_random_uuid(),
  "perfil_id"          uuid    NOT NULL,
  "especialidad_id"    uuid,
  "codigo_empleado"    text    NOT NULL,
  "num_licencia"       text,
  "fecha_contratacion" date,
  "activo"             boolean NOT NULL DEFAULT true,
  CONSTRAINT "personal_codigo_empleado_key" UNIQUE (codigo_empleado),
  CONSTRAINT "personal_perfil_id_key" UNIQUE (perfil_id),
  CONSTRAINT "personal_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."personal"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."receta_detalles" (
  "id"          uuid    NOT NULL DEFAULT gen_random_uuid(),
  "receta_id"   uuid    NOT NULL,
  "item_id"     uuid,
  "medicamento" text    NOT NULL,
  "dosis"       text,
  "frecuencia"  text,
  "duracion"    text,
  "cantidad"    integer,
  CONSTRAINT "receta_detalles_cantidad_check" CHECK ((cantidad > 0)),
  CONSTRAINT "receta_detalles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."receta_detalles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."recetas" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "consulta_id"   uuid                     NOT NULL,
  "fecha_emision" timestamp with time zone NOT NULL DEFAULT now(),
  "indicaciones"  text,
  CONSTRAINT "recetas_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."recetas"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."resultados_laboratorio" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "orden_examen_id"  uuid                     NOT NULL,
  "valor"            text,
  "unidad"           text,
  "rango_referencia" text,
  "observaciones"    text,
  "archivo_url"      text,
  "validado_por"     uuid,
  "fecha_resultado"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "resultados_laboratorio_orden_examen_id_key" UNIQUE (orden_examen_id),
  CONSTRAINT "resultados_laboratorio_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."resultados_laboratorio"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."solicitudes_ambulancia" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "ambulancia_id"          uuid                     NOT NULL,
  "solicitada_por"         uuid                     NOT NULL,
  "paciente_id"            uuid,
  "direccion_origen"       text                     NOT NULL,
  "destino"                text,
  "descripcion_emergencia" text,
  "fecha_solicitud"        timestamp with time zone NOT NULL DEFAULT now(),
  "fecha_despacho"         timestamp with time zone,
  "fecha_cierre"           timestamp with time zone,
  CONSTRAINT "solicitudes_ambulancia_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."solicitudes_ambulancia"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."turnos_personal" (
  "id"          uuid                   NOT NULL DEFAULT gen_random_uuid(),
  "personal_id" uuid                   NOT NULL,
  "area"        text                   NOT NULL,
  "fecha"       date                   NOT NULL,
  "hora_inicio" time without time zone NOT NULL,
  "hora_fin"    time without time zone NOT NULL,
  "notas"       text,
  CONSTRAINT "turnos_personal_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."turnos_personal"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."categoria_inventario" AS ENUM (
  'medicamento',
  'insumo',
  'equipo'
);

ALTER TABLE "public"."inventario_items"
  ADD COLUMN "categoria" public.categoria_inventario NOT NULL;

CREATE TYPE "public"."estado_ambulancia" AS ENUM (
  'disponible',
  'en_servicio',
  'en_mantenimiento'
);

ALTER TABLE "public"."ambulancias"
  ADD COLUMN "estado" public.estado_ambulancia NOT NULL DEFAULT 'disponible'::public.estado_ambulancia;

ALTER TABLE "public"."bitacora_ambulancia"
  ADD COLUMN "estado_anterior" public.estado_ambulancia;

ALTER TABLE "public"."bitacora_ambulancia"
  ADD COLUMN "estado_nuevo" public.estado_ambulancia NOT NULL;

CREATE TYPE "public"."estado_cama" AS ENUM (
  'disponible',
  'ocupada',
  'limpieza',
  'mantenimiento'
);

ALTER TABLE "public"."camas"
  ADD COLUMN "estado" public.estado_cama NOT NULL DEFAULT 'disponible'::public.estado_cama;

CREATE TYPE "public"."estado_cita" AS ENUM (
  'programada',
  'confirmada',
  'atendida',
  'cancelada',
  'no_asistio'
);

ALTER TABLE "public"."citas"
  ADD COLUMN "estado" public.estado_cita NOT NULL DEFAULT 'programada'::public.estado_cita;

CREATE TYPE "public"."estado_hospitalizacion" AS ENUM (
  'activa',
  'alta'
);

ALTER TABLE "public"."hospitalizaciones"
  ADD COLUMN "estado" public.estado_hospitalizacion NOT NULL DEFAULT 'activa'::public.estado_hospitalizacion;

CREATE TYPE "public"."estado_laboratorio" AS ENUM (
  'pendiente',
  'en_proceso',
  'completado'
);

ALTER TABLE "public"."orden_examenes"
  ADD COLUMN "estado" public.estado_laboratorio NOT NULL DEFAULT 'pendiente'::public.estado_laboratorio;

ALTER TABLE "public"."ordenes_laboratorio"
  ADD COLUMN "estado" public.estado_laboratorio NOT NULL DEFAULT 'pendiente'::public.estado_laboratorio;

CREATE TYPE "public"."estado_solicitud" AS ENUM (
  'pendiente',
  'despachada',
  'en_curso',
  'finalizada',
  'cancelada'
);

ALTER TABLE "public"."solicitudes_ambulancia"
  ADD COLUMN "estado" public.estado_solicitud NOT NULL DEFAULT 'pendiente'::public.estado_solicitud;

CREATE TYPE "public"."prioridad" AS ENUM (
  'normal',
  'urgente',
  'critica'
);

ALTER TABLE "public"."ordenes_laboratorio"
  ADD COLUMN "prioridad" public.prioridad NOT NULL DEFAULT 'normal'::public.prioridad;

ALTER TABLE "public"."solicitudes_ambulancia"
  ADD COLUMN "prioridad" public.prioridad NOT NULL DEFAULT 'urgente'::public.prioridad;

CREATE TYPE "public"."rol_usuario" AS ENUM (
  'administrador',
  'doctor',
  'recepcionista',
  'asistente',
  'paciente'
);

ALTER TABLE "public"."perfiles"
  ADD COLUMN "rol" public.rol_usuario NOT NULL DEFAULT 'paciente'::public.rol_usuario;

CREATE TYPE "public"."sexo" AS ENUM (
  'masculino',
  'femenino',
  'otro'
);

ALTER TABLE "public"."pacientes"
  ADD COLUMN "sexo" public.sexo;

CREATE TYPE "public"."tipo_diagnostico" AS ENUM (
  'principal',
  'secundario'
);

ALTER TABLE "public"."diagnosticos"
  ADD COLUMN "tipo" public.tipo_diagnostico NOT NULL DEFAULT 'principal'::public.tipo_diagnostico;

CREATE TYPE "public"."tipo_habitacion" AS ENUM (
  'vip',
  'semiprivada'
);

ALTER TABLE "public"."habitaciones"
  ADD COLUMN "tipo" public.tipo_habitacion NOT NULL;

CREATE TYPE "public"."tipo_movimiento" AS ENUM (
  'entrada',
  'salida',
  'ajuste'
);

ALTER TABLE "public"."movimientos_inventario"
  ADD COLUMN "tipo" public.tipo_movimiento NOT NULL;

CREATE TYPE "public"."tipo_personal" AS ENUM (
  'doctor',
  'enfermero',
  'alergista',
  'emergencista',
  'asistente',
  'recepcionista',
  'administrativo'
);

ALTER TABLE "public"."personal"
  ADD COLUMN "tipo" public.tipo_personal NOT NULL;

CREATE TYPE "public"."tipo_turno" AS ENUM (
  'manana',
  'tarde',
  'noche',
  'guardia'
);

ALTER TABLE "public"."turnos_personal"
  ADD COLUMN "tipo_turno" public.tipo_turno NOT NULL;

CREATE OR REPLACE FUNCTION public.aplicar_movimiento_inventario()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  update public.inventario_items
  set stock_actual = stock_actual + case new.tipo
                                      when 'entrada' then new.cantidad
                                      when 'salida'  then -new.cantidad
                                      else new.cantidad  -- ajuste (con signo)
                                    end
  where id = new.item_id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.perfiles (id, email, nombres, apellidos)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombres', ''),
    coalesce(new.raw_user_meta_data ->> 'apellidos', '')
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_bitacora_ambulancia()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  insert into public.bitacora_ambulancia (ambulancia_id, solicitud_id, estado_anterior, estado_nuevo)
  values (
    new.id,
    (select s.id from public.solicitudes_ambulancia s
      where s.ambulancia_id = new.id and s.estado in ('despachada', 'en_curso')
      limit 1),
    old.estado,
    new.estado
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sincronizar_estado_cama()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'INSERT' and new.fecha_alta is null then
    if (select estado from public.camas where id = new.cama_id) <> 'disponible' then
      raise exception 'La cama no está disponible';
    end if;
    update public.camas set estado = 'ocupada' where id = new.cama_id;
  elsif tg_op = 'UPDATE' and old.fecha_alta is null and new.fecha_alta is not null then
    update public.camas set estado = 'limpieza' where id = new.cama_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validar_capacidad_habitacion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_capacidad smallint;
  v_camas     integer;
begin
  select capacidad into v_capacidad
  from public.habitaciones where id = new.habitacion_id
  for update;

  select count(*) into v_camas
  from public.camas
  where habitacion_id = new.habitacion_id and id <> new.id;

  if v_camas >= v_capacidad then
    raise exception 'La habitación ya tiene sus % cama(s)', v_capacidad;
  end if;
  return new;
end;
$function$;

ALTER TABLE "public"."bitacora_ambulancia"
  ADD CONSTRAINT "bitacora_ambulancia_ambulancia_id_fkey" FOREIGN KEY (ambulancia_id) REFERENCES public.ambulancias(id) ON DELETE CASCADE;

ALTER TABLE "public"."consultas"
  ADD CONSTRAINT "consultas_cita_id_fkey" FOREIGN KEY (cita_id) REFERENCES public.citas(id) ON DELETE SET NULL;

ALTER TABLE "public"."diagnosticos"
  ADD CONSTRAINT "diagnosticos_consulta_id_fkey" FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE;

ALTER TABLE "public"."consultas"
  ADD CONSTRAINT "consultas_expediente_id_fkey" FOREIGN KEY (expediente_id) REFERENCES public.expedientes(id) ON DELETE RESTRICT;

ALTER TABLE "public"."habitaciones"
  ADD CONSTRAINT "habitaciones_check"
    CHECK ((((planta = 3) AND (tipo = 'vip'::public.tipo_habitacion) AND (capacidad = 1)) OR ((planta = 2) AND (tipo = 'semiprivada'::public.tipo_habitacion) AND (capacidad = 2))));

ALTER TABLE "public"."camas"
  ADD CONSTRAINT "camas_habitacion_id_fkey" FOREIGN KEY (habitacion_id) REFERENCES public.habitaciones(id) ON DELETE RESTRICT;

ALTER TABLE "public"."hospitalizaciones"
  ADD CONSTRAINT "hospitalizaciones_cama_id_fkey" FOREIGN KEY (cama_id) REFERENCES public.camas(id) ON DELETE RESTRICT;

ALTER TABLE "public"."hospitalizaciones"
  ADD CONSTRAINT "hospitalizaciones_check1" CHECK (((estado = 'activa'::public.estado_hospitalizacion) = (fecha_alta IS NULL)));

ALTER TABLE "public"."movimientos_inventario"
  ADD CONSTRAINT "movimientos_inventario_check" CHECK (((tipo = 'ajuste'::public.tipo_movimiento) OR (cantidad > 0)));

ALTER TABLE "public"."movimientos_inventario"
  ADD CONSTRAINT "movimientos_inventario_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.inventario_items(id) ON DELETE RESTRICT;

ALTER TABLE "public"."orden_examenes"
  ADD CONSTRAINT "orden_examenes_examen_id_fkey" FOREIGN KEY (examen_id) REFERENCES public.examenes_catalogo(id) ON DELETE RESTRICT;

ALTER TABLE "public"."ordenes_laboratorio"
  ADD CONSTRAINT "ordenes_laboratorio_consulta_id_fkey" FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE RESTRICT;

ALTER TABLE "public"."orden_examenes"
  ADD CONSTRAINT "orden_examenes_orden_id_fkey" FOREIGN KEY (orden_id) REFERENCES public.ordenes_laboratorio(id) ON DELETE CASCADE;

ALTER TABLE "public"."citas"
  ADD CONSTRAINT "citas_paciente_id_fkey" FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE RESTRICT;

ALTER TABLE "public"."expedientes"
  ADD CONSTRAINT "expedientes_paciente_id_fkey" FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE RESTRICT;

ALTER TABLE "public"."hospitalizaciones"
  ADD CONSTRAINT "hospitalizaciones_paciente_id_fkey" FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE RESTRICT;

ALTER TABLE "public"."perfiles"
  ADD CONSTRAINT "perfiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."avisos"
  ADD CONSTRAINT "avisos_autor_id_fkey" FOREIGN KEY (autor_id) REFERENCES public.perfiles(id) ON DELETE RESTRICT;

ALTER TABLE "public"."movimientos_inventario"
  ADD CONSTRAINT "movimientos_inventario_registrado_por_fkey" FOREIGN KEY (registrado_por) REFERENCES public.perfiles(id) ON DELETE RESTRICT;

ALTER TABLE "public"."pacientes"
  ADD CONSTRAINT "pacientes_perfil_id_fkey" FOREIGN KEY (perfil_id) REFERENCES public.perfiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."personal"
  ADD CONSTRAINT "personal_especialidad_id_fkey" FOREIGN KEY (especialidad_id) REFERENCES public.especialidades(id) ON DELETE SET NULL;

ALTER TABLE "public"."personal"
  ADD CONSTRAINT "personal_perfil_id_fkey" FOREIGN KEY (perfil_id) REFERENCES public.perfiles(id) ON DELETE RESTRICT;

ALTER TABLE "public"."citas"
  ADD CONSTRAINT "citas_doctor_id_fkey" FOREIGN KEY (doctor_id) REFERENCES public.personal(id) ON DELETE RESTRICT;

ALTER TABLE "public"."consultas"
  ADD CONSTRAINT "consultas_doctor_id_fkey" FOREIGN KEY (doctor_id) REFERENCES public.personal(id) ON DELETE RESTRICT;

ALTER TABLE "public"."hospitalizaciones"
  ADD CONSTRAINT "hospitalizaciones_doctor_tratante_id_fkey" FOREIGN KEY (doctor_tratante_id) REFERENCES public.personal(id) ON DELETE RESTRICT;

ALTER TABLE "public"."receta_detalles"
  ADD CONSTRAINT "receta_detalles_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.inventario_items(id) ON DELETE SET NULL;

ALTER TABLE "public"."recetas"
  ADD CONSTRAINT "recetas_consulta_id_fkey" FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE;

ALTER TABLE "public"."receta_detalles"
  ADD CONSTRAINT "receta_detalles_receta_id_fkey" FOREIGN KEY (receta_id) REFERENCES public.recetas(id) ON DELETE CASCADE;

ALTER TABLE "public"."resultados_laboratorio"
  ADD CONSTRAINT "resultados_laboratorio_orden_examen_id_fkey" FOREIGN KEY (orden_examen_id) REFERENCES public.orden_examenes(id) ON DELETE CASCADE;

ALTER TABLE "public"."resultados_laboratorio"
  ADD CONSTRAINT "resultados_laboratorio_validado_por_fkey" FOREIGN KEY (validado_por) REFERENCES public.personal(id) ON DELETE SET NULL;

ALTER TABLE "public"."solicitudes_ambulancia"
  ADD CONSTRAINT "solicitudes_ambulancia_ambulancia_id_fkey" FOREIGN KEY (ambulancia_id) REFERENCES public.ambulancias(id) ON DELETE RESTRICT;

ALTER TABLE "public"."solicitudes_ambulancia"
  ADD CONSTRAINT "solicitudes_ambulancia_paciente_id_fkey" FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE SET NULL;

ALTER TABLE "public"."bitacora_ambulancia"
  ADD CONSTRAINT "bitacora_ambulancia_solicitud_id_fkey" FOREIGN KEY (solicitud_id) REFERENCES public.solicitudes_ambulancia(id) ON DELETE SET NULL;

ALTER TABLE "public"."solicitudes_ambulancia"
  ADD CONSTRAINT "solicitudes_ambulancia_solicitada_por_fkey" FOREIGN KEY (solicitada_por) REFERENCES public.perfiles(id) ON DELETE RESTRICT;

ALTER TABLE "public"."turnos_personal"
  ADD CONSTRAINT "turnos_personal_personal_id_fkey" FOREIGN KEY (personal_id) REFERENCES public.personal(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX ambulancias_unica ON public.ambulancias USING btree ((true));

CREATE INDEX avisos_autor_id_idx ON public.avisos USING btree (autor_id);

CREATE INDEX bitacora_ambulancia_ambulancia_id_idx ON public.bitacora_ambulancia USING btree (ambulancia_id);

CREATE INDEX bitacora_ambulancia_solicitud_id_idx ON public.bitacora_ambulancia USING btree (solicitud_id);

CREATE INDEX camas_habitacion_id_idx ON public.camas USING btree (habitacion_id);

CREATE UNIQUE INDEX citas_doctor_hora_unica ON public.citas USING btree (doctor_id, fecha_hora)
  WHERE (estado = ANY (ARRAY['programada'::public.estado_cita, 'confirmada'::public.estado_cita]));

CREATE INDEX citas_fecha_hora_idx ON public.citas USING btree (fecha_hora);

CREATE INDEX citas_paciente_id_idx ON public.citas USING btree (paciente_id);

CREATE INDEX consultas_doctor_id_idx ON public.consultas USING btree (doctor_id);

CREATE INDEX consultas_expediente_id_idx ON public.consultas USING btree (expediente_id);

CREATE INDEX diagnosticos_consulta_id_idx ON public.diagnosticos USING btree (consulta_id);

CREATE UNIQUE INDEX hospitalizaciones_cama_activa ON public.hospitalizaciones USING btree (cama_id)
  WHERE (fecha_alta IS NULL);

CREATE INDEX hospitalizaciones_doctor_tratante_id_idx ON public.hospitalizaciones USING btree (doctor_tratante_id);

CREATE UNIQUE INDEX hospitalizaciones_paciente_activo ON public.hospitalizaciones USING btree (paciente_id)
  WHERE (fecha_alta IS NULL);

CREATE INDEX movimientos_inventario_item_id_idx ON public.movimientos_inventario USING btree (item_id);

CREATE INDEX movimientos_inventario_registrado_por_idx ON public.movimientos_inventario USING btree (registrado_por);

CREATE INDEX orden_examenes_examen_id_idx ON public.orden_examenes USING btree (examen_id);

CREATE INDEX ordenes_laboratorio_consulta_id_idx ON public.ordenes_laboratorio USING btree (consulta_id);

CREATE INDEX personal_especialidad_id_idx ON public.personal USING btree (especialidad_id);

CREATE INDEX receta_detalles_item_id_idx ON public.receta_detalles USING btree (item_id);

CREATE INDEX receta_detalles_receta_id_idx ON public.receta_detalles USING btree (receta_id);

CREATE INDEX recetas_consulta_id_idx ON public.recetas USING btree (consulta_id);

CREATE INDEX resultados_laboratorio_validado_por_idx ON public.resultados_laboratorio USING btree (validado_por);

CREATE INDEX solicitudes_ambulancia_paciente_id_idx ON public.solicitudes_ambulancia USING btree (paciente_id);

CREATE INDEX solicitudes_ambulancia_solicitada_por_idx ON public.solicitudes_ambulancia USING btree (solicitada_por);

CREATE UNIQUE INDEX solicitudes_ambulancia_una_activa ON public.solicitudes_ambulancia USING btree (ambulancia_id)
  WHERE (estado = ANY (ARRAY['despachada'::public.estado_solicitud, 'en_curso'::public.estado_solicitud]));

CREATE INDEX turnos_personal_personal_id_fecha_idx ON public.turnos_personal USING btree (personal_id, fecha);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER ambulancias_bitacora
  AFTER UPDATE OF estado ON public.ambulancias
  FOR EACH ROW
  WHEN ((old.estado IS DISTINCT FROM new.estado))
  EXECUTE FUNCTION public.registrar_bitacora_ambulancia();

CREATE TRIGGER ambulancias_updated_at
  BEFORE UPDATE ON public.ambulancias
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER camas_validar_capacidad
  BEFORE INSERT OR UPDATE OF habitacion_id ON public.camas
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_capacidad_habitacion();

CREATE TRIGGER expedientes_updated_at
  BEFORE UPDATE ON public.expedientes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER hospitalizaciones_estado_cama
  AFTER INSERT OR UPDATE OF fecha_alta ON public.hospitalizaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_estado_cama();

CREATE TRIGGER movimientos_aplicar_stock
  AFTER INSERT ON public.movimientos_inventario
  FOR EACH ROW
  EXECUTE FUNCTION public.aplicar_movimiento_inventario();

CREATE TRIGGER perfiles_updated_at
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

GRANT EXECUTE ON FUNCTION "public"."aplicar_movimiento_inventario"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."registrar_bitacora_ambulancia"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."sincronizar_estado_cama"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."validar_capacidad_habitacion"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ambulancias" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."avisos" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bitacora_ambulancia" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."camas" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."citas" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."consultas" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."diagnosticos" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."especialidades" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examenes_catalogo" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."expedientes" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."habitaciones" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hospitalizaciones" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."inventario_items" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."movimientos_inventario" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."orden_examenes" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ordenes_laboratorio" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pacientes" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."perfiles" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."personal" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."receta_detalles" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."recetas" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."resultados_laboratorio" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."solicitudes_ambulancia" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."turnos_personal" TO "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON TYPE "public"."categoria_inventario" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_ambulancia" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_cama" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_cita" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_hospitalizacion" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_laboratorio" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_solicitud" TO "postgres";

GRANT USAGE ON TYPE "public"."prioridad" TO "postgres";

GRANT USAGE ON TYPE "public"."rol_usuario" TO "postgres";

GRANT USAGE ON TYPE "public"."sexo" TO "postgres";

GRANT USAGE ON TYPE "public"."tipo_diagnostico" TO "postgres";

GRANT USAGE ON TYPE "public"."tipo_habitacion" TO "postgres";

GRANT USAGE ON TYPE "public"."tipo_movimiento" TO "postgres";

GRANT USAGE ON TYPE "public"."tipo_personal" TO "postgres";

GRANT USAGE ON TYPE "public"."tipo_turno" TO "postgres";

