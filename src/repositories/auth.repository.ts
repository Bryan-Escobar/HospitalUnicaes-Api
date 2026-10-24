import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';

const perfilConRelaciones = {
  pacientes: { select: { id: true } },
  personal: {
    select: {
      id: true,
      codigo_empleado: true,
      tipos_personal: { select: { id: true, nombre: true } },
      especialidades: { select: { nombre: true } },
    },
  },
} satisfies Prisma.perfilesInclude;

export type PerfilConRelaciones = Prisma.perfilesGetPayload<{ include: typeof perfilConRelaciones }>;
export type Perfil = Prisma.perfilesGetPayload<object>;

export interface DatosRegistroPaciente {
  nombres: string;
  apellidos: string;
  documento_identidad?: string;
  fecha_nacimiento?: string;
  sexo?: 'masculino' | 'femenino' | 'otro';
  telefono?: string;
  direccion?: string;
  contacto_emergencia?: string;
  telefono_emergencia?: string;
  alergias?: string;
}

export interface CambiosPerfil {
  nombres?: string;
  apellidos?: string;
  telefono?: string | null;
  avatar_url?: string | null;
}

export class AuthRepository {
  /** Lo mínimo para autorizar una petición (se llama en cada request protegido). */
  async findPerfilSesion(id: string) {
    return prisma.perfiles.findUnique({ where: { id }, select: { id: true, rol: true, activo: true } });
  }

  async findPerfilCompleto(id: string): Promise<PerfilConRelaciones | null> {
    return prisma.perfiles.findUnique({ where: { id }, include: perfilConRelaciones });
  }

  async existeDocumento(documento: string): Promise<boolean> {
    return (await prisma.pacientes.count({ where: { documento_identidad: documento } })) > 0;
  }

  /**
   * En una sola transacción: fija el rol `paciente` del perfil (lo creó el trigger), crea el paciente
   * y su expediente con el siguiente número `EXP-<año>-<00000>`.
   */
  async crearPaciente(perfilId: string, datos: DatosRegistroPaciente): Promise<PerfilConRelaciones> {
    // Dos registros simultáneos pueden calcular el mismo número de expediente: se reintenta.
    for (let intento = 1; ; intento++) {
      try {
        return await this.crearPacienteTx(perfilId, datos);
      } catch (error) {
        const choqueExpediente =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          String(error.meta?.target).includes('numero_expediente');
        if (!choqueExpediente || intento >= 3) throw error;
      }
    }
  }

  private async crearPacienteTx(perfilId: string, datos: DatosRegistroPaciente): Promise<PerfilConRelaciones> {
    const { alergias, fecha_nacimiento, ...paciente } = datos;
    return prisma.$transaction(async (tx) => {
      await tx.perfiles.update({
        where: { id: perfilId },
        data: { rol: 'paciente', nombres: datos.nombres, apellidos: datos.apellidos, telefono: datos.telefono ?? null },
      });
      const nuevo = await tx.pacientes.create({
        data: {
          ...paciente,
          perfil_id: perfilId,
          fecha_nacimiento: fecha_nacimiento ? new Date(`${fecha_nacimiento}T00:00:00Z`) : undefined,
        },
      });
      await tx.expedientes.create({
        data: { paciente_id: nuevo.id, numero_expediente: await this.siguienteNumeroExpediente(tx), alergias },
      });
      return tx.perfiles.findUniqueOrThrow({ where: { id: perfilId }, include: perfilConRelaciones });
    });
  }

  /** Actualiza el perfil y copia nombre y teléfono al paciente o empleado vinculado para que no diverjan. */
  async actualizarPerfil(id: string, cambios: CambiosPerfil): Promise<Perfil> {
    const { avatar_url: _avatar, ...compartidos } = cambios;
    return prisma.$transaction(async (tx) => {
      const perfil = await tx.perfiles.update({ where: { id }, data: { ...cambios, updated_at: new Date() } });
      if (Object.keys(compartidos).length > 0) {
        await tx.pacientes.updateMany({ where: { perfil_id: id }, data: compartidos });
        await tx.personal.updateMany({ where: { perfil_id: id }, data: compartidos });
      }
      return perfil;
    });
  }

  private async siguienteNumeroExpediente(tx: Prisma.TransactionClient): Promise<string> {
    const prefijo = `EXP-${new Date().getUTCFullYear()}-`;
    const ultimo = await tx.expedientes.findFirst({
      where: { numero_expediente: { startsWith: prefijo } },
      orderBy: { numero_expediente: 'desc' },
      select: { numero_expediente: true },
    });
    const siguiente = (ultimo ? Number(ultimo.numero_expediente.slice(prefijo.length)) : 0) + 1;
    return `${prefijo}${String(siguiente).padStart(5, '0')}`;
  }
}
