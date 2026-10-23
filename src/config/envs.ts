import 'dotenv/config';
import { get } from 'env-var';

const NODE_ENV = get('NODE_ENV').default('development').asEnum(['development', 'test', 'production']);

export const envs = {
  NODE_ENV,
  PORT: get('PORT').required().asPortNumber(),
  DATABASE_URL: get('DATABASE_URL').required().asString(),
  DIRECT_URL: get('DIRECT_URL').required().asString(),
  LOG_LEVEL: get('LOG_LEVEL')
    .default(NODE_ENV === 'test' ? 'silent' : 'info')
    .asEnum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  // Orígenes permitidos para CORS, separados por coma. "*" permite cualquiera.
  CORS_ORIGINS: get('CORS_ORIGINS').default('http://localhost:5173').asArray(','),
};
