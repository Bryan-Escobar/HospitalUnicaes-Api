import { z } from 'zod';

export const echoBodySchema = z.object({
  message: z.string().min(1, 'El mensaje no puede estar vacío'),
});

export type EchoBody = z.infer<typeof echoBodySchema>;
