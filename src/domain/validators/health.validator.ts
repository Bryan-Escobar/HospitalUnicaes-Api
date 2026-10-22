import { z } from '../../lib/zod';

export const echoBodySchema = z
  .object({
    message: z.string().min(1, 'El mensaje no puede estar vacío'),
  })
  .openapi('EchoBody', { example: { message: 'hola' } });

export type EchoBody = z.infer<typeof echoBodySchema>;
