/**
 * Límite de peticiones por IP en memoria (ventana deslizante), para endpoints públicos sin sesión.
 *
 *   router.post('/', validateBody(schema), limitarPorIp({ maximo: 3, ventanaMs: 15 * 60_000 }), controller.crear);
 *
 * Responde 429 LIMITE_SOLICITUDES con `Retry-After`. Va después de la validación: solo cuentan las peticiones
 * válidas. La IP es `req.ip` (Traefik delante, ver `trust proxy` en server.ts). Vive en la memoria del proceso:
 * con una sola instancia de la API alcanza; con varias habría que moverlo a la BD o a Redis.
 */
import { NextFunction, Request, Response } from 'express';
import { CustomError } from '../../domain/errors/CustomError';
import { toErrorResponse } from '../../lib/errorHandler';

interface Opciones {
  maximo: number;
  ventanaMs: number;
  mensaje?: string;
}

export type LimitePorIp = ((req: Request, res: Response, next: NextFunction) => void) & {
  /** Borra los contadores (tests). */
  reiniciar: () => void;
};

export const limitarPorIp = ({ maximo, ventanaMs, mensaje }: Opciones): LimitePorIp => {
  const registros = new Map<string, number[]>();

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const ahora = Date.now();
    const ip = req.ip ?? 'desconocida';
    const recientes = (registros.get(ip) ?? []).filter((t) => ahora - t < ventanaMs);

    if (recientes.length >= maximo) {
      registros.set(ip, recientes);
      res.setHeader('Retry-After', Math.ceil((recientes[0] + ventanaMs - ahora) / 1000));
      const response = toErrorResponse(CustomError.fromCode('LIMITE_SOLICITUDES', mensaje));
      return res.status(response.statusCode).json(response);
    }

    recientes.push(ahora);
    registros.set(ip, recientes);
    // Limpieza: sin IPs viejas acumulándose en memoria.
    if (registros.size > 10_000) {
      for (const [clave, tiempos] of registros) {
        if (tiempos.every((t) => ahora - t >= ventanaMs)) registros.delete(clave);
      }
    }
    next();
  };

  return Object.assign(middleware, { reiniciar: () => registros.clear() });
};
