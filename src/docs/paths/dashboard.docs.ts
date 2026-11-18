import { EstadoPublicoSchema, ResumenDashboardSchema } from '../../domain/dtos/dashboard.dto';
import { ReportesSchema, reportesQuerySchema } from '../../domain/dtos/reportes.dto';
import { registerEndpoint } from '../registry';

registerEndpoint({
  method: 'get',
  path: '/api/dashboard/reportes',
  tag: 'Dashboard',
  summary: 'Reportes por rango de fechas',
  description:
    'Rango inclusivo en hora de El Salvador (hasta 366 días y sin fechas futuras). Ocupación por planta al cierre de cada día, ' +
    'con corte al momento de la consulta para hoy. Citas atendidas por fecha agendada, servicios de ambulancia finalizados ' +
    'por fecha de cierre agrupados en semanas que comienzan el lunes y órdenes de laboratorio por fecha de solicitud y estado actual.',
  roles: ['administrador'],
  ticket: 'HUNI-50',
  estado: 'implementado',
  request: { query: reportesQuerySchema },
  response: { description: 'Reportes', schema: ReportesSchema },
});

registerEndpoint({
  method: 'get',
  path: '/api/dashboard/resumen',
  tag: 'Dashboard',
  summary: 'Resumen del panel administrativo',
  description:
    'Ocupación, personal de turno, estado de la ambulancia, citas del día, laboratorio, inventario bajo mínimo y lotes por vencer (15 y 30 días).',
  roles: ['administrador'],
  ticket: 'HUNI-45',
  estado: 'implementado',
  response: { description: 'Resumen', schema: ResumenDashboardSchema },
});

registerEndpoint({
  method: 'get',
  path: '/api/publico/estado',
  tag: 'Público',
  summary: 'Estado público del hospital',
  description:
    'Sin token. Ocupación agregada (solo cantidades), médicos de turno en este momento (tipos de personal ' +
    'médicos, hora de El Salvador) y avisos públicos vigentes. ' +
    'Nunca incluye nombres de pacientes ni la habitación de nadie (context.md §3.4). ' +
    'Los clientes con Supabase pueden obtener lo mismo con la RPC `estado_publico()`.',
  roles: 'publico',
  ticket: 'HUNI-74',
  estado: 'implementado',
  response: { description: 'Estado público', schema: EstadoPublicoSchema },
});
