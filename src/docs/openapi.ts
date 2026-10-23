import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry';
import './paths';

// Documento OpenAPI servido en /docs (UI) y /docs.json (JSON para Postman, Kotlin, Swift, etc.).
export const buildOpenApiDocument = () =>
  new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'HospitalUnicaes API',
      version: '1.0.0',
      description: 'Backend unificado del Hospital Universitario Central (iOS, Android y Web).',
    },
    servers: [{ url: '/' }],
  });
