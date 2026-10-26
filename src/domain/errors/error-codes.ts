/**
 * Catálogo de códigos de error de la API (campo `code` de las respuestas de error).
 *
 * - `statusCode` (HTTP) dice la categoría; `code` dice la causa exacta.
 * - Los clientes deben decidir con `code`, nunca comparando el texto de `message`.
 * - Un código publicado no se renombra ni se borra: si cambia la regla, se agrega uno nuevo.
 * - Se documenta solo en /docs (ApiError.code) a partir de este objeto.
 */
export const ERROR_CODES = {
  // Genéricos
  VALIDACION: { status: 400, descripcion: 'Uno o más campos no pasaron la validación; ver `errors`.' },
  JSON_INVALIDO: { status: 400, descripcion: 'El cuerpo de la petición no es un JSON válido.' },
  SOLICITUD_INVALIDA: { status: 400, descripcion: 'La petición no tiene sentido en su forma actual.' },
  REFERENCIA_INVALIDA: { status: 400, descripcion: 'Un id enviado apunta a un registro que no existe.' },
  NO_AUTENTICADO: { status: 401, descripcion: 'Falta el token Bearer, es inválido o expiró.' },
  ACCESO_DENEGADO: {
    status: 403,
    descripcion: 'El rol no tiene permiso, o el recurso es de un paciente que no le corresponde.',
  },
  NO_ENCONTRADO: { status: 404, descripcion: 'El recurso solicitado no existe.' },
  RUTA_NO_ENCONTRADA: { status: 404, descripcion: 'La ruta o el método HTTP no existen.' },
  CONFLICTO: { status: 409, descripcion: 'La operación choca con el estado actual de los datos.' },
  REGISTRO_DUPLICADO: { status: 409, descripcion: 'Ya existe un registro con ese valor único.' },
  REGLA_DE_NEGOCIO: { status: 422, descripcion: 'La operación viola una regla de negocio.' },
  ERROR_INTERNO: { status: 500, descripcion: 'Error inesperado del servidor (sin detalles por seguridad).' },

  // Autenticación y usuarios
  EMAIL_EN_USO: { status: 409, descripcion: 'Ya existe una cuenta con ese correo.' },
  PERFIL_INCOMPLETO: {
    status: 403,
    descripcion: 'La cuenta existe pero no tiene paciente ni personal asociado.',
  },
  CUENTA_INACTIVA: { status: 403, descripcion: 'La cuenta está desactivada; contacta a la administración.' },

  // Habitaciones y camas (HUNI-66)
  CAMA_OCUPADA: { status: 409, descripcion: 'La cama ya tiene un paciente activo.' },
  CAMA_NO_DISPONIBLE: { status: 409, descripcion: 'La cama está en limpieza o mantenimiento.' },
  PACIENTE_YA_HOSPITALIZADO: { status: 409, descripcion: 'El paciente ya ocupa otra cama.' },
  SIN_CAMAS_DISPONIBLES: { status: 409, descripcion: 'No hay camas libres del tipo solicitado.' },
  HOSPITALIZACION_FINALIZADA: { status: 409, descripcion: 'La hospitalización ya tiene alta.' },

  // Turnos y citas (HUNI-51). Los lanza la BD: también llegan a los clientes que usan Supabase directo.
  TURNO_SOLAPADO: { status: 409, descripcion: 'El empleado ya tiene otro turno que se cruza con ese horario.' },
  CITA_DUPLICADA: {
    status: 409,
    descripcion: 'El doctor o el paciente ya tiene otra cita activa que se cruza con ese horario.',
  },
  CITA_FUERA_DE_TURNO: {
    status: 422,
    descripcion: 'El doctor no está de turno durante toda la cita (inicio y fin).',
  },

  // Consultas (HUNI-57)
  CONSULTA_CERRADA: { status: 409, descripcion: 'La consulta ya está cerrada y no se puede modificar.' },

  // Laboratorio (HUNI-62) y citas (HUNI-51)
  TRANSICION_INVALIDA: {
    status: 422,
    descripcion:
      'Cambio de estado no permitido (laboratorio: pendiente → en_proceso → completado; ' +
      'citas: solo cambian mientras están programadas o confirmadas).',
  },
  RESULTADO_REQUERIDO: { status: 422, descripcion: 'Para completar un examen hay que registrar su resultado.' },

  // Ambulancia (HUNI-70)
  AMBULANCIA_NO_DISPONIBLE: {
    status: 409,
    descripcion: 'La ambulancia no está disponible (en servicio o en mantenimiento).',
  },
  AMBULANCIA_EN_SERVICIO: {
    status: 422,
    descripcion: 'No se puede pasar a mantenimiento sin cerrar antes el servicio en curso.',
  },

  // Inventario: lotes, activos y proveedores (HUNI-97)
  TIPO_CONTROL_INVALIDO: {
    status: 422,
    descripcion: 'Los equipos se controlan por número de serie y los medicamentos/insumos por lote.',
  },
  LOTE_VENCIDO: {
    status: 422,
    descripcion: 'El lote ya venció: no admite entradas ni salidas, solo un ajuste para descartarlo.',
  },
  LOTE_CADUCIDAD_DISTINTA: {
    status: 409,
    descripcion: 'Ese número de lote ya existe con otra fecha de caducidad.',
  },
  STOCK_INSUFICIENTE: { status: 409, descripcion: 'El lote no tiene unidades suficientes para la salida.' },
  PROVEEDOR_INVALIDO: { status: 422, descripcion: 'La entrada o el activo necesita un proveedor activo.' },
  ACTIVO_DADO_DE_BAJA: { status: 409, descripcion: 'El activo está dado de baja y ya no se puede modificar.' },
} as const satisfies Record<string, { status: number; descripcion: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;

export const ERROR_CODE_LIST = Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]];

// Código por defecto cuando solo se conoce el status HTTP.
export const DEFAULT_CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'SOLICITUD_INVALIDA',
  401: 'NO_AUTENTICADO',
  403: 'ACCESO_DENEGADO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  422: 'REGLA_DE_NEGOCIO',
  500: 'ERROR_INTERNO',
};
