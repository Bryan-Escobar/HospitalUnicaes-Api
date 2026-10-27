import { registroPacienteBodySchema } from '../../src/domain/validators/auth.validator';

const base = {
  nombres: 'Carlos',
  apellidos: 'Martínez Rivas',
  email: 'carlos.martinez@correo.com',
  password: 'Clave-segura-123',
};

describe('Registro de paciente (body)', () => {
  test('acepta alergias opcionales y las recorta', () => {
    const r = registroPacienteBodySchema.safeParse({ ...base, alergias: '  Penicilina, polen  ' });
    expect(r.success).toBe(true);
    expect(r.data?.alergias).toBe('Penicilina, polen');
  });

  test('alergias puede omitirse', () => {
    const r = registroPacienteBodySchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.alergias).toBeUndefined();
  });

  test('rechaza alergias de más de 2000 caracteres', () => {
    expect(registroPacienteBodySchema.safeParse({ ...base, alergias: 'a'.repeat(2001) }).success).toBe(false);
  });

  test('no deja pasar el rol', () => {
    const r = registroPacienteBodySchema.safeParse({ ...base, rol: 'administrador' });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('rol');
  });
});
