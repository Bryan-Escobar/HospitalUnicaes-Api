import { z } from '../../lib/zod';
import { booleanQuery, paginacionQuerySchema, telefonoSchema } from './common.validator';

const opcional = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

const datosProveedor = z.object({
  nombre: z.string().trim().min(1).max(150).openapi({ example: 'Farmacéutica Demo, S.A. de C.V.' }),
  nit: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{6}-\d{3}-\d$/, 'Formato de NIT: 0000-000000-000-0')
    .nullable()
    .optional()
    .openapi({ description: 'Único', example: '0614-030390-103-2' }),
  nrc: z
    .string()
    .trim()
    .regex(/^\d{1,7}-\d$/, 'Formato de NRC: 000000-0')
    .nullable()
    .optional()
    .openapi({ description: 'Único', example: '100003-3' }),
  contacto: opcional(100).openapi({ example: 'Marta Rivas' }),
  telefono: telefonoSchema.nullable().optional(),
  email: z.email().max(150).nullable().optional().openapi({ example: 'ventas@farmaceutica-demo.test' }),
  direccion: opcional(250).openapi({ example: 'Santa Ana' }),
});

export const crearProveedorBodySchema = datosProveedor.strict().openapi('CrearProveedorBody');

export const actualizarProveedorBodySchema = datosProveedor
  .extend({ activo: z.boolean().openapi({ description: '`true` reactiva un proveedor desactivado' }) })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Envía al menos un campo para actualizar' })
  .openapi('ActualizarProveedorBody');

export const listarProveedoresQuerySchema = paginacionQuerySchema
  .extend({
    buscar: z.string().trim().min(1).max(100).optional().openapi({ description: 'Nombre, NIT o NRC' }),
    activo: booleanQuery.optional().openapi({ description: 'Sin filtro: activos e inactivos' }),
  })
  .openapi('ListarProveedoresQuery');

export type CrearProveedorBody = z.infer<typeof crearProveedorBodySchema>;
export type ActualizarProveedorBody = z.infer<typeof actualizarProveedorBodySchema>;
export type ListarProveedoresQuery = z.infer<typeof listarProveedoresQuerySchema>;
