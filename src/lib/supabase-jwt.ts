import { createRemoteJWKSet, JWTVerifyGetKey, jwtVerify } from 'jose';
import { envs } from '../config/envs';

/**
 * Valida el `access_token` de Supabase Auth sin llamar a Supabase en cada petición:
 * el proyecto firma con llaves asimétricas (ES256) publicadas en su JWKS, que `jose` descarga y cachea.
 * Las llaves `anon` y `service_role` no pasan: no van firmadas con el JWKS ni tienen `aud: authenticated`.
 */
export class SupabaseJwtVerifier {
  private remoteKeySet?: JWTVerifyGetKey;

  // Público para que los tests lo reemplacen por un JWKS local.
  keySet(): JWTVerifyGetKey {
    this.remoteKeySet ??= createRemoteJWKSet(new URL(`${envs.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
    return this.remoteKeySet;
  }

  /** Devuelve el id del usuario (`sub`). Lanza si el token es inválido, expiró o no es de este proyecto. */
  async verify(token: string): Promise<string> {
    const { payload } = await jwtVerify(token, this.keySet(), {
      issuer: `${envs.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
    });
    if (!payload.sub) throw new Error('Token sin sub');
    return payload.sub;
  }
}

export const supabaseJwtVerifier = new SupabaseJwtVerifier();
