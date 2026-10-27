import { generateKeyPair } from 'jose';
import request from 'supertest';
import { MeSchema, PerfilSchema } from '../../src/domain/dtos/auth.dto';
import { Rol, ROLES } from '../../src/domain/dtos/enums';
import { CustomError } from '../../src/domain/errors/CustomError';
import { AuthRepository, PerfilConRelaciones } from '../../src/repositories/auth.repository';
import { SupabaseAuthRepository } from '../../src/repositories/supabase-auth.repository';
import { app } from '../helpers/app';
import { firmarToken, sesionComo, USUARIOS, usarJwksDePrueba } from '../helpers/auth';

const TIPOS: Record<Exclude<Rol, 'paciente'>, { id: string; nombre: string; especialidad: string | null }> = {
  administrador: { id: 'aaaaaaaa-0000-4000-8000-000000000001', nombre: 'Administrativo', especialidad: null },
  doctor: { id: 'aaaaaaaa-0000-4000-8000-000000000002', nombre: 'Doctor', especialidad: 'Medicina interna' },
  recepcionista: { id: 'aaaaaaaa-0000-4000-8000-000000000003', nombre: 'Recepcionista', especialidad: null },
};

const perfilDe = (rol: Rol, cambios: Partial<PerfilConRelaciones> = {}): PerfilConRelaciones => {
  const tipo = rol === 'paciente' ? null : TIPOS[rol];
  return {
    id: USUARIOS[rol],
    rol,
    nombres: 'Nombre',
    apellidos: 'Apellido',
    email: `${rol}@demo.hospitalunicaes.test`,
    telefono: null,
    avatar_url: null,
    activo: true,
    created_at: new Date('2026-10-24T12:00:00Z'),
    updated_at: new Date('2026-10-24T12:00:00Z'),
    pacientes: rol === 'paciente' ? { id: 'bbbbbbbb-0000-4000-8000-000000000004' } : null,
    personal: tipo
      ? {
          id: `cccccccc-0000-4000-8000-00000000000${ROLES.indexOf(rol) + 1}`,
          codigo_empleado: `EMP-000${ROLES.indexOf(rol) + 1}`,
          tipos_personal: { id: tipo.id, nombre: tipo.nombre },
          especialidades: tipo.especialidad ? { nombre: tipo.especialidad } : null,
        }
      : null,
    ...cambios,
  };
};

const registroValido = {
  nombres: 'Carlos',
  apellidos: 'Martínez Rivas',
  email: 'nuevo.paciente@correo.com',
  password: 'Hospital2026',
  documento_identidad: '09876543-2',
  alergias: 'Penicilina',
};

describe('Auth API', () => {
  describe('Autenticación (middleware)', () => {
    test('deberia retornar 401 sin header Authorization', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ statusCode: 401, success: false, code: 'NO_AUTENTICADO' });
    });

    test('deberia retornar 401 si el header no es Bearer', async () => {
      const res = await request(app).get('/api/auth/me').set('Authorization', 'Basic abc123');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    test('deberia retornar 401 con un token mal formado', async () => {
      await usarJwksDePrueba();

      const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer no-es-un-jwt');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    test('deberia retornar 401 con un token expirado', async () => {
      await usarJwksDePrueba();
      const token = await firmarToken(USUARIOS.doctor, { expiraEn: Math.floor(Date.now() / 1000) - 60 });

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    test('deberia retornar 401 con un token de otro proyecto (issuer distinto)', async () => {
      await usarJwksDePrueba();
      const token = await firmarToken(USUARIOS.doctor, { issuer: 'https://otro.supabase.co/auth/v1' });

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    test('deberia retornar 401 con un token que no es de usuario (audience distinta)', async () => {
      await usarJwksDePrueba();
      const token = await firmarToken(USUARIOS.doctor, { audience: 'anon' });

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    test('deberia retornar 401 con un token firmado por otra llave', async () => {
      await usarJwksDePrueba();
      const { privateKey } = await generateKeyPair('ES256');
      const token = await firmarToken(USUARIOS.doctor, { llave: privateKey });

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    test('deberia retornar 401 si la cuenta del token ya no existe', async () => {
      await usarJwksDePrueba();
      jest.spyOn(AuthRepository.prototype, 'findPerfilSesion').mockResolvedValue(null);
      const token = await firmarToken(USUARIOS.doctor);

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    test.each(ROLES)('deberia retornar 403 CUENTA_INACTIVA si la cuenta de %s está desactivada', async (rol) => {
      const headers = await sesionComo(rol, { activo: false });

      const res = await request(app).get('/api/auth/me').set(headers);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CUENTA_INACTIVA');
    });
  });

  describe('GET /api/auth/me', () => {
    test.each(ROLES)('deberia retornar 200 con id, nombre, rol y tipo de personal para %s', async (rol) => {
      const headers = await sesionComo(rol);
      jest.spyOn(AuthRepository.prototype, 'findPerfilCompleto').mockResolvedValue(perfilDe(rol));

      const res = await request(app).get('/api/auth/me').set(headers);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(MeSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data).toMatchObject({ id: USUARIOS[rol], nombres: 'Nombre', apellidos: 'Apellido', rol });

      if (rol === 'paciente') {
        expect(res.body.data.paciente_id).toBeTruthy();
        expect(res.body.data.personal).toBeNull();
      } else {
        expect(res.body.data.paciente_id).toBeNull();
        expect(res.body.data.personal.tipo).toEqual({ id: TIPOS[rol].id, nombre: TIPOS[rol].nombre });
        expect(res.body.data.personal.especialidad).toBe(TIPOS[rol].especialidad);
      }
    });

    test('deberia retornar 403 PERFIL_INCOMPLETO si el paciente no tiene ficha', async () => {
      const headers = await sesionComo('paciente');
      jest
        .spyOn(AuthRepository.prototype, 'findPerfilCompleto')
        .mockResolvedValue(perfilDe('paciente', { pacientes: null }));

      const res = await request(app).get('/api/auth/me').set(headers);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERFIL_INCOMPLETO');
    });

    test('deberia retornar 403 PERFIL_INCOMPLETO si el personal no tiene registro de empleado', async () => {
      const headers = await sesionComo('doctor');
      jest
        .spyOn(AuthRepository.prototype, 'findPerfilCompleto')
        .mockResolvedValue(perfilDe('doctor', { personal: null }));

      const res = await request(app).get('/api/auth/me').set(headers);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERFIL_INCOMPLETO');
    });

    test('el rol sale de perfiles, no del token', async () => {
      // El token no lleva rol de la app; aunque se falsificara un claim, el backend usa el de la BD.
      const headers = await sesionComo('paciente');
      const spy = jest.spyOn(AuthRepository.prototype, 'findPerfilCompleto').mockResolvedValue(perfilDe('paciente'));

      const res = await request(app).get('/api/auth/me').set(headers);

      expect(res.body.data.rol).toBe('paciente');
      expect(spy).toHaveBeenCalledWith(USUARIOS.paciente);
    });
  });

  describe('PATCH /api/auth/me', () => {
    test.each(ROLES)('deberia permitir a %s actualizar sus datos de contacto', async (rol) => {
      const headers = await sesionComo(rol);
      const { pacientes: _p, personal: _s, ...perfil } = perfilDe(rol, { telefono: '+503 7000-1234' });
      const spy = jest.spyOn(AuthRepository.prototype, 'actualizarPerfil').mockResolvedValue(perfil);

      const res = await request(app).patch('/api/auth/me').set(headers).send({ telefono: '+503 7000-1234' });

      expect(res.status).toBe(200);
      expect(PerfilSchema.safeParse(res.body.data).success).toBe(true);
      expect(spy).toHaveBeenCalledWith(USUARIOS[rol], { telefono: '+503 7000-1234' });
    });

    test('no deja cambiar el rol ni el correo (se ignoran)', async () => {
      const headers = await sesionComo('paciente');
      const { pacientes: _p, personal: _s, ...perfil } = perfilDe('paciente');
      const spy = jest.spyOn(AuthRepository.prototype, 'actualizarPerfil').mockResolvedValue(perfil);

      const res = await request(app)
        .patch('/api/auth/me')
        .set(headers)
        .send({ nombres: 'Carlos', rol: 'administrador', email: 'otro@correo.com' });

      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith(USUARIOS.paciente, { nombres: 'Carlos' });
      expect(res.body.data.rol).toBe('paciente');
    });

    test('deberia retornar 400 si no se envía ningún campo', async () => {
      const headers = await sesionComo('doctor');

      const res = await request(app).patch('/api/auth/me').set(headers).send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SOLICITUD_INVALIDA');
    });

    test('deberia retornar 401 sin token aunque el body sea inválido', async () => {
      const res = await request(app).patch('/api/auth/me').send({ telefono: 1 });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/registro', () => {
    test('deberia retornar 201 y crear la cuenta como paciente', async () => {
      jest.spyOn(AuthRepository.prototype, 'existeDocumento').mockResolvedValue(false);
      const crearUsuario = jest
        .spyOn(SupabaseAuthRepository.prototype, 'crearUsuario')
        .mockResolvedValue(USUARIOS.paciente);
      const crearPaciente = jest
        .spyOn(AuthRepository.prototype, 'crearPaciente')
        .mockResolvedValue(perfilDe('paciente'));

      const res = await request(app).post('/api/auth/registro').send(registroValido);

      expect(res.status).toBe(201);
      expect(MeSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data).toMatchObject({ rol: 'paciente', personal: null });
      expect(crearUsuario).toHaveBeenCalledWith({
        email: registroValido.email,
        password: registroValido.password,
        nombres: 'Carlos',
        apellidos: 'Martínez Rivas',
      });
      expect(crearPaciente).toHaveBeenCalledWith(
        USUARIOS.paciente,
        expect.objectContaining({ documento_identidad: '09876543-2', alergias: 'Penicilina' }),
      );
    });

    test.each(['administrador', 'doctor', 'recepcionista'])(
      'un paciente no puede asignarse el rol %s al registrarse',
      async (rol) => {
        jest.spyOn(AuthRepository.prototype, 'existeDocumento').mockResolvedValue(false);
        jest.spyOn(SupabaseAuthRepository.prototype, 'crearUsuario').mockResolvedValue(USUARIOS.paciente);
        const crearPaciente = jest
          .spyOn(AuthRepository.prototype, 'crearPaciente')
          .mockResolvedValue(perfilDe('paciente'));

        const res = await request(app)
          .post('/api/auth/registro')
          .send({ ...registroValido, rol, tipo_personal_id: TIPOS.doctor.id });

        expect(res.status).toBe(201);
        expect(res.body.data.rol).toBe('paciente');
        // El campo `rol` ni siquiera llega al servicio ni a la BD.
        const datos = crearPaciente.mock.calls[0][1];
        expect(datos).not.toHaveProperty('rol');
        expect(datos).not.toHaveProperty('tipo_personal_id');
      },
    );

    test('deberia retornar 409 EMAIL_EN_USO si el correo ya tiene cuenta', async () => {
      jest.spyOn(AuthRepository.prototype, 'existeDocumento').mockResolvedValue(false);
      jest
        .spyOn(SupabaseAuthRepository.prototype, 'crearUsuario')
        .mockRejectedValue(CustomError.fromCode('EMAIL_EN_USO', 'Ya existe una cuenta con ese correo'));

      const res = await request(app).post('/api/auth/registro').send(registroValido);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_EN_USO');
    });

    test('deberia retornar 409 REGISTRO_DUPLICADO sin crear la cuenta si el documento ya existe', async () => {
      jest.spyOn(AuthRepository.prototype, 'existeDocumento').mockResolvedValue(true);
      const crearUsuario = jest.spyOn(SupabaseAuthRepository.prototype, 'crearUsuario');

      const res = await request(app).post('/api/auth/registro').send(registroValido);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REGISTRO_DUPLICADO');
      expect(crearUsuario).not.toHaveBeenCalled();
    });

    test('borra la cuenta de Supabase si falla la creación del paciente', async () => {
      jest.spyOn(AuthRepository.prototype, 'existeDocumento').mockResolvedValue(false);
      jest.spyOn(SupabaseAuthRepository.prototype, 'crearUsuario').mockResolvedValue(USUARIOS.paciente);
      jest.spyOn(AuthRepository.prototype, 'crearPaciente').mockRejectedValue(new Error('BD caída'));
      const eliminar = jest.spyOn(SupabaseAuthRepository.prototype, 'eliminarUsuario').mockResolvedValue();

      const res = await request(app).post('/api/auth/registro').send(registroValido);

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('ERROR_INTERNO');
      expect(eliminar).toHaveBeenCalledWith(USUARIOS.paciente);
    });

    test('deberia retornar 400 VALIDACION con contraseña débil y sin nombres', async () => {
      const res = await request(app)
        .post('/api/auth/registro')
        .send({ email: 'x@correo.com', password: 'corta', apellidos: 'Rivas' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION');
      expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(
        expect.arrayContaining(['nombres', 'password']),
      );
    });
  });
});
