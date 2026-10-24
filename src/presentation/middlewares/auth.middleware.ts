/**
 * Autenticación y RBAC (HUNI-38).
 *
 *   router.get('/', authenticate, requireRole('administrador', 'doctor'), controller.listar);
 *
 * - `authenticate`: exige `Authorization: Bearer <access_token de Supabase>` → 401 NO_AUTENTICADO si falta o
 *   es inválido; carga el rol desde `perfiles` en `req.usuario` → 403 CUENTA_INACTIVA si la cuenta está desactivada.
 * - `requireRole(...)`: 403 ACCESO_DENEGADO si el rol de la sesión no está en la lista.
 */
import { NextFunction, Request, Response } from 'express';
import { Rol } from '../../domain/dtos/enums';
import { CustomError } from '../../domain/errors/CustomError';
import { toErrorResponse } from '../../lib/errorHandler';
import { AuthService } from '../../services/auth.service';

const authService = new AuthService();

const responderError = (res: Response, error: unknown) => {
  const response = toErrorResponse(error);
  res.status(response.statusCode).json(response);
};

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return responderError(res, CustomError.unauthorized('Falta el token de sesión (Authorization: Bearer)'));

  try {
    req.usuario = await authService.autenticar(token);
    next();
  } catch (error) {
    responderError(res, error);
  }
};

export const requireRole =
  (...roles: Rol[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) return responderError(res, CustomError.unauthorized());
    if (!roles.includes(req.usuario.rol)) {
      return responderError(res, CustomError.forbidden('Tu rol no tiene permiso para esta operación'));
    }
    next();
  };
