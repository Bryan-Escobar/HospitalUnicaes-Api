import { prisma } from '../config/prisma';

/** JSON que devuelve la función `public.estado_publico()` (migración de HUNI-74). */
export interface FilaEstadoPublico {
  ocupacion: Record<'vip' | 'semiprivada' | 'total', { ocupadas: number; disponibles: number; total: number }>;
  medicos_de_turno: {
    nombres: string;
    apellidos: string;
    tipo: string;
    especialidad: string | null;
    area: string;
    hora_inicio: string;
    hora_fin: string;
  }[];
  avisos: {
    id: string;
    titulo: string;
    contenido: string;
    fecha_publicacion: string;
    fecha_expiracion: string | null;
  }[];
  actualizado_en: string;
}

export class PublicoRepository {
  // La función ya filtra todo lo privado: solo cantidades, médicos de turno y avisos públicos vigentes.
  async obtenerEstado(): Promise<FilaEstadoPublico | null> {
    const filas = await prisma.$queryRaw<{ estado: FilaEstadoPublico }[]>`select public.estado_publico() as estado`;
    return filas[0]?.estado ?? null;
  }
}
