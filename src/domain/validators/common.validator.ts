import { z } from '../../lib/zod';

export const EJEMPLO_UUID = '3f1c2a9e-7b4d-4c1e-9f0a-2d6b8e5c1a7f';

export const idParamSchema = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' }, example: EJEMPLO_UUID }),
});

export const paginacionQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1).openapi({ description: 'Página (desde 1)', example: 1 }),
  por_pagina: z.coerce.number().int().min(1).max(100).default(20).openapi({ description: 'Máximo 100', example: 20 }),
});

export const rangoFechasQuerySchema = z.object({
  desde: z.iso
    .date()
    .optional()
    .openapi({ description: 'Fecha inicial inclusive (AAAA-MM-DD)', example: '2026-11-01' }),
  hasta: z.iso.date().optional().openapi({ description: 'Fecha final inclusive (AAAA-MM-DD)', example: '2026-11-30' }),
});

// "true"/"false" en query → boolean (z.coerce.boolean convertiría "false" en true)
export const booleanQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

// Contraseña con la misma política que Supabase Auth (supabase/config.toml)
export const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[a-z]/, 'Debe tener al menos una minúscula')
  .regex(/[A-Z]/, 'Debe tener al menos una mayúscula')
  .regex(/\d/, 'Debe tener al menos un dígito')
  .openapi({ format: 'password', example: 'Hospital2026' });

export const telefonoSchema = z.string().min(8).max(20).openapi({ example: '+503 7000-0000' });
