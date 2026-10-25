import { GoTrueAdminApi } from '@supabase/auth-js';
import { envs } from './envs';

// API admin de Supabase Auth con la llave de servicio (salta RLS): solo para crear y borrar cuentas.
// Se usa `@supabase/auth-js` y no `@supabase/supabase-js` porque este último trae Realtime,
// que exige WebSocket nativo (Node 22+) y rompe en Node 20 (.nvmrc, Dockerfile).
export const supabaseAuthAdmin = new GoTrueAdminApi({
  url: `${envs.SUPABASE_URL}/auth/v1`,
  headers: { apikey: envs.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${envs.SUPABASE_SERVICE_ROLE_KEY}` },
});
