/** Fechas en la zona del hospital (America/El_Salvador, UTC−6 sin horario de verano). */
const DIA_MS = 24 * 60 * 60 * 1000;

/** Inicio del día local de una fecha `AAAA-MM-DD`. */
export const inicioDelDia = (fecha: string) => new Date(`${fecha}T00:00:00-06:00`);

/** Rango [desde, hasta + 1 día) para filtros inclusivos por fecha local. */
export const rangoDeFechas = (desde?: string, hasta?: string) => ({
  desde: desde ? inicioDelDia(desde) : undefined,
  hastaExclusivo: hasta ? new Date(inicioDelDia(hasta).getTime() + DIA_MS) : undefined,
});

/** Columna `date` de Postgres (Prisma la entrega a medianoche UTC) ↔ `AAAA-MM-DD`. */
export const aFechaDb = (fecha: string) => new Date(`${fecha}T00:00:00Z`);
export const deFechaDb = (fecha: Date) => fecha.toISOString().slice(0, 10);

/** Fecha de hoy en El Salvador (`AAAA-MM-DD`). */
export const hoyLocal = (ahora = new Date()) => deFechaDb(new Date(ahora.getTime() - 6 * 60 * 60 * 1000));
