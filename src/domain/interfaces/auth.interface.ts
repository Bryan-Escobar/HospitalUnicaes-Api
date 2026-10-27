import { Rol } from '../dtos/enums';

/** Usuario de la sesión, cargado por el middleware `authenticate` desde `perfiles`. */
export interface UsuarioAutenticado {
  id: string;
  rol: Rol;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Solo existe en rutas protegidas con `authenticate`. */
    usuario?: UsuarioAutenticado;
  }
}
