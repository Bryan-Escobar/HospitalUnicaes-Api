import { Prisma } from '../../generated/prisma/client';

export interface DatosNuevoPaciente {
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

/** 'AAAA-MM-DD' → Date a medianoche UTC (columna `date`, sin desfase de zona horaria). */
export const aFecha = (valor: string) => new Date(`${valor}T00:00:00Z`);

/**
 * Crea el paciente y su expediente con el siguiente número `EXP-<año>-<00000>`, dentro de la transacción dada.
 * Lo usan el registro público (con cuenta) y el alta en recepción (sin cuenta).
 */
export const crearPacienteConExpediente = async (
  tx: Prisma.TransactionClient,
  datos: DatosNuevoPaciente,
  perfilId: string | null,
) => {
  const { alergias, fecha_nacimiento, ...paciente } = datos;
  const nuevo = await tx.pacientes.create({
    data: { ...paciente, perfil_id: perfilId, fecha_nacimiento: fecha_nacimiento ? aFecha(fecha_nacimiento) : null },
  });
  await tx.expedientes.create({
    data: { paciente_id: nuevo.id, numero_expediente: await siguienteNumeroExpediente(tx), alergias },
  });
  return nuevo;
};

/** Dos altas simultáneas pueden calcular el mismo número de expediente: se reintenta la transacción completa. */
export const conReintentoDeExpediente = async <T>(operacion: () => Promise<T>): Promise<T> => {
  for (let intento = 1; ; intento++) {
    try {
      return await operacion();
    } catch (error) {
      const choque =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String(error.meta?.target).includes('numero_expediente');
      if (!choque || intento >= 3) throw error;
    }
  }
};

const siguienteNumeroExpediente = async (tx: Prisma.TransactionClient): Promise<string> => {
  const prefijo = `EXP-${new Date().getUTCFullYear()}-`;
  const ultimo = await tx.expedientes.findFirst({
    where: { numero_expediente: { startsWith: prefijo } },
    orderBy: { numero_expediente: 'desc' },
    select: { numero_expediente: true },
  });
  const siguiente = (ultimo ? Number(ultimo.numero_expediente.slice(prefijo.length)) : 0) + 1;
  return `${prefijo}${String(siguiente).padStart(5, '0')}`;
};
