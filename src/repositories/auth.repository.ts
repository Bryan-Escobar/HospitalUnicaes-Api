import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { conReintentoDeExpediente, crearPacienteConExpediente, DatosNuevoPaciente } from './helpers/expediente';

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

export type DatosRegistroPaciente = DatosNuevoPaciente;

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
    return conReintentoDeExpediente(() =>
      prisma.$transaction(async (tx) => {
        await tx.perfiles.update({
          where: { id: perfilId },
          data: {
            rol: 'paciente',
            nombres: datos.nombres,
            apellidos: datos.apellidos,
            telefono: datos.telefono ?? null,
          },
        });
        await crearPacienteConExpediente(tx, datos, perfilId);
        return tx.perfiles.findUniqueOrThrow({ where: { id: perfilId }, include: perfilConRelaciones });
      }),
    );
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
}
