import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';

export type EstadoAmbulancia = 'disponible' | 'en_servicio' | 'en_mantenimiento';
export type EstadoSolicitud = 'pendiente' | 'despachada' | 'en_curso' | 'finalizada' | 'cancelada';
export type Prioridad = 'normal' | 'urgente' | 'critica';
export type TipoEmergencia =
  'accidente' | 'cardiaca' | 'respiratoria' | 'neurologica' | 'obstetrica' | 'intoxicacion' | 'traslado' | 'otra';
export type CanalSolicitud = 'app' | 'publico';

/** Estados en los que la solicitud sigue abierta (se puede completar o cancelar). */
export const ESTADOS_ABIERTOS: EstadoSolicitud[] = ['pendiente', 'despachada', 'en_curso'];

const solicitudInclude = {
  perfiles: { select: { id: true, nombres: true, apellidos: true, rol: true } },
  pacientes: { select: { id: true, nombres: true, apellidos: true, perfil_id: true } },
} satisfies Prisma.solicitudes_ambulanciaInclude;

const ambulanciaInclude = {
  solicitudes_ambulancia: {
    where: { estado: { in: ['despachada', 'en_curso'] } },
    include: solicitudInclude,
    take: 1,
  },
} satisfies Prisma.ambulanciasInclude;

const bitacoraInclude = {
  perfiles: { select: { id: true, nombres: true, apellidos: true } },
  solicitudes_ambulancia: { include: solicitudInclude },
} satisfies Prisma.bitacora_ambulanciaInclude;

export type SolicitudCompleta = Prisma.solicitudes_ambulanciaGetPayload<{ include: typeof solicitudInclude }>;
export type AmbulanciaConServicio = Prisma.ambulanciasGetPayload<{ include: typeof ambulanciaInclude }>;
export type BitacoraCompleta = Prisma.bitacora_ambulanciaGetPayload<{ include: typeof bitacoraInclude }>;

export interface DatosSolicitud {
  canal: CanalSolicitud;
  solicitada_por?: string | null;
  paciente_id?: string | null;
  codigo_seguimiento?: string | null;
  direccion_origen?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  precision_m?: number | null;
  destino?: string | null;
  descripcion_emergencia?: string | null;
  tipo_emergencia?: TipoEmergencia | null;
  prioridad?: Prioridad;
  telefono_contacto?: string | null;
  nombre_contacto?: string | null;
}

export type CambiosSolicitud = Partial<
  Pick<
    DatosSolicitud,
    | 'paciente_id'
    | 'direccion_origen'
    | 'destino'
    | 'descripcion_emergencia'
    | 'tipo_emergencia'
    | 'prioridad'
    | 'telefono_contacto'
    | 'nombre_contacto'
  >
>;

export interface FiltroSolicitudes {
  estado?: EstadoSolicitud;
  prioridad?: Prioridad;
  tipoEmergencia?: TipoEmergencia;
  canal?: CanalSolicitud;
  desde?: Date;
  hastaExclusivo?: Date;
  /** Solo las del paciente con esta cuenta (las que pidió o en las que es el paciente). */
  perfilPaciente?: string;
}

export interface FiltroBitacora {
  estado?: EstadoAmbulancia;
  prioridad?: Prioridad;
  tipoEmergencia?: TipoEmergencia;
  desde?: Date;
  hastaExclusivo?: Date;
}

const rangoFechas = (desde?: Date, hastaExclusivo?: Date) =>
  desde || hastaExclusivo
    ? { ...(desde ? { gte: desde } : {}), ...(hastaExclusivo ? { lt: hastaExclusivo } : {}) }
    : undefined;

/**
 * Ambulancia, solicitudes y bitácora (HUNI-70).
 * Despachar, pasar a en curso, cerrar, cancelar y el mantenimiento pasan por funciones de Postgres que
 * bloquean la fila de la única ambulancia: dos despachos simultáneos nunca salen los dos. Sus errores llegan
 * como 'CODIGO: detalle' (AMBULANCIA_NO_DISPONIBLE, TRANSICION_INVALIDA...) y handleError los traduce.
 * Cada cambio de estado de la ambulancia lo registra la BD en la bitácora (trigger).
 */
export class AmbulanciaRepository {
  async findAmbulancia(): Promise<AmbulanciaConServicio | null> {
    return prisma.ambulancias.findFirst({ include: ambulanciaInclude });
  }

  async crearSolicitud(datos: DatosSolicitud): Promise<SolicitudCompleta> {
    const ambulancia = await prisma.ambulancias.findFirstOrThrow({ select: { id: true } });
    return prisma.solicitudes_ambulancia.create({
      data: { ...datos, ambulancia_id: ambulancia.id },
      include: solicitudInclude,
    });
  }

  async contarPendientesPublicas(): Promise<number> {
    return prisma.solicitudes_ambulancia.count({ where: { canal: 'publico', estado: 'pendiente' } });
  }

  /** Si el paciente (por su cuenta o como paciente) ya tiene una solicitud abierta. */
  async tieneSolicitudAbierta(perfilId: string): Promise<boolean> {
    const n = await prisma.solicitudes_ambulancia.count({
      where: {
        estado: { in: ESTADOS_ABIERTOS },
        OR: [{ solicitada_por: perfilId }, { pacientes: { is: { perfil_id: perfilId } } }],
      },
    });
    return n > 0;
  }

  async findPacienteIdDePerfil(perfilId: string): Promise<string | null> {
    return (await prisma.pacientes.findUnique({ where: { perfil_id: perfilId }, select: { id: true } }))?.id ?? null;
  }

  async findSolicitud(id: string): Promise<SolicitudCompleta | null> {
    return prisma.solicitudes_ambulancia.findUnique({ where: { id }, include: solicitudInclude });
  }

  async findPorCodigo(codigo: string): Promise<SolicitudCompleta | null> {
    return prisma.solicitudes_ambulancia.findUnique({
      where: { codigo_seguimiento: codigo },
      include: solicitudInclude,
    });
  }

  /** Solo cambia una solicitud abierta; devuelve false si ya estaba finalizada o cancelada. */
  async actualizarAbierta(id: string, cambios: CambiosSolicitud): Promise<boolean> {
    const { count } = await prisma.solicitudes_ambulancia.updateMany({
      where: { id, estado: { in: ESTADOS_ABIERTOS } },
      data: cambios,
    });
    return count > 0;
  }

  async listarSolicitudes(
    filtro: FiltroSolicitudes,
    skip: number,
    take: number,
  ): Promise<[SolicitudCompleta[], number]> {
    const where: Prisma.solicitudes_ambulanciaWhereInput = {
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.prioridad ? { prioridad: filtro.prioridad } : {}),
      ...(filtro.tipoEmergencia ? { tipo_emergencia: filtro.tipoEmergencia } : {}),
      ...(filtro.canal ? { canal: filtro.canal } : {}),
      ...(rangoFechas(filtro.desde, filtro.hastaExclusivo)
        ? { fecha_solicitud: rangoFechas(filtro.desde, filtro.hastaExclusivo) }
        : {}),
      ...(filtro.perfilPaciente
        ? {
            OR: [
              { solicitada_por: filtro.perfilPaciente },
              { pacientes: { is: { perfil_id: filtro.perfilPaciente } } },
            ],
          }
        : {}),
    };
    return prisma.$transaction([
      prisma.solicitudes_ambulancia.findMany({
        where,
        include: solicitudInclude,
        orderBy: { fecha_solicitud: 'desc' },
        skip,
        take,
      }),
      prisma.solicitudes_ambulancia.count({ where }),
    ]);
  }

  async despachar(id: string, perfilId: string): Promise<void> {
    await prisma.$queryRaw`select public.despachar_ambulancia(${id}::uuid, ${perfilId}::uuid)::text`;
  }

  async marcarEnCurso(id: string): Promise<void> {
    await prisma.$queryRaw`select public.marcar_solicitud_en_curso(${id}::uuid)::text`;
  }

  async cerrar(id: string, notas: string | undefined, perfilId: string): Promise<void> {
    await prisma.$queryRaw`
      select public.cerrar_servicio_ambulancia(${id}::uuid, ${notas ?? null}::text, ${perfilId}::uuid)::text`;
  }

  async cancelar(id: string, motivo: string | undefined, perfilId: string | null, permitirEnServicio: boolean) {
    await prisma.$queryRaw`
      select public.cancelar_solicitud_ambulancia(
        ${id}::uuid, ${motivo ?? null}::text, ${perfilId}::uuid, ${permitirEnServicio}::boolean
      )::text`;
  }

  async cambiarEstado(estado: EstadoAmbulancia, descripcion: string | undefined, perfilId: string): Promise<void> {
    await prisma.$queryRaw`
      select public.cambiar_estado_ambulancia(
        ${estado}::public.estado_ambulancia, ${descripcion ?? null}::text, ${perfilId}::uuid
      )::text`;
  }

  async listarBitacora(filtro: FiltroBitacora, skip: number, take: number): Promise<[BitacoraCompleta[], number]> {
    const solicitud: Prisma.solicitudes_ambulanciaWhereInput = {
      ...(filtro.prioridad ? { prioridad: filtro.prioridad } : {}),
      ...(filtro.tipoEmergencia ? { tipo_emergencia: filtro.tipoEmergencia } : {}),
    };
    const where: Prisma.bitacora_ambulanciaWhereInput = {
      ...(filtro.estado ? { estado_nuevo: filtro.estado } : {}),
      ...(rangoFechas(filtro.desde, filtro.hastaExclusivo)
        ? { created_at: rangoFechas(filtro.desde, filtro.hastaExclusivo) }
        : {}),
      ...(Object.keys(solicitud).length > 0 ? { solicitudes_ambulancia: { is: solicitud } } : {}),
    };
    return prisma.$transaction([
      prisma.bitacora_ambulancia.findMany({
        where,
        include: bitacoraInclude,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      prisma.bitacora_ambulancia.count({ where }),
    ]);
  }
}
