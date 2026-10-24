import { createClient } from '@supabase/supabase-js';
import { envs } from './envs';

// Cliente con la llave de servicio (salta RLS). Solo para la API admin de Auth: crear y borrar cuentas.
// Sin sesión propia: el backend no inicia sesión como ningún usuario.
export const supabaseAdmin = createClient(envs.SUPABASE_URL, envs.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
