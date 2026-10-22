import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// zod extendido con `.openapi()` para documentar en Swagger.
// Validadores y documentación deben importar `z` desde aquí, no desde 'zod'.
extendZodWithOpenApi(z);

export { z };
