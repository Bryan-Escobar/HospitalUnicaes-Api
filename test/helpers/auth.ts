import { createLocalJWKSet, exportJWK, generateKeyPair, KeyLike, SignJWT } from 'jose';
import { Rol } from '../../src/domain/dtos/enums';
import { SupabaseJwtVerifier } from '../../src/lib/supabase-jwt';
import { AuthRepository } from '../../src/repositories/auth.repository';

/**
 * Sesiones de prueba: firma JWT ES256 reales con una llave local y hace que el verificador use su JWKS
 * en lugar del de Supabase. Así se prueba la verificación de verdad (firma, issuer, audience, expiración).
 */
const ISSUER = `${process.env.SUPABASE_URL}/auth/v1`;
const KID = 'llave-de-prueba';

export const USUARIOS: Record<Rol, string> = {
  administrador: '11111111-1111-4111-8111-000000000001',
  doctor: '11111111-1111-4111-8111-000000000002',
  recepcionista: '11111111-1111-4111-8111-000000000003',
  paciente: '11111111-1111-4111-8111-000000000004',
};

let privateKey: KeyLike;
let keySet: ReturnType<typeof createLocalJWKSet> | undefined;

const inicializar = async () => {
  if (keySet) return;
  const par = await generateKeyPair('ES256');
  privateKey = par.privateKey;
  const jwk = { ...(await exportJWK(par.publicKey)), kid: KID, alg: 'ES256', use: 'sig' };
  keySet = createLocalJWKSet({ keys: [jwk] });
};

interface OpcionesToken {
  issuer?: string;
  audience?: string;
  expiraEn?: string | number;
  llave?: KeyLike;
}

export const firmarToken = async (sub: string, opciones: OpcionesToken = {}) => {
  await inicializar();
  return new SignJWT({ role: 'authenticated', email: `${sub}@demo.test` })
    .setProtectedHeader({ alg: 'ES256', kid: KID })
    .setIssuer(opciones.issuer ?? ISSUER)
    .setAudience(opciones.audience ?? 'authenticated')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(opciones.expiraEn ?? '1h')
    .sign(opciones.llave ?? privateKey);
};

/** Activa el JWKS local. Llamar en cada test (los mocks se restauran después de cada uno). */
export const usarJwksDePrueba = async () => {
  await inicializar();
  jest.spyOn(SupabaseJwtVerifier.prototype, 'keySet').mockReturnValue(keySet!);
};

/** Sesión válida del rol dado: devuelve el header Authorization listo para supertest. */
export const sesionComo = async (rol: Rol, { activo = true } = {}) => {
  await usarJwksDePrueba();
  const id = USUARIOS[rol];
  jest.spyOn(AuthRepository.prototype, 'findPerfilSesion').mockResolvedValue({ id, rol, activo });
  return { Authorization: `Bearer ${await firmarToken(id)}` };
};
