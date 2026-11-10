import { z } from '../../lib/zod';
import { booleanQuery, paginacionQuerySchema } from './common.validator';

const titulo = z.string().trim().min(1).max(150).openapi({ example: 'Jornada de vacunación' });
const contenido = z
  .string()
  .trim()
  .min(1)
  .max(5000)
  .openapi({ example: 'Este sábado de 8:00 a 12:00 en el vestíbulo principal. Trae tu tarjeta de vacunación.' });
const esPublico = z
  .boolean()
  .openapi({ description: '`true` (por defecto): aviso público. `false`: interno, solo lo ve el personal.' });
const fechaPublicacion = z.iso.datetime({ offset: true }).openapi({
  description: 'Desde cuándo se muestra. Por defecto, ahora. Una fecha futura deja el aviso programado.',
  example: '2026-11-10T08:00:00-06:00',
});
const fechaExpiracion = z.iso.datetime({ offset: true }).nullable().openapi({
  description: 'Hasta cuándo se muestra; `null` = no expira. Debe ser posterior a la fecha de publicación.',
  example: '2026-12-10T23:59:00-06:00',
});

const expiraDespues = (b: { fecha_publicacion?: string; fecha_expiracion?: string | null }) =>
  !b.fecha_publicacion || !b.fecha_expiracion || new Date(b.fecha_expiracion) > new Date(b.fecha_publicacion);
const mensajeExpiracion = {
  message: 'La fecha de expiración debe ser posterior a la de publicación',
  path: ['fecha_expiracion'],
};

export const crearAvisoBodySchema = z
  .object({
    titulo,
    contenido,
    es_publico: esPublico.default(true),
    fecha_publicacion: fechaPublicacion.optional(),
    fecha_expiracion: fechaExpiracion.optional(),
  })
  .refine(expiraDespues, mensajeExpiracion)
  .openapi('CrearAvisoBody');

export const actualizarAvisoBodySchema = z
  .object({
    titulo,
    contenido,
    es_publico: esPublico,
    fecha_publicacion: fechaPublicacion,
    fecha_expiracion: fechaExpiracion,
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Envía al menos un campo para actualizar' })
  .refine(expiraDespues, mensajeExpiracion)
  .openapi('ActualizarAvisoBody');

export const listarAvisosQuerySchema = paginacionQuerySchema
  .extend({
    vigencia: z
      .enum(['vigentes', 'programados', 'vencidos', 'todos'])
      .default('vigentes')
      .openapi({ description: 'Por defecto `vigentes`. Las demás opciones son solo para el administrador.' }),
    es_publico: booleanQuery.optional().openapi({
      description: '`true`: solo públicos; `false`: solo internos (el paciente solo puede pedir públicos).',
    }),
  })
  .openapi('ListarAvisosQuery');

export type CrearAvisoBody = z.infer<typeof crearAvisoBodySchema>;
export type ActualizarAvisoBody = z.infer<typeof actualizarAvisoBodySchema>;
export type ListarAvisosQuery = z.infer<typeof listarAvisosQuerySchema>;
