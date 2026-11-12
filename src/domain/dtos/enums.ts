import { z } from '../../lib/zod';

// Espejo de los enums de PostgreSQL (supabase/migrations). Si cambia uno en la BD, cambiarlo aquí.

export const ROLES = ['administrador', 'doctor', 'recepcionista', 'paciente'] as const;
export type Rol = (typeof ROLES)[number];

export const RolSchema = z.enum(ROLES).openapi('Rol', {
  description: 'Rol del usuario (HUNI-95). `recepcionista` = Recepcionista/Asistente, incluye enfermeros.',
});

export const SexoSchema = z.enum(['masculino', 'femenino', 'otro']).openapi('Sexo');

export const TipoHabitacionSchema = z
  .enum(['vip', 'semiprivada'])
  .openapi('TipoHabitacion', { description: '`vip`: 3ª planta, 1 cama. `semiprivada`: 2ª planta, 2 camas.' });

export const EstadoCamaSchema = z.enum(['disponible', 'ocupada', 'limpieza', 'mantenimiento']).openapi('EstadoCama');

export const EstadoHospitalizacionSchema = z.enum(['activa', 'alta']).openapi('EstadoHospitalizacion');

export const EstadoLaboratorioSchema = z
  .enum(['pendiente', 'en_proceso', 'completado'])
  .openapi('EstadoLaboratorio', { description: 'Solo avanza: pendiente → en_proceso → completado.' });

export const PrioridadSchema = z.enum(['normal', 'urgente', 'critica']).openapi('Prioridad');

export const TipoDiagnosticoSchema = z.enum(['principal', 'secundario']).openapi('TipoDiagnostico');

export const EstadoAmbulanciaSchema = z
  .enum(['disponible', 'en_servicio', 'en_mantenimiento'])
  .openapi('EstadoAmbulancia', {
    description: 'disponible ⇄ en_servicio (despacho/cierre) y disponible ⇄ en_mantenimiento (administrador).',
  });

export const EstadoSolicitudSchema = z
  .enum(['pendiente', 'despachada', 'en_curso', 'finalizada', 'cancelada'])
  .openapi('EstadoSolicitudAmbulancia', {
    description:
      'pendiente → despachada → en_curso → finalizada. Se cancela pendiente (o despachada/en curso si la cancela ' +
      'recepción, administración o el solicitante público).',
  });

export const TipoEmergenciaSchema = z
  .enum(['accidente', 'cardiaca', 'respiratoria', 'neurologica', 'obstetrica', 'intoxicacion', 'traslado', 'otra'])
  .openapi('TipoEmergencia');

export const CanalSolicitudSchema = z.enum(['app', 'publico']).openapi('CanalSolicitudAmbulancia', {
  description: '`app`: con sesión. `publico`: botón del login, sin cuenta (se sigue con el código de seguimiento).',
});

export const EstadoCitaSchema = z
  .enum(['programada', 'confirmada', 'atendida', 'cancelada', 'no_asistio'])
  .openapi('EstadoCita');

// Inventario (HUNI-97, HUNI-98)
export const CATEGORIAS_INVENTARIO = ['medicamento', 'insumo', 'equipo'] as const;
export const CategoriaInventarioSchema = z.enum(CATEGORIAS_INVENTARIO).openapi('CategoriaInventario', {
  description:
    '`medicamento` e `insumo` se controlan por lote (con caducidad); `equipo`, por número de serie (activos).',
});

export const TipoMovimientoSchema = z.enum(['entrada', 'salida', 'ajuste']).openapi('TipoMovimiento', {
  description: '`entrada` (con proveedor) y `salida` en unidades positivas; `ajuste` con signo (+ o −).',
});

export const ESTADOS_ACTIVO = ['disponible', 'en_uso', 'en_mantenimiento', 'dado_de_baja'] as const;
export const EstadoActivoSchema = z.enum(ESTADOS_ACTIVO).openapi('EstadoActivo', {
  description: '`dado_de_baja` es definitivo: después el activo ya no se modifica.',
});

export const AlertaCaducidadSchema = z.enum(['vencido', '15_dias', '30_dias']).openapi('AlertaCaducidad', {
  description: '`vencido`: ya pasó la fecha · `15_dias`: vence en 0 a 15 días · `30_dias`: vence en 16 a 30 días.',
});
