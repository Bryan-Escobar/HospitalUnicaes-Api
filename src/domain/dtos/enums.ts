import { z } from '../../lib/zod';

// Espejo de los enums de PostgreSQL (supabase/migrations). Si cambia uno en la BD, cambiarlo aquí.

export const ROLES = ['administrador', 'doctor', 'recepcionista', 'paciente'] as const;
export type Rol = (typeof ROLES)[number];

export const RolSchema = z.enum(ROLES).openapi('Rol', {
  description: 'Rol del usuario (HUNI-95). `recepcionista` = Recepcionista/Asistente, incluye enfermeros.',
});

export const TipoPersonalSchema = z
  .enum(['doctor', 'enfermero', 'alergista', 'emergencista', 'asistente', 'recepcionista', 'administrativo'])
  .openapi('TipoPersonal', { description: 'Tipo de empleado. Se usa en turnos y filtros; no da permisos.' });

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
  .openapi('EstadoSolicitudAmbulancia');

export const EstadoCitaSchema = z
  .enum(['programada', 'confirmada', 'atendida', 'cancelada', 'no_asistio'])
  .openapi('EstadoCita');
