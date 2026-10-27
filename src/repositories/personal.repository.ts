import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { aFecha } from './helpers/expediente';

const personalCompleto = {
  perfiles: { select: { email: true, rol: true } },
  tipos_personal: { select: { id: true, nombre: true } },
  especialidades: { select: { id: true, nombre: true } },
} satisfies Prisma.personalInclude;

export type PersonalCompleto = Prisma.personalGetPayload<{ include: typeof personalCompleto }>;

type RolPersonal = 'administrador' | 'doctor' | 'recepcionista';

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

export type CambiosPersonal = Partial<DatosPersonal> & { activo?: boolean; rol?: RolPersonal };

/** Cuenta ya creada en Supabase Auth a la que se le asigna el rol de personal. */
export interface CuentaPersonal {
  perfilId: string;
  rol: RolPersonal;
}

export interface FiltroPersonal {
  buscar?: string;
  tipo_personal_id?: string;
  especialidad_id?: string;
  activo?: boolean;
}

const construirWhere = ({ buscar, tipo_personal_id, especialidad_id, activo }: FiltroPersonal) =>
  ({
    tipo_personal_id,
    especialidad_id,
    activo,
    ...(buscar
      ? {
          OR: [
            { nombres: { contains: buscar, mode: 'insensitive' } },
            { apellidos: { contains: buscar, mode: 'insensitive' } },
            { codigo_empleado: { contains: buscar, mode: 'insensitive' } },
          ],
        }
      : {}),
  }) satisfies Prisma.personalWhereInput;

const fechaONull = (valor: string | null | undefined) =>
  valor === undefined ? undefined : valor === null ? null : aFecha(valor);

export class PersonalRepository {
  async listar(filtro: FiltroPersonal, skip: number, take: number): Promise<[PersonalCompleto[], number]> {
    const where = construirWhere(filtro);
    return prisma.$transaction([
      prisma.personal.findMany({
        where,
        include: personalCompleto,
        orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
        skip,
        take,
      }),
      prisma.personal.count({ where }),
    ]);
  }

  async findById(id: string): Promise<PersonalCompleto | null> {
    return prisma.personal.findUnique({ where: { id }, include: personalCompleto });
  }

  async findTipoPersonal(id: string) {
    return prisma.tipos_personal.findUnique({
      where: { id },
      select: { id: true, activo: true, rol_sugerido: true },
    });
  }

  async existeEspecialidad(id: string): Promise<boolean> {
    return (await prisma.especialidades.count({ where: { id } })) > 0;
  }

  async existeCodigoEmpleado(codigo: string, exceptoId?: string): Promise<boolean> {
    const n = await prisma.personal.count({
      where: { codigo_empleado: codigo, ...(exceptoId ? { id: { not: exceptoId } } : {}) },
    });
    return n > 0;
  }

  async listarEspecialidades() {
    return prisma.especialidades.findMany({
      select: { id: true, nombre: true, descripcion: true },
      orderBy: { nombre: 'asc' },
    });
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
        data: { ...resto, perfil_id: cuenta?.perfilId ?? null, fecha_contratacion: fechaONull(fecha_contratacion) },
        include: personalCompleto,
      });
    });
  }

  /**
   * Actualiza el empleado y, si tiene cuenta, copia a `perfiles` el rol, el nombre, el teléfono y el estado
   * (desactivar al empleado bloquea su login con 403 CUENTA_INACTIVA).
   */
  async actualizar(id: string, cambios: CambiosPersonal): Promise<PersonalCompleto> {
    const { rol, fecha_contratacion, ...resto } = cambios;
    return prisma.$transaction(async (tx) => {
      const personal = await tx.personal.update({
        where: { id },
        data: { ...resto, fecha_contratacion: fechaONull(fecha_contratacion) },
        include: personalCompleto,
      });
      const { nombres, apellidos, telefono, activo } = cambios;
      const cuenta = { rol, nombres, apellidos, telefono, activo };
      if (personal.perfil_id && Object.values(cuenta).some((v) => v !== undefined)) {
        await tx.perfiles.update({ where: { id: personal.perfil_id }, data: { ...cuenta, updated_at: new Date() } });
        return tx.personal.findUniqueOrThrow({ where: { id }, include: personalCompleto });
      }
      return personal;
    });
  }
}
