// Set environment variables BEFORE any app code is imported
// env-var's .required() will crash at import time without these
process.env.PORT = '3001';
process.env.DATABASE_URL = 'postgresql://fake:fake@localhost:5432/fake';
process.env.DIRECT_URL = 'postgresql://fake:fake@localhost:5432/fake';
