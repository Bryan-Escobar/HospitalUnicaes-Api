// Variables de entorno falsas ANTES de importar la app: env-var .required() falla sin ellas.
// Los tests nunca se conectan a una base de datos real.
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL = 'postgresql://fake:fake@localhost:5432/fake';
process.env.DIRECT_URL = 'postgresql://fake:fake@localhost:5432/fake';
process.env.SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-falsa';
