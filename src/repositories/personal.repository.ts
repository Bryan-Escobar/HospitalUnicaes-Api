import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';

const personalCompleto = {
  perfiles: { select: { email: true, rol: true } },
  tipos_personal: { select: { id: true, nombre: true } },
  especialidades: { select: { id: true, nombre: true } },
} satisfies Prisma.personalInclude;

export type PersonalCompleto = Prisma.personalGetPayload<{ include: typeof personalCompleto }>;

export interface DatosPersonal {
  nombres: string;
  apellidos: string;
  telefono?: string;
  tipo_personal_id: string;
  especialidad_id?: string | null;
  codigo_empleado: string;
  num_licencia?: string | null;
  fecha_contratacion?: string | null;
}

/** Cuenta ya creada en Supabase Auth a la que se le asigna el rol de personal. */
export interface CuentaPersonal {
  perfilId: string;
  rol: 'administrador' | 'doctor' | 'recepcionista';
}

export class PersonalRepository {
  async findTipoPersonal(id: string) {
    return prisma.tipos_personal.findUnique({
      where: { id },
      select: { id: true, activo: true, rol_sugerido: true },
    });
  }

  async existeEspecialidad(id: string): Promise<boolean> {
    return (await prisma.especialidades.count({ where: { id } })) > 0;
  }

  async existeCodigoEmpleado(codigo: string): Promise<boolean> {
    return (await prisma.personal.count({ where: { codigo_empleado: codigo } })) > 0;
  }

  /** Crea el empleado y, si trae cuenta, fija su rol y nombre en `perfiles`, en una sola transacción. */
  async crear(datos: DatosPersonal, cuenta?: CuentaPersonal): Promise<PersonalCompleto> {
    const { fecha_contratacion, ...resto } = datos;
    return prisma.$transaction(async (tx) => {
      if (cuenta) {
        await tx.perfiles.update({
          where: { id: cuenta.perfilId },
          data: {
            rol: cuenta.rol,
            nombres: datos.nombres,
            apellidos: datos.apellidos,
            telefono: datos.telefono ?? null,
          },
        });
      }
      return tx.personal.create({
        data: {
          ...resto,
          perfil_id: cuenta?.perfilId ?? null,
          fecha_contratacion: fecha_contratacion ? new Date(`${fecha_contratacion}T00:00:00Z`) : null,
        },
        include: personalCompleto,
      });
    });
  }
}
