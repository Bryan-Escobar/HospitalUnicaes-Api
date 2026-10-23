import pino from 'pino';
import { envs } from './envs';

// Logger único de la app. En desarrollo imprime legible (pino-pretty); en producción, JSON.
// Nunca registrar datos privados de pacientes (context.md §3.4).
export const logger = pino({
  level: envs.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  ...(envs.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
});
