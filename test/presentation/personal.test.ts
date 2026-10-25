import request from 'supertest';
import { PersonalSchema } from '../../src/domain/dtos/personal.dto';
import { CustomError } from '../../src/domain/errors/CustomError';
import { PersonalCompleto, PersonalRepository } from '../../src/repositories/personal.repository';
import { SupabaseAuthRepository } from '../../src/repositories/supabase-auth.repository';
import { app } from '../helpers/app';
import { sesionComo } from '../helpers/auth';

const TIPO_DOCTOR = 'aaaaaaaa-0000-4000-8000-000000000002';
const TIPO_ENFERMERIA = 'aaaaaaaa-0000-4000-8000-000000000005';
const NUEVA_CUENTA = 'dddddddd-0000-4000-8000-000000000001';

const altaDoctor = {
  nombres: 'Ana María',
  apellidos: 'López Hernández',
  tipo_personal_id: TIPO_DOCTOR,
  codigo_empleado: 'EMP-0042',
  fecha_contratacion: '2026-10-01',
  email: 'ana.lopez@hospital.sv',
  password: 'Hospital2026',
};

const empleadoCreado = (cambios: Partial<PersonalCompleto> = {}): PersonalCompleto => ({
  id: 'eeeeeeee-0000-4000-8000-000000000001',
  perfil_id: NUEVA_CUENTA,
  nombres: altaDoctor.nombres,
  apellidos: altaDoctor.apellidos,
  telefono: null,
  tipo_personal_id: TIPO_DOCTOR,
  especialidad_id: null,
  codigo_empleado: altaDoctor.codigo_empleado,
  num_licencia: null,
  fecha_contratacion: new Date('2026-10-01T00:00:00Z'),
  activo: true,
  perfiles: { email: altaDoctor.email, rol: 'doctor' },
  tipos_personal: { id: TIPO_DOCTOR, nombre: 'Doctor' },
  especialidades: null,
  ...cambios,
});

const mockValidaciones = (rolSugerido: 'doctor' | null = 'doctor') => {
  jest
    .spyOn(PersonalRepository.prototype, 'findTipoPersonal')
    .mockResolvedValue({ id: TIPO_DOCTOR, activo: true, rol_sugerido: rolSugerido });
  jest.spyOn(PersonalRepository.prototype, 'existeEspecialidad').mockResolvedValue(true);
  jest.spyOn(PersonalRepository.prototype, 'existeCodigoEmpleado').mockResolvedValue(false);
};

describe('Personal API', () => {
  describe('POST /api/personal (RBAC)', () => {
    test('deberia retornar 401 sin token', async () => {
      const res = await request(app).post('/api/personal').send(altaDoctor);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    test.each(['doctor', 'recepcionista', 'paciente'] as const)('deberia retornar 403 para %s', async (rol) => {
      const headers = await sesionComo(rol);
      const crearUsuario = jest.spyOn(SupabaseAuthRepository.prototype, 'crearUsuario');

      const res = await request(app).post('/api/personal').set(headers).send(altaDoctor);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ statusCode: 403, success: false, code: 'ACCESO_DENEGADO' });
      expect(crearUsuario).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/personal (administrador)', () => {
    test('deberia crear la cuenta con el rol sugerido del tipo y retornar 201', async () => {
      const headers = await sesionComo('administrador');
      mockValidaciones('doctor');
      const crearUsuario = jest.spyOn(SupabaseAuthRepository.prototype, 'crearUsuario').mockResolvedValue(NUEVA_CUENTA);
      const crear = jest.spyOn(PersonalRepository.prototype, 'crear').mockResolvedValue(empleadoCreado());

      const res = await request(app).post('/api/personal').set(headers).send(altaDoctor);

      expect(res.status).toBe(201);
      expect(PersonalSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data).toMatchObject({ rol: 'doctor', email: altaDoctor.email, fecha_contratacion: '2026-10-01' });
      expect(crearUsuario).toHaveBeenCalledWith(expect.objectContaining({ email: altaDoctor.email }));
      expect(crear).toHaveBeenCalledWith(expect.not.objectContaining({ email: expect.anything() }), {
        perfilId: NUEVA_CUENTA,
        rol: 'doctor',
      });
    });

    test('el rol enviado tiene prioridad sobre el sugerido', async () => {
      const headers = await sesionComo('administrador');
      mockValidaciones('doctor');
      jest.spyOn(SupabaseAuthRepository.prototype, 'crearUsuario').mockResolvedValue(NUEVA_CUENTA);
      const crear = jest
        .spyOn(PersonalRepository.prototype, 'crear')
        .mockResolvedValue(empleadoCreado({ perfiles: { email: altaDoctor.email, rol: 'administrador' } }));

      const res = await request(app)
        .post('/api/personal')
        .set(headers)
        .send({ ...altaDoctor, rol: 'administrador' });

      expect(res.status).toBe(201);
      expect(crear.mock.calls[0][1]).toEqual({ perfilId: NUEVA_CUENTA, rol: 'administrador' });
    });

    test('sin email crea el empleado sin cuenta (solo turnos)', async () => {
      const headers = await sesionComo('administrador');
      mockValidaciones('doctor');
      const crearUsuario = jest.spyOn(SupabaseAuthRepository.prototype, 'crearUsuario');
      jest
        .spyOn(PersonalRepository.prototype, 'crear')
        .mockResolvedValue(empleadoCreado({ perfil_id: null, perfiles: null }));
      const { email: _e, password: _p, ...sinCuenta } = altaDoctor;

      const res = await request(app).post('/api/personal').set(headers).send(sinCuenta);

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ perfil_id: null, email: null, rol: null });
      expect(crearUsuario).not.toHaveBeenCalled();
    });

    test('no permite crear cuentas con rol paciente', async () => {
      const headers = await sesionComo('administrador');

      const res = await request(app)
        .post('/api/personal')
        .set(headers)
        .send({ ...altaDoctor, rol: 'paciente' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION');
    });

    test('deberia retornar 400 si el tipo no sugiere rol y no se envía', async () => {
      const headers = await sesionComo('administrador');
      mockValidaciones(null);
      const crearUsuario = jest.spyOn(SupabaseAuthRepository.prototype, 'crearUsuario');

      const res = await request(app)
        .post('/api/personal')
        .set(headers)
        .send({ ...altaDoctor, tipo_personal_id: TIPO_ENFERMERIA });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SOLICITUD_INVALIDA');
      expect(crearUsuario).not.toHaveBeenCalled();
    });

    test('deberia retornar 400 REFERENCIA_INVALIDA si el tipo de personal no existe', async () => {
      const headers = await sesionComo('administrador');
      jest.spyOn(PersonalRepository.prototype, 'findTipoPersonal').mockResolvedValue(null);

      const res = await request(app).post('/api/personal').set(headers).send(altaDoctor);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('REFERENCIA_INVALIDA');
    });

    test('deberia retornar 409 REGISTRO_DUPLICADO si el código de empleado existe', async () => {
      const headers = await sesionComo('administrador');
      mockValidaciones();
      jest.spyOn(PersonalRepository.prototype, 'existeCodigoEmpleado').mockResolvedValue(true);

      const res = await request(app).post('/api/personal').set(headers).send(altaDoctor);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REGISTRO_DUPLICADO');
    });

    test('deberia retornar 409 EMAIL_EN_USO si el correo ya tiene cuenta', async () => {
      const headers = await sesionComo('administrador');
      mockValidaciones();
      jest
        .spyOn(SupabaseAuthRepository.prototype, 'crearUsuario')
        .mockRejectedValue(CustomError.fromCode('EMAIL_EN_USO'));

      const res = await request(app).post('/api/personal').set(headers).send(altaDoctor);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_EN_USO');
    });

    test('borra la cuenta de Supabase si falla el alta en la BD', async () => {
      const headers = await sesionComo('administrador');
      mockValidaciones();
      jest.spyOn(SupabaseAuthRepository.prototype, 'crearUsuario').mockResolvedValue(NUEVA_CUENTA);
      jest.spyOn(PersonalRepository.prototype, 'crear').mockRejectedValue(new Error('BD caída'));
      const eliminar = jest.spyOn(SupabaseAuthRepository.prototype, 'eliminarUsuario').mockResolvedValue();

      const res = await request(app).post('/api/personal').set(headers).send(altaDoctor);

      expect(res.status).toBe(500);
      expect(eliminar).toHaveBeenCalledWith(NUEVA_CUENTA);
    });
  });
});
