import { z } from '../../lib/zod';
import { fechaHora, PersonaResumenSchema, uuidOut } from './common.dto';

export const VIGENCIAS_AVISO = ['vigente', 'programado', 'vencido'] as const;
export const VigenciaAvisoSchema = z.enum(VIGENCIAS_AVISO).openapi('VigenciaAviso', {
  description:
    '`vigente`: ya se publicó y no ha expirado · `programado`: su fecha de publicación es futura · ' +
    '`vencido`: ya pasó su fecha de expiración.',
});

export const AvisoSchema = z
  .object({
    id: uuidOut,
    titulo: z.string().openapi({ example: 'Jornada de vacunación' }),
    contenido: z.string().openapi({ example: 'Este sábado de 8:00 a 12:00 en el vestíbulo principal.' }),
    es_publico: z.boolean().openapi({
      description: '`true`: lo ve cualquiera, incluso sin sesión. `false`: aviso interno, solo el personal.',
    }),
    fecha_publicacion: fechaHora,
    fecha_expiracion: fechaHora.nullable().openapi({ description: '`null`: no expira' }),
    vigencia: VigenciaAvisoSchema,
    autor: PersonaResumenSchema.openapi({ description: 'Cuenta que lo publicó' }),
  })
  .openapi('Aviso');

export const AvisoEliminadoSchema = z.object({ id: uuidOut }).openapi('AvisoEliminado');
