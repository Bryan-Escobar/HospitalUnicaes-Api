import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { aFecha, conReintentoDeExpediente, crearPacienteConExpediente, DatosNuevoPaciente } from './helpers/expediente';

const conExpediente = { expedientes: { select: { numero_expediente: true } } } satisfies Prisma.pacientesInclude;

export type PacienteConExpediente = Prisma.pacientesGetPayload<{ include: typeof conExpediente }>;

export interface FiltroPacientes {
  buscar?: string;
  activo?: boolean;
  /** Solo pacientes que atiende este doctor (id de `personal`). */
  tratadosPor?: string;
}

export type CambiosPaciente = Partial<Omit<DatosNuevoPaciente, 'alergias'>> & { activo?: boolean };

/**
 * Médico tratante (context.md §3.4): el doctor tiene una cita no cancelada, una consulta
 * o una hospitalización con el paciente.
 */
const tratadoPor = (personalId: string): Prisma.pacientesWhereInput => ({
  OR: [
    { citas: { some: { doctor_id: personalId, estado: { not: 'cancelada' } } } },
    { expedientes: { is: { consultas: { some: { doctor_id: personalId } } } } },
    { hospitalizaciones: { some: { doctor_tratante_id: personalId } } },
  ],
});

const construirWhere = ({ buscar, activo, tratadosPor }: FiltroPacientes): Prisma.pacientesWhereInput => ({
  AND: [
    activo === undefined ? {} : { activo },
    buscar
      ? {
          OR: [
            { nombres: { contains: buscar, mode: 'insensitive' } },
            { apellidos: { contains: buscar, mode: 'insensitive' } },
            { documento_identidad: { contains: buscar, mode: 'insensitive' } },
          ],
        }
      : {},
    tratadosPor ? tratadoPor(tratadosPor) : {},
  ],
});

export class PacientesRepository {
  async listar(filtro: FiltroPacientes, skip: number, take: number): Promise<[PacienteConExpediente[], number]> {
    const where = construirWhere(filtro);
    return prisma.$transaction([
      prisma.pacientes.findMany({
        where,
        include: conExpediente,
        orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
        skip,
        take,
      }),
      prisma.pacientes.count({ where }),
    ]);
  }

  async findById(id: string): Promise<PacienteConExpediente | null> {
    return prisma.pacientes.findUnique({ where: { id }, include: conExpediente });
  }

  async existeDocumento(documento: string, exceptoId?: string): Promise<boolean> {
    const n = await prisma.pacientes.count({
      where: { documento_identidad: documento, ...(exceptoId ? { id: { not: exceptoId } } : {}) },
    });
    return n > 0;
  }

  /** Id del registro de personal de una cuenta (para saber a qué pacientes atiende un doctor). */
  async findPersonalIdDePerfil(perfilId: string): Promise<string | null> {
    return (await prisma.personal.findUnique({ where: { perfil_id: perfilId }, select: { id: true } }))?.id ?? null;
  }

  async esTratante(pacienteId: string, personalId: string): Promise<boolean> {
    return (await prisma.pacientes.count({ where: { id: pacienteId, ...tratadoPor(personalId) } })) > 0;
  }

  /** Alta en recepción: paciente sin cuenta + expediente con número correlativo. */
  async crear(datos: DatosNuevoPaciente): Promise<PacienteConExpediente> {
    return conReintentoDeExpediente(() =>
      prisma.$transaction(async (tx) => {
        const nuevo = await crearPacienteConExpediente(tx, datos, null);
        return tx.pacientes.findUniqueOrThrow({ where: { id: nuevo.id }, include: conExpediente });
      }),
    );
  }

  /** Actualiza el paciente y copia nombre, teléfono y estado a su cuenta (si tiene) para que no diverjan. */
  async actualizar(id: string, cambios: CambiosPaciente): Promise<PacienteConExpediente> {
    const { fecha_nacimiento, ...resto } = cambios;
    return prisma.$transaction(async (tx) => {
      const paciente = await tx.pacientes.update({
        where: { id },
        data: { ...resto, ...(fecha_nacimiento !== undefined ? { fecha_nacimiento: aFecha(fecha_nacimiento) } : {}) },
        include: conExpediente,
      });
      const { nombres, apellidos, telefono, activo } = cambios;
      const cuenta = { nombres, apellidos, telefono, activo };
      if (paciente.perfil_id && Object.values(cuenta).some((v) => v !== undefined)) {
        await tx.perfiles.update({ where: { id: paciente.perfil_id }, data: { ...cuenta, updated_at: new Date() } });
      }
      return paciente;
    });
  }
}
