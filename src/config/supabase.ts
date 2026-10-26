import { GoTrueAdminApi } from '@supabase/auth-js';
import { StorageClient } from '@supabase/storage-js';
import { envs } from './envs';

// API admin de Supabase Auth con la llave de servicio (salta RLS): solo para crear y borrar cuentas.
// Se usa `@supabase/auth-js` y no `@supabase/supabase-js` porque este último trae Realtime,
// que exige WebSocket nativo (Node 22+) y rompe en Node 20 (.nvmrc, Dockerfile).
export const supabaseAuthAdmin = new GoTrueAdminApi({
  url: `${envs.SUPABASE_URL}/auth/v1`,
  headers: { apikey: envs.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${envs.SUPABASE_SERVICE_ROLE_KEY}` },
});

// Storage con la llave de servicio: sube los PDF de laboratorio y firma URLs de descarga (HUNI-62).
// `@supabase/storage-js` suelto por la misma razón que auth-js: no arrastra Realtime.
export const supabaseStorage = new StorageClient(`${envs.SUPABASE_URL}/storage/v1`, {
  apikey: envs.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${envs.SUPABASE_SERVICE_ROLE_KEY}`,
});
