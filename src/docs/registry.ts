import { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';
import { ERROR_CODE_LIST, ERROR_CODES, ErrorCode } from '../domain/errors/error-codes';
import { Rol } from '../domain/dtos/enums';
import { z } from '../lib/zod';

/**
 * Registro único de la documentación OpenAPI (Swagger en /docs).
 * Cada módulo registra sus rutas en `src/docs/paths/<modulo>.docs.ts` con `registerEndpoint`,
 * reutilizando los schemas de `src/domain/validators` (entrada) y `src/domain/dtos` (salida).
 */
export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description:
    '`access_token` de la sesión de Supabase Auth. Se obtiene en el cliente con el SDK de Supabase ' +
    '(`signInWithPassword` y luego `getSession()`) y se envía como `Authorization: Bearer <token>`.',
});

// ---------- Errores ----------

const codeTable = ERROR_CODE_LIST.map((c) => `| \`${c}\` | ${ERROR_CODES[c].status} | ${ERROR_CODES[c].descripcion} |`);

export const ErrorCodeSchema = registry.register(
  'CodigoError',
  z.enum(ERROR_CODE_LIST).openapi({
    description: ['Causa exacta del error.', '', '| code | HTTP | Significado |', '|---|---|---|', ...codeTable].join(
      '\n',
    ),
    example: 'CAMA_OCUPADA',
  }),
);

const ValidationErrorSchema = z.object({
  field: z.string().openapi({ example: 'fecha_nacimiento' }),
  message: z.string().openapi({ example: 'Fecha inválida, usa AAAA-MM-DD' }),
});

export const ApiErrorSchema = registry.register(
  'ApiError',
  z
    .object({
      statusCode: z.number().int().openapi({ description: 'Código HTTP (categoría del error)', example: 409 }),
      success: z.literal(false),
      code: ErrorCodeSchema,
      message: z.string().openapi({
        description: 'Texto para mostrar al usuario. Puede cambiar: no compararlo en los clientes.',
        example: 'La cama HAB-201-A ya está ocupada',
      }),
      errors: z
        .array(ValidationErrorSchema)
        .optional()
        .openapi({ description: 'Detalle por campo. Solo cuando `code` es `VALIDACION`.' }),
    })
    .openapi({ description: 'Formato estándar de todas las respuestas de error.' }),
);

// ---------- Respuestas de éxito ----------

// Envoltura estándar `ApiResponse` con el `data` de cada endpoint.
export const apiResponse = <T extends z.ZodType>(data: T, status = 200, message = 'Operación exitosa') =>
  z.object({
    statusCode: z.number().int().openapi({ example: status }),
    success: z.literal(true),
    message: z.string().openapi({ example: message }),
    data,
  });

export const PaginacionSchema = registry.register(
  'Paginacion',
  z.object({
    pagina: z.number().int().openapi({ example: 1 }),
    por_pagina: z.number().int().openapi({ example: 20 }),
    total: z.number().int().openapi({ example: 57 }),
    total_paginas: z.number().int().openapi({ example: 3 }),
  }),
);

export const paginado = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), paginacion: PaginacionSchema });

// ---------- Helper para documentar endpoints ----------

type HttpError = 400 | 401 | 403 | 404 | 409 | 422;

const HTTP_TEXT: Record<HttpError, string> = {
  400: 'Petición inválida',
  401: 'No autenticado',
  403: 'Sin permiso',
  404: 'No encontrado',
  409: 'Conflicto con el estado actual',
  422: 'Regla de negocio no cumplida',
};

export interface EndpointDoc {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  tag: string;
  summary: string;
  description?: string;
  /** Roles con acceso, o 'publico' si no requiere token. */
  roles: Rol[] | 'publico';
  /** Ticket de Jira que lo implementa. */
  ticket: string;
  /** Si ya responde en la API o solo está en el contrato. */
  estado?: 'pendiente' | 'implementado';
  request?: RouteConfig['request'];
  response: { status?: 200 | 201; description: string; schema: z.ZodType };
  /** Códigos de error de negocio por status, además de los genéricos que se agregan solos. */
  errores?: Partial<Record<HttpError, ErrorCode[]>>;
}

export const registerEndpoint = (doc: EndpointDoc) => {
  const estado = doc.estado ?? 'pendiente';
  const publico = doc.roles === 'publico';

  // Errores genéricos que aplican según la forma del endpoint
  const errores = new Map<HttpError, Set<ErrorCode>>();
  const add = (status: HttpError, ...codes: ErrorCode[]) =>
    codes.forEach((c) => errores.set(status, (errores.get(status) ?? new Set()).add(c)));

  if (doc.request?.body || doc.request?.query || doc.request?.params) add(400, 'VALIDACION');
  if (doc.request?.body) add(400, 'JSON_INVALIDO');
  if (!publico) {
    add(401, 'NO_AUTENTICADO');
    add(403, 'ACCESO_DENEGADO');
  }
  if (doc.path.includes('{')) add(404, 'NO_ENCONTRADO');
  Object.entries(doc.errores ?? {}).forEach(([status, codes]) => add(Number(status) as HttpError, ...(codes ?? [])));

  const status = doc.response.status ?? 200;
  const responses: RouteConfig['responses'] = {
    [status]: {
      description: doc.response.description,
      content: {
        'application/json': { schema: apiResponse(doc.response.schema, status, doc.response.description) },
      },
    },
  };
  [...errores.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([status, codes]) => {
      responses[status] = {
        description: `${HTTP_TEXT[status]}. Códigos posibles: ${[...codes].map((c) => `\`${c}\``).join(', ')}`,
        content: { 'application/json': { schema: ApiErrorSchema } },
      };
    });

  const rolesTexto = publico ? 'público (sin token)' : (doc.roles as Rol[]).map((r) => `\`${r}\``).join(', ');
  const estadoTexto =
    estado === 'implementado'
      ? `**Estado:** implementado (${doc.ticket}).`
      : `**Estado:** pendiente de implementar en ${doc.ticket}. Hoy responde 404; usa este contrato para simularlo (mock).`;

  registry.registerPath({
    method: doc.method,
    path: doc.path,
    tags: [doc.tag],
    summary: estado === 'pendiente' ? `(pendiente) ${doc.summary}` : doc.summary,
    description: [doc.description, `**Roles:** ${rolesTexto}`, estadoTexto].filter(Boolean).join('\n\n'),
    security: publico ? [] : [{ bearerAuth: [] }],
    request: doc.request,
    responses,
    'x-roles': publico ? [] : doc.roles,
    'x-ticket': doc.ticket,
    'x-estado': estado,
  });
};

// Atajo para cuerpos JSON en `request.body`.
export const jsonBody = <T extends z.ZodType>(schema: T, description?: string) => ({
  description,
  required: true,
  content: { 'application/json': { schema } },
});
