import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { tratadoPor } from './pacientes.repository';

const persona = { select: { id: true, nombres: true, apellidos: true } } as const;
const habitacionResumen = { select: { id: true, codigo: true, planta: true, tipo: true } } as const;

export type TipoHabitacion = 'vip' | 'semiprivada';
export type EstadoCama = 'disponible' | 'ocupada' | 'limpieza' | 'mantenimiento';

const camaInclude = { habitaciones: habitacionResumen } satisfies Prisma.camasInclude;

/** Mapa: habitaciones con sus camas y la hospitalización activa de cada cama. */
const habitacionInclude = {
  camas: {
    orderBy: { codigo: 'asc' },
    include: {
      hospitalizaciones: {
        where: { fecha_alta: null },
        select: {
          id: true,
          fecha_ingreso: true,
          pacientes: { select: { id: true, nombres: true, apellidos: true, sexo: true } },
        },
      },
    },
  },
} satisfies Prisma.habitacionesInclude;

const hospitalizacionInclude = {
  pacientes: { select: { id: true, nombres: true, apellidos: true, perfil_id: true } },
  camas: { select: { id: true, codigo: true, habitaciones: habitacionResumen } },
  personal: { select: { id: true, nombres: true, apellidos: true, especialidades: { select: { nombre: true } } } },
} satisfies Prisma.hospitalizacionesInclude;

const hospitalizacionDetalleInclude = {
  ...hospitalizacionInclude,
  movimientos_cama: {
    orderBy: { created_at: 'asc' },
    include: {
      camas_movimientos_cama_cama_origen_idTocamas: { select: { id: true, codigo: true } },
      camas_movimientos_cama_cama_destino_idTocamas: { select: { id: true, codigo: true } },
      personal: persona,
    },
  },
} satisfies Prisma.hospitalizacionesInclude;

export type HabitacionConCamas = Prisma.habitacionesGetPayload<{ include: typeof habitacionInclude }>;
export type CamaConHabitacion = Prisma.camasGetPayload<{ include: typeof camaInclude }>;
export type HospitalizacionCompleta = Prisma.hospitalizacionesGetPayload<{ include: typeof hospitalizacionInclude }>;
export type HospitalizacionDetalle = Prisma.hospitalizacionesGetPayload<{
  include: typeof hospitalizacionDetalleInclude;
}>;

export interface FiltroHabitaciones {
  planta?: number;
  tipo?: TipoHabitacion;
}

export interface FiltroHospitalizaciones {
  estado?: 'activa' | 'alta';
  pacienteId?: string;
  /** Solo pacientes que atiende este doctor (id de `personal`). */
  tratadosPor?: string;
  /** Solo las del paciente con esta cuenta (rol paciente). */
  perfilPaciente?: string;
}

export interface DatosIngreso {
  paciente_id: string;
  doctor_tratante_id: string;
  cama_id?: string;
  tipo_habitacion?: TipoHabitacion;
  motivo_ingreso?: string;
}

const whereHabitacion = (f: FiltroHabitaciones): Prisma.habitacionesWhereInput => ({
  ...(f.planta ? { planta: f.planta } : {}),
  ...(f.tipo ? { tipo: f.tipo } : {}),
});

/**
 * Habitaciones, camas y hospitalizaciones (HUNI-66).
 * Ingresar, trasladar y dar de alta pasan por funciones de Postgres que bloquean la fila de la cama
 * (y del paciente), así dos peticiones simultáneas nunca toman la misma cama. Sus errores llegan como
 * 'CODIGO: detalle' (CAMA_OCUPADA, PACIENTE_YA_HOSPITALIZADO...) y handleError los traduce.
 */
export class HabitacionesRepository {
  async listarHabitaciones(filtro: FiltroHabitaciones): Promise<HabitacionConCamas[]> {
    return prisma.habitaciones.findMany({
      where: whereHabitacion(filtro),
      include: habitacionInclude,
      orderBy: [{ planta: 'desc' }, { codigo: 'asc' }],
    });
  }

  async listarCamas(filtro: FiltroHabitaciones & { estado?: EstadoCama }): Promise<CamaConHabitacion[]> {
    return prisma.camas.findMany({
      where: {
        ...(filtro.estado ? { estado: filtro.estado } : {}),
        habitaciones: { is: whereHabitacion(filtro) },
      },
      include: camaInclude,
      orderBy: { codigo: 'asc' },
    });
  }

  async findCama(id: string): Promise<CamaConHabitacion | null> {
    return prisma.camas.findUnique({ where: { id }, include: camaInclude });
  }

  /** Cama sugerida sin bloquear (solo para mostrarla); el ingreso vuelve a elegir con bloqueo. */
  async sugerirCama(tipo: TipoHabitacion): Promise<CamaConHabitacion | null> {
    const [fila] = await prisma.$queryRaw<{ id: string | null }[]>`
      select public.sugerir_cama(${tipo}::public.tipo_habitacion)::text as id`;
    return fila?.id ? this.findCama(fila.id) : null;
  }

  /** disponible / limpieza / mantenimiento. La BD impide liberar a mano una cama con paciente. */
  async cambiarEstadoCama(id: string, estado: Exclude<EstadoCama, 'ocupada'>): Promise<CamaConHabitacion> {
    return prisma.camas.update({ where: { id }, data: { estado }, include: camaInclude });
  }

  async ingresar(datos: DatosIngreso, registradoPor: string | null): Promise<string> {
    const [fila] = await prisma.$queryRaw<{ id: string }[]>`
      select public.asignar_cama(
        ${datos.paciente_id}::uuid,
        ${datos.doctor_tratante_id}::uuid,
        ${datos.cama_id ?? null}::uuid,
        ${datos.tipo_habitacion ?? null}::public.tipo_habitacion,
        ${datos.motivo_ingreso ?? null}::text,
        ${registradoPor}::uuid
      )::text as id`;
    return fila.id;
  }

  async trasladar(hospitalizacionId: string, camaId: string, registradoPor: string | null): Promise<void> {
    await prisma.$queryRaw`
      select public.trasladar_cama(${hospitalizacionId}::uuid, ${camaId}::uuid, ${registradoPor}::uuid)::text`;
  }

  async darAlta(hospitalizacionId: string, notas: string | undefined, registradoPor: string | null): Promise<void> {
    await prisma.$queryRaw`
      select public.dar_alta(${hospitalizacionId}::uuid, ${notas ?? null}::text, ${registradoPor}::uuid)::text`;
  }

  async listarHospitalizaciones(
    filtro: FiltroHospitalizaciones,
    skip: number,
    take: number,
  ): Promise<[HospitalizacionCompleta[], number]> {
    const paciente: Prisma.pacientesWhereInput = {
      ...(filtro.perfilPaciente ? { perfil_id: filtro.perfilPaciente } : {}),
      ...(filtro.tratadosPor ? tratadoPor(filtro.tratadosPor) : {}),
    };
    const where: Prisma.hospitalizacionesWhereInput = {
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.pacienteId ? { paciente_id: filtro.pacienteId } : {}),
      ...(Object.keys(paciente).length > 0 ? { pacientes: { is: paciente } } : {}),
    };
    return prisma.$transaction([
      prisma.hospitalizaciones.findMany({
        where,
        include: hospitalizacionInclude,
        orderBy: { fecha_ingreso: 'desc' },
        skip,
        take,
      }),
      prisma.hospitalizaciones.count({ where }),
    ]);
  }

  /** De estos pacientes, los que atiende el doctor (para mostrarle solo sus ocupantes en el mapa). */
  async pacientesTratados(personalId: string, pacienteIds: string[]): Promise<Set<string>> {
    if (pacienteIds.length === 0) return new Set();
    const filas = await prisma.pacientes.findMany({
      where: { id: { in: pacienteIds }, ...tratadoPor(personalId) },
      select: { id: true },
    });
    return new Set(filas.map((f) => f.id));
  }

  async findHospitalizacion(id: string): Promise<HospitalizacionDetalle | null> {
    return prisma.hospitalizaciones.findUnique({ where: { id }, include: hospitalizacionDetalleInclude });
  }
}
