import { z } from '../../lib/zod';
import { fechaHora, uuidOut } from './common.dto';

export const ProveedorSchema = z
  .object({
    id: uuidOut,
    nombre: z.string().openapi({ example: 'Distribuidora Médica Demo, S.A. de C.V.' }),
    nit: z.string().nullable().openapi({ example: '0614-010190-101-0' }),
    nrc: z.string().nullable().openapi({ example: '100001-1' }),
    contacto: z.string().nullable().openapi({ description: 'Persona de contacto', example: 'Sofía Alvarado' }),
    telefono: z.string().nullable().openapi({ example: '+503 2200-0001' }),
    email: z.string().nullable().openapi({ example: 'ventas@distribuidora-demo.test' }),
    direccion: z.string().nullable().openapi({ example: 'San Salvador' }),
    activo: z.boolean().openapi({ description: 'Desactivado no se usa en entradas ni en activos nuevos' }),
    created_at: fechaHora,
    updated_at: fechaHora,
  })
  .openapi('Proveedor');
