import { AvisoSchema } from '../domain/dtos/avisos.dto';
import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import { ActualizarAvisoBody, CrearAvisoBody, ListarAvisosQuery } from '../domain/validators/avisos.validator';
import { paginacion, rangoDePagina } from '../lib/paginacion';
import { z } from '../lib/zod';
import { AvisoConAutor, AvisosRepository, DatosAviso } from '../repositories/avisos.repository';

export type Aviso = z.infer<typeof AvisoSchema>;

/**
 * Avisos generales (HUNI-74, para la Web de HUNI-77). Mismas reglas que el RLS de `avisos`:
 * - Públicos y vigentes: cualquiera, incluso sin sesión (además salen en GET /api/publico/estado).
 * - Internos (es_publico = false) vigentes: solo el personal (administrador, doctor y recepción).
 * - Programados y vencidos, y crear, editar o borrar: solo el administrador.
 */
export class AvisosService {
  constructor(private readonly avisosRepository = new AvisosRepository()) {}

  async listar(query: ListarAvisosQuery, usuario: UsuarioAutenticado) {
    const { pagina, por_pagina, vigencia, es_publico } = query;
    if (vigencia !== 'vigentes' && usuario.rol !== 'administrador') {
      throw CustomError.forbidden('Solo la administración ve avisos programados o vencidos');
    }
    if (usuario.rol === 'paciente' && es_publico === false) {
      throw CustomError.forbidden('Los avisos internos son solo para el personal');
    }

    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const ahora = new Date();
    const [items, total] = await this.avisosRepository.listar(
      { vigencia, ahora, es_publico: usuario.rol === 'paciente' ? true : es_publico },
      skip,
      take,
    );
    return { items: items.map((a) => toAviso(a, ahora)), paginacion: paginacion(pagina, por_pagina, total) };
  }

  async obtener(id: string, usuario: UsuarioAutenticado): Promise<Aviso> {
    const aviso = await this.avisosRepository.findById(id);
    const ahora = new Date();
    // Un aviso que la sesión no puede ver responde igual que uno que no existe.
    if (!aviso || !puedeVer(aviso, usuario, ahora)) throw CustomError.notFound('El aviso no existe');
    return toAviso(aviso, ahora);
  }

  async crear(body: CrearAvisoBody, usuario: UsuarioAutenticado): Promise<Aviso> {
    const datos = aDatos(body);
    const publicacion = datos.fecha_publicacion ?? new Date();
    validarFechas(publicacion, datos.fecha_expiracion ?? null);
    const aviso = await this.avisosRepository.crear(usuario.id, {
      ...datos,
      titulo: body.titulo,
      contenido: body.contenido,
      fecha_publicacion: publicacion,
    });
    return toAviso(aviso, new Date());
  }

  async actualizar(id: string, body: ActualizarAvisoBody): Promise<Aviso> {
    const actual = await this.avisosRepository.findById(id);
    if (!actual) throw CustomError.notFound('El aviso no existe');

    const datos = aDatos(body);
    validarFechas(
      datos.fecha_publicacion ?? actual.fecha_publicacion,
      datos.fecha_expiracion === undefined ? actual.fecha_expiracion : datos.fecha_expiracion,
    );
    return toAviso(await this.avisosRepository.actualizar(id, datos), new Date());
  }

  async eliminar(id: string): Promise<{ id: string }> {
    if (!(await this.avisosRepository.findById(id))) throw CustomError.notFound('El aviso no existe');
    await this.avisosRepository.eliminar(id);
    return { id };
  }
}

const vigencia = (a: Pick<AvisoConAutor, 'fecha_publicacion' | 'fecha_expiracion'>, ahora: Date) => {
  if (a.fecha_publicacion > ahora) return 'programado' as const;
  if (a.fecha_expiracion && a.fecha_expiracion <= ahora) return 'vencido' as const;
  return 'vigente' as const;
};

const puedeVer = (a: AvisoConAutor, usuario: UsuarioAutenticado, ahora: Date) => {
  if (usuario.rol === 'administrador') return true;
  if (vigencia(a, ahora) !== 'vigente') return false;
  return a.es_publico || usuario.rol !== 'paciente';
};

const validarFechas = (publicacion: Date, expiracion: Date | null) => {
  if (expiracion && expiracion <= publicacion) {
    throw CustomError.unprocessable('La fecha de expiración debe ser posterior a la de publicación');
  }
};

const aDatos = (body: Partial<CrearAvisoBody>): DatosAviso => ({
  titulo: body.titulo,
  contenido: body.contenido,
  es_publico: body.es_publico,
  fecha_publicacion: body.fecha_publicacion ? new Date(body.fecha_publicacion) : undefined,
  fecha_expiracion:
    body.fecha_expiracion === undefined
      ? undefined
      : body.fecha_expiracion === null
        ? null
        : new Date(body.fecha_expiracion),
});

export const toAviso = (a: AvisoConAutor, ahora: Date): Aviso => ({
  id: a.id,
  titulo: a.titulo,
  contenido: a.contenido,
  es_publico: a.es_publico,
  fecha_publicacion: a.fecha_publicacion.toISOString(),
  fecha_expiracion: a.fecha_expiracion?.toISOString() ?? null,
  vigencia: vigencia(a, ahora),
  autor: { id: a.perfiles.id, nombres: a.perfiles.nombres, apellidos: a.perfiles.apellidos },
});
