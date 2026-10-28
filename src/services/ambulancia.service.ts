import { randomBytes } from 'node:crypto';
import {
  AmbulanciaSchema,
  BitacoraAmbulanciaSchema,
  SeguimientoSolicitudPublicaSchema,
  SolicitudAmbulanciaSchema,
} from '../domain/dtos/ambulancia.dto';
import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import {
  ActualizarSolicitudBody,
  ActualizarSolicitudPublicaBody,
  BitacoraQuery,
  CambiarEstadoAmbulanciaBody,
  CancelarSolicitudBody,
  CerrarSolicitudBody,
  CrearSolicitudBody,
  CrearSolicitudPublicaBody,
  ListarSolicitudesQuery,
} from '../domain/validators/ambulancia.validator';
import { paginacion, rangoDePagina } from '../lib/paginacion';
import { z } from '../lib/zod';
import {
  AmbulanciaRepository,
  BitacoraCompleta,
  FiltroSolicitudes,
  SolicitudCompleta,
} from '../repositories/ambulancia.repository';
import { toPersona } from './consultas.acceso';

type SolicitudDto = z.infer<typeof SolicitudAmbulanciaSchema>;
type SeguimientoDto = z.infer<typeof SeguimientoSolicitudPublicaSchema>;

/** Solicitudes públicas pendientes a la vez; más allá, 429 (freno a bromas o ataques al botón del login). */
export const MAX_PENDIENTES_PUBLICAS = 5;

const inicioDelDia = (fecha: string) => new Date(`${fecha}T00:00:00-06:00`);
const DIA_MS = 24 * 60 * 60 * 1000;
const rango = (desde?: string, hasta?: string) => ({
  desde: desde ? inicioDelDia(desde) : undefined,
  hastaExclusivo: hasta ? new Date(inicioDelDia(hasta).getTime() + DIA_MS) : undefined,
});

const esDelPaciente = (s: SolicitudCompleta, usuario: UsuarioAutenticado) =>
  s.solicitada_por === usuario.id || s.pacientes?.perfil_id === usuario.id;

/**
 * Ambulancia (HUNI-70). Una sola ambulancia: disponible ⇄ en_servicio ⇄ (cierre/cancelación) y
 * disponible ⇄ en_mantenimiento (administrador).
 * - Piden ambulancia: paciente (a su nombre, una abierta a la vez), recepción y doctor desde la app,
 *   y cualquiera sin cuenta desde el botón del login (solo con su ubicación; sigue con un código).
 * - Recepción completa los datos, despacha, marca en curso, cierra y cancela (también una despachada).
 *   La BD bloquea la fila de la ambulancia: dos despachos simultáneos → solo uno gana (AMBULANCIA_NO_DISPONIBLE).
 * - Ven las solicitudes el personal; el paciente solo las suyas. La bitácora: administración, recepción y doctores.
 */
export class AmbulanciaService {
  constructor(private readonly ambulanciaRepository = new AmbulanciaRepository()) {}

  async estado(usuario: UsuarioAutenticado): Promise<z.infer<typeof AmbulanciaSchema>> {
    const ambulancia = await this.ambulanciaRepository.findAmbulancia();
    if (!ambulancia) throw CustomError.notFound('No hay ambulancia registrada');
    const activa = ambulancia.solicitudes_ambulancia[0];
    // Un paciente no ve hacia dónde va la ambulancia si el servicio no es suyo (§3.4).
    const visible = activa && (usuario.rol !== 'paciente' || esDelPaciente(activa, usuario));
    return {
      id: ambulancia.id,
      placa: ambulancia.placa,
      estado: ambulancia.estado,
      ubicacion_actual: ambulancia.ubicacion_actual,
      updated_at: ambulancia.updated_at.toISOString(),
      solicitud_activa: visible
        ? {
            id: activa.id,
            prioridad: activa.prioridad,
            estado: activa.estado,
            tipo_emergencia: activa.tipo_emergencia,
            direccion_origen: activa.direccion_origen,
            latitud: numero(activa.latitud),
            longitud: numero(activa.longitud),
            fecha_despacho: activa.fecha_despacho?.toISOString() ?? null,
          }
        : null,
    };
  }

  async cambiarEstado(body: CambiarEstadoAmbulanciaBody, usuario: UsuarioAutenticado) {
    await this.ambulanciaRepository.cambiarEstado(body.estado, body.descripcion, usuario.id);
    return this.estado(usuario);
  }

  async crear(body: CrearSolicitudBody, usuario: UsuarioAutenticado): Promise<SolicitudDto> {
    let pacienteId = body.paciente_id ?? null;
    if (usuario.rol === 'paciente') {
      pacienteId = await this.ambulanciaRepository.findPacienteIdDePerfil(usuario.id);
      if (!pacienteId) throw CustomError.fromCode('PERFIL_INCOMPLETO');
      if (await this.ambulanciaRepository.tieneSolicitudAbierta(usuario.id)) {
        throw CustomError.fromCode('LIMITE_SOLICITUDES', 'Ya tienes una solicitud de ambulancia en curso');
      }
    }
    const solicitud = await this.ambulanciaRepository.crearSolicitud({
      ...datosDeUbicacion(body),
      canal: 'app',
      solicitada_por: usuario.id,
      paciente_id: pacienteId,
      destino: body.destino,
      tipo_emergencia: body.tipo_emergencia,
      prioridad: body.prioridad,
    });
    return toSolicitud(solicitud);
  }

  async crearPublica(body: CrearSolicitudPublicaBody): Promise<SeguimientoDto> {
    if ((await this.ambulanciaRepository.contarPendientesPublicas()) >= MAX_PENDIENTES_PUBLICAS) {
      throw CustomError.fromCode(
        'LIMITE_SOLICITUDES',
        'Hay demasiadas solicitudes en espera; recepción ya las atiende',
      );
    }
    const solicitud = await this.ambulanciaRepository.crearSolicitud({
      ...datosDeUbicacion(body),
      canal: 'publico',
      codigo_seguimiento: randomBytes(18).toString('base64url'),
    });
    return toSeguimiento(solicitud);
  }

  async seguimiento(codigo: string): Promise<SeguimientoDto> {
    return toSeguimiento(await this.porCodigo(codigo));
  }

  async actualizarPublica(codigo: string, body: ActualizarSolicitudPublicaBody): Promise<SeguimientoDto> {
    const solicitud = await this.porCodigo(codigo);
    if (!(await this.ambulanciaRepository.actualizarAbierta(solicitud.id, body))) {
      throw CustomError.fromCode('SOLICITUD_CERRADA');
    }
    return this.seguimiento(codigo);
  }

  /** Quien la pidió sin cuenta puede cancelarla mientras no esté cerrada (aunque ya vaya en camino). */
  async cancelarPublica(codigo: string, body: CancelarSolicitudBody): Promise<SeguimientoDto> {
    const solicitud = await this.porCodigo(codigo);
    await this.ambulanciaRepository.cancelar(solicitud.id, body.motivo || 'Cancelada por quien la pidió', null, true);
    return this.seguimiento(codigo);
  }

  async listar(query: ListarSolicitudesQuery, usuario: UsuarioAutenticado) {
    const { pagina, por_pagina, estado, prioridad, tipo_emergencia, canal, desde, hasta } = query;
    const filtro: FiltroSolicitudes = {
      estado,
      prioridad,
      tipoEmergencia: tipo_emergencia,
      canal,
      ...rango(desde, hasta),
    };
    if (usuario.rol === 'paciente') filtro.perfilPaciente = usuario.id;

    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const [items, total] = await this.ambulanciaRepository.listarSolicitudes(filtro, skip, take);
    return { items: items.map(toSolicitud), paginacion: paginacion(pagina, por_pagina, total) };
  }

  async obtener(id: string, usuario: UsuarioAutenticado): Promise<SolicitudDto> {
    const solicitud = await this.ambulanciaRepository.findSolicitud(id);
    if (usuario.rol === 'paciente' && (!solicitud || !esDelPaciente(solicitud, usuario))) {
      // Un paciente no puede averiguar qué ids existen.
      throw CustomError.forbidden('Solo puedes ver tus propias solicitudes');
    }
    if (!solicitud) throw CustomError.notFound('La solicitud no existe');
    return toSolicitud(solicitud);
  }

  /** Recepción completa los datos que faltan (paciente, tipo, destino...) mientras la solicitud siga abierta. */
  async actualizar(id: string, body: ActualizarSolicitudBody): Promise<SolicitudDto> {
    await this.existente(id);
    if (!(await this.ambulanciaRepository.actualizarAbierta(id, body))) throw CustomError.fromCode('SOLICITUD_CERRADA');
    return this.detalle(id);
  }

  async despachar(id: string, usuario: UsuarioAutenticado): Promise<SolicitudDto> {
    await this.ambulanciaRepository.despachar(id, usuario.id);
    return this.detalle(id);
  }

  async marcarEnCurso(id: string): Promise<SolicitudDto> {
    await this.ambulanciaRepository.marcarEnCurso(id);
    return this.detalle(id);
  }

  async cerrar(id: string, body: CerrarSolicitudBody, usuario: UsuarioAutenticado): Promise<SolicitudDto> {
    await this.ambulanciaRepository.cerrar(id, body.descripcion, usuario.id);
    return this.detalle(id);
  }

  /**
   * Una pendiente: recepción, administración o el propio paciente. Una despachada o en curso (falsa alarma):
   * solo recepción o administración, con motivo; la ambulancia vuelve a disponible.
   */
  async cancelar(id: string, body: CancelarSolicitudBody, usuario: UsuarioAutenticado): Promise<SolicitudDto> {
    const solicitud = await this.ambulanciaRepository.findSolicitud(id);
    if (usuario.rol === 'paciente') {
      if (!solicitud || !esDelPaciente(solicitud, usuario)) {
        throw CustomError.forbidden('Solo puedes cancelar tus propias solicitudes');
      }
      await this.ambulanciaRepository.cancelar(id, body.motivo, usuario.id, false);
      return this.detalle(id);
    }
    if (!solicitud) throw CustomError.notFound('La solicitud no existe');
    if ((solicitud.estado === 'despachada' || solicitud.estado === 'en_curso') && !body.motivo) {
      throw CustomError.badRequest('Indica el motivo para cancelar un servicio ya despachado', 'VALIDACION');
    }
    await this.ambulanciaRepository.cancelar(id, body.motivo, usuario.id, true);
    return this.detalle(id);
  }

  async bitacora(query: BitacoraQuery) {
    const { pagina, por_pagina, estado, prioridad, tipo_emergencia, desde, hasta } = query;
    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const [items, total] = await this.ambulanciaRepository.listarBitacora(
      { estado, prioridad, tipoEmergencia: tipo_emergencia, ...rango(desde, hasta) },
      skip,
      take,
    );
    return { items: items.map(toBitacora), paginacion: paginacion(pagina, por_pagina, total) };
  }

  private async porCodigo(codigo: string): Promise<SolicitudCompleta> {
    const solicitud = await this.ambulanciaRepository.findPorCodigo(codigo);
    if (!solicitud) throw CustomError.notFound('No hay una solicitud con ese código');
    return solicitud;
  }

  private async existente(id: string): Promise<SolicitudCompleta> {
    const solicitud = await this.ambulanciaRepository.findSolicitud(id);
    if (!solicitud) throw CustomError.notFound('La solicitud no existe');
    return solicitud;
  }

  private async detalle(id: string): Promise<SolicitudDto> {
    return toSolicitud(await this.existente(id));
  }
}

const numero = (d: { toNumber(): number } | null) => (d === null ? null : d.toNumber());

const datosDeUbicacion = (b: CrearSolicitudPublicaBody) => ({
  direccion_origen: b.direccion_origen,
  latitud: b.latitud,
  longitud: b.longitud,
  precision_m: b.precision_m,
  descripcion_emergencia: b.descripcion_emergencia,
  telefono_contacto: b.telefono_contacto,
  nombre_contacto: b.nombre_contacto,
});

const fecha = (d: Date | null) => d?.toISOString() ?? null;

export const toSolicitud = (s: SolicitudCompleta): SolicitudDto => ({
  id: s.id,
  ambulancia_id: s.ambulancia_id,
  canal: s.canal,
  solicitada_por: s.perfiles ? { ...toPersona(s.perfiles), rol: s.perfiles.rol } : null,
  paciente: s.pacientes ? toPersona(s.pacientes) : null,
  direccion_origen: s.direccion_origen,
  latitud: numero(s.latitud),
  longitud: numero(s.longitud),
  precision_m: s.precision_m,
  destino: s.destino,
  descripcion_emergencia: s.descripcion_emergencia,
  tipo_emergencia: s.tipo_emergencia,
  prioridad: s.prioridad,
  estado: s.estado,
  telefono_contacto: s.telefono_contacto,
  nombre_contacto: s.nombre_contacto,
  fecha_solicitud: s.fecha_solicitud.toISOString(),
  fecha_despacho: fecha(s.fecha_despacho),
  fecha_en_curso: fecha(s.fecha_en_curso),
  fecha_cierre: fecha(s.fecha_cierre),
  notas_cierre: s.notas_cierre,
  motivo_cancelacion: s.motivo_cancelacion,
});

const toSeguimiento = (s: SolicitudCompleta): SeguimientoDto => ({
  codigo_seguimiento: s.codigo_seguimiento ?? '',
  estado: s.estado,
  tiene_contacto: Boolean(s.telefono_contacto),
  fecha_solicitud: s.fecha_solicitud.toISOString(),
  fecha_despacho: fecha(s.fecha_despacho),
  fecha_en_curso: fecha(s.fecha_en_curso),
  fecha_cierre: fecha(s.fecha_cierre),
});

const toBitacora = (b: BitacoraCompleta): z.infer<typeof BitacoraAmbulanciaSchema> => {
  const s = b.solicitudes_ambulancia;
  return {
    id: b.id,
    estado_anterior: b.estado_anterior,
    estado_nuevo: b.estado_nuevo,
    descripcion: b.descripcion,
    registrado_por: b.perfiles ? toPersona(b.perfiles) : null,
    solicitud: s
      ? {
          id: s.id,
          canal: s.canal,
          estado: s.estado,
          paciente: s.pacientes ? toPersona(s.pacientes) : null,
          tipo_emergencia: s.tipo_emergencia,
          prioridad: s.prioridad,
          direccion_origen: s.direccion_origen,
          latitud: numero(s.latitud),
          longitud: numero(s.longitud),
          destino: s.destino,
          descripcion_emergencia: s.descripcion_emergencia,
          fecha_solicitud: s.fecha_solicitud.toISOString(),
          fecha_despacho: fecha(s.fecha_despacho),
          fecha_cierre: fecha(s.fecha_cierre),
        }
      : null,
    created_at: b.created_at.toISOString(),
  };
};
