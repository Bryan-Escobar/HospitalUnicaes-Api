import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '../lib/zod';

/**
 * Registro único de la documentación OpenAPI (Swagger en /docs).
 * Cada módulo registra sus rutas en `src/docs/paths/<entidad>.docs.ts`
 * reutilizando los esquemas zod de `src/domain/validators`.
 */
export const registry = new OpenAPIRegistry();

const ValidationErrorSchema = z.object({
  field: z.string().openapi({ example: 'message' }),
  message: z.string().openapi({ example: 'El mensaje no puede estar vacío' }),
});

// Envoltura estándar `ApiResponse` con el `data` de cada endpoint.
export const apiResponse = <T extends z.ZodType>(data: T) =>
  z.object({
    statusCode: z.number().int().openapi({ example: 200 }),
    success: z.boolean().openapi({ example: true }),
    message: z.string(),
    data,
  });

export const ApiErrorSchema = registry.register(
  'ApiError',
  z.object({
    statusCode: z.number().int().openapi({ example: 400 }),
    success: z.boolean().openapi({ example: false }),
    message: z.string().openapi({ example: 'Error de validación en el body de la petición' }),
    errors: z.array(ValidationErrorSchema).optional(),
  }),
);

export const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ApiErrorSchema } },
});
