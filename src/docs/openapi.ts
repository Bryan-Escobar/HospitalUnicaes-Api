import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry';
import './paths';

const DESCRIPCION = `
Backend unificado del Hospital Universitario Central para iOS, Android y Web (contrato v1, HUNI-36).

Los endpoints marcados **(pendiente)** ya tienen contrato pero aún no responden: se implementan en el ticket indicado.
Para trabajar en paralelo, simúlalos importando [\`/docs.json\`](/docs.json) en Postman (Mock server) o con Prism
(\`npx @stoplight/prism-cli mock http://localhost:3000/docs.json\`).

## Autenticación
1. El cliente inicia sesión con el SDK de Supabase (\`signInWithPassword\`) y obtiene el \`access_token\`.
2. Lo envía en cada petición: \`Authorization: Bearer <access_token>\`.
3. Llama a \`GET /api/auth/me\` para conocer el rol y navegar.

Sin token o con token vencido → 401 \`NO_AUTENTICADO\`. Rol sin permiso → 403 \`ACCESO_DENEGADO\`.
Roles: \`administrador\`, \`doctor\`, \`recepcionista\` (Recepcionista/Asistente) y \`paciente\`.

## Formato de respuesta
Éxito: \`{ statusCode, success: true, message, data }\`

Error (\`ApiError\`): \`{ statusCode, success: false, code, message, errors? }\`
- \`statusCode\`: código HTTP, la categoría del error.
- \`code\`: la causa exacta. **Los clientes deciden con este campo**; el catálogo completo está en el schema \`CodigoError\`.
- \`message\`: texto para mostrar al usuario. Puede cambiar, así que no lo comparen en el código.
- \`errors\`: detalle por campo, solo cuando \`code\` es \`VALIDACION\`.

\`\`\`json
{ "statusCode": 409, "success": false, "code": "CAMA_OCUPADA", "message": "La cama HAB-201-A ya está ocupada" }
\`\`\`

## Convenciones
- Rutas y campos en español con \`snake_case\`, igual que la base de datos.
- Ids: UUID. Fechas con hora: ISO 8601 en UTC. Fechas: \`AAAA-MM-DD\`.
- Listas paginadas: \`?pagina=1&por_pagina=20\` (máx. 100) → \`data: { items, paginacion }\`.
- Valores \`null\` explícitos cuando un dato no existe.

## Qué no pasa por esta API
- **Login, registro de sesión y recuperación de contraseña:** SDK de Supabase Auth.
- **Turnos del personal y citas:** directo a Supabase con RLS (HUNI-51).
- **Inventario:** directo a Supabase con RLS (HUNI-69).
- **Tiempo real** (ambulancia, camas, laboratorio): suscripción a Supabase Realtime.
`.trim();

const TAGS = [
  { name: 'Auth', description: 'Usuario de la sesión y registro de pacientes (HUNI-38)' },
  { name: 'Pacientes', description: 'Datos personales de pacientes (HUNI-45)' },
  { name: 'Personal', description: 'Empleados y especialidades (HUNI-45)' },
  { name: 'Consultas', description: 'Consultas, diagnósticos, recetas, expediente e historial clínico (HUNI-57)' },
  { name: 'Laboratorio', description: 'Órdenes y resultados: pendiente → en_proceso → completado (HUNI-62)' },
  { name: 'Habitaciones', description: '11 habitaciones, 17 camas, ingresos, altas y traslados (HUNI-66)' },
  { name: 'Ambulancia', description: 'La única ambulancia: solicitudes, despacho y bitácora (HUNI-70)' },
  { name: 'Dashboard', description: 'Panel administrativo (HUNI-45)' },
  { name: 'Público', description: 'Información pública, sin sesión (HUNI-74)' },
  { name: 'Health', description: 'Infraestructura' },
];

// Documento OpenAPI servido en /docs (UI) y /docs.json (JSON para Postman, Kotlin, Swift, etc.).
export const buildOpenApiDocument = () =>
  new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: { title: 'HospitalUnicaes API', version: '1.0.0', description: DESCRIPCION },
    servers: [{ url: '/', description: 'Este servidor' }],
    tags: TAGS,
  });
