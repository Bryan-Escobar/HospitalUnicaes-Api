import request from 'supertest';
import { ArchivoFirmadoSchema, OrdenExamenSchema, OrdenLaboratorioSchema } from '../../src/domain/dtos/laboratorio.dto';
import {
  AccesoOrden,
  LaboratorioRepository,
  OrdenCompleta,
  OrdenExamenCompleto,
} from '../../src/repositories/laboratorio.repository';
import { PacientesRepository } from '../../src/repositories/pacientes.repository';
import { ResultadosStorageRepository } from '../../src/repositories/resultados-storage.repository';
import { app } from '../helpers/app';
import { sesionComo, USUARIOS } from '../helpers/auth';

const ORDEN_ID = 'aaaaaaaa-0000-4000-8000-000000000031';
const EXAMEN_ID = 'aaaaaaaa-0000-4000-8000-000000000041';
const PACIENTE_ID = 'bbbbbbbb-0000-4000-8000-000000000004';
const PERSONAL_DOCTOR = 'cccccccc-0000-4000-8000-000000000002';
const PERSONAL_RECEPCION = 'cccccccc-0000-4000-8000-000000000003';

const URL_EXAMEN = `/api/laboratorio/ordenes/${ORDEN_ID}/examenes/${EXAMEN_ID}`;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF');

const recepcion = { id: PERSONAL_RECEPCION, nombres: 'Lucía', apellidos: 'Herrera Gómez' };

type Estado = 'pendiente' | 'en_proceso' | 'completado';

const examen = (estado: Estado = 'pendiente', archivo: string | null = null): OrdenExamenCompleto => ({
  id: EXAMEN_ID,
  orden_id: ORDEN_ID,
  examen_id: 'abababab-0000-4000-8000-000000000001',
  estado,
  fecha_inicio: estado === 'pendiente' ? null : new Date('2026-10-26T14:00:00Z'),
  fecha_completado: estado === 'completado' ? new Date('2026-10-26T16:00:00Z') : null,
  examenes_catalogo: {
    id: 'abababab-0000-4000-8000-000000000001',
    nombre: 'Hemograma completo',
    tipo_muestra: 'Sangre',
  },
  resultados_laboratorio:
    estado === 'completado'
      ? {
          id: 'aaaaaaaa-0000-4000-8000-000000000051',
          orden_examen_id: EXAMEN_ID,
          valor: '13.8',
          unidad: 'g/dL',
          rango_referencia: '13.0 – 17.0',
          observaciones: null,
          archivo_url: archivo,
          validado_por: PERSONAL_RECEPCION,
          fecha_resultado: new Date('2026-10-26T16:00:00Z'),
          personal: recepcion,
        }
      : null,
});

const orden = (estado: Estado = 'pendiente'): OrdenCompleta => ({
  id: ORDEN_ID,
  consulta_id: 'aaaaaaaa-0000-4000-8000-000000000001',
  fecha_solicitud: new Date('2026-10-26T13:00:00Z'),
  prioridad: 'normal',
  estado,
  indicaciones: null,
  registrado_por: PERSONAL_DOCTOR,
  personal: { id: PERSONAL_DOCTOR, nombres: 'Roberto', apellidos: 'Castillo Peña' },
  consultas: {
    expedientes: { pacientes: { id: PACIENTE_ID, nombres: 'Carlos', apellidos: 'Martínez Rivas' } },
    personal: {
      id: PERSONAL_DOCTOR,
      nombres: 'Roberto',
      apellidos: 'Castillo Peña',
      especialidades: { nombre: 'Medicina interna' },
    },
  },
  orden_examenes: [examen(estado)],
});

const acceso = (cambios: Partial<AccesoOrden> = {}): AccesoOrden => ({
  id: ORDEN_ID,
  paciente_id: PACIENTE_ID,
  paciente_perfil_id: USUARIOS.paciente,
  ...cambios,
});

const lab = <K extends keyof LaboratorioRepository>(m: K) => jest.spyOn(LaboratorioRepository.prototype, m);
const storage = <K extends keyof ResultadosStorageRepository>(m: K) =>
  jest.spyOn(ResultadosStorageRepository.prototype, m);

/** Sesión con su registro de personal (doctor, recepción o administración). */
const comoPersonal = async (rol: 'doctor' | 'recepcionista' | 'administrador', personalId: string | null) => {
  const headers = await sesionComo(rol);
  jest.spyOn(PacientesRepository.prototype, 'findPersonalIdDePerfil').mockResolvedValue(personalId);
  return headers;
};

describe('Laboratorio API: órdenes y resultados (HUNI-62)', () => {
  describe('Autenticación', () => {
    test.each([
      ['get', '/api/laboratorio/ordenes'],
      ['get', `/api/laboratorio/ordenes/${ORDEN_ID}`],
      ['patch', `${URL_EXAMEN}/estado`],
      ['put', `${URL_EXAMEN}/resultado`],
      ['get', `${URL_EXAMEN}/resultado/archivo`],
    ] as const)('%s %s sin token → 401', async (method, url) => {
      const res = await request(app)[method](url).send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/laboratorio/ordenes', () => {
    test.each(['administrador', 'recepcionista'] as const)('%s ve todas y filtra por estado', async (rol) => {
      const headers = await sesionComo(rol);
      const listar = lab('listarOrdenes').mockResolvedValue([[orden()], 1]);

      const res = await request(app).get('/api/laboratorio/ordenes?estado=pendiente&prioridad=normal').set(headers);

      expect(res.status).toBe(200);
      expect(OrdenLaboratorioSchema.safeParse(res.body.data.items[0]).success).toBe(true);
      expect(listar.mock.calls[0][0]).toEqual({
        estado: 'pendiente',
        prioridad: 'normal',
        pacienteId: undefined,
        desde: undefined,
        hastaExclusivo: undefined,
      });
    });

    test('un doctor solo ve las de los pacientes que atiende', async () => {
      const headers = await comoPersonal('doctor', PERSONAL_DOCTOR);
      const listar = lab('listarOrdenes').mockResolvedValue([[], 0]);

      await request(app).get('/api/laboratorio/ordenes').set(headers);

      expect(listar.mock.calls[0][0]).toMatchObject({ tratadosPor: PERSONAL_DOCTOR });
    });

    test('un paciente solo ve las propias', async () => {
      const headers = await sesionComo('paciente');
      const listar = lab('listarOrdenes').mockResolvedValue([[], 0]);

      await request(app).get('/api/laboratorio/ordenes').set(headers);

      expect(listar.mock.calls[0][0]).toMatchObject({ perfilPaciente: USUARIOS.paciente });
    });

    test('estado inválido → 400', async () => {
      const res = await request(app)
        .get('/api/laboratorio/ordenes?estado=cancelada')
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/laboratorio/ordenes/:id', () => {
    test.each(['administrador', 'recepcionista', 'paciente'] as const)('%s ve la orden', async (rol) => {
      const headers = await sesionComo(rol);
      lab('findAcceso').mockResolvedValue(acceso());
      lab('findOrden').mockResolvedValue(orden());

      const res = await request(app).get(`/api/laboratorio/ordenes/${ORDEN_ID}`).set(headers);

      expect(res.status).toBe(200);
      expect(OrdenLaboratorioSchema.safeParse(res.body.data).success).toBe(true);
    });

    test('el médico tratante la ve; otro doctor → 403', async () => {
      lab('findAcceso').mockResolvedValue(acceso());
      lab('findOrden').mockResolvedValue(orden());
      const esTratante = jest.spyOn(PacientesRepository.prototype, 'esTratante').mockResolvedValueOnce(true);

      const tratante = await request(app)
        .get(`/api/laboratorio/ordenes/${ORDEN_ID}`)
        .set(await comoPersonal('doctor', PERSONAL_DOCTOR));
      esTratante.mockResolvedValueOnce(false);
      const otro = await request(app)
        .get(`/api/laboratorio/ordenes/${ORDEN_ID}`)
        .set(await comoPersonal('doctor', 'cccccccc-0000-4000-8000-000000000005'));

      expect(tratante.status).toBe(200);
      expect(otro.status).toBe(403);
    });

    test('otro paciente → 403', async () => {
      lab('findAcceso').mockResolvedValue(acceso({ paciente_perfil_id: '11111111-1111-4111-8111-000000000007' }));

      const res = await request(app)
        .get(`/api/laboratorio/ordenes/${ORDEN_ID}`)
        .set(await sesionComo('paciente'));

      expect(res.status).toBe(403);
    });

    test('no existe → 404 (para un paciente, 403 sin revelar si existe)', async () => {
      lab('findAcceso').mockResolvedValue(null);

      const admin = await request(app)
        .get(`/api/laboratorio/ordenes/${ORDEN_ID}`)
        .set(await sesionComo('administrador'));
      const pac = await request(app)
        .get(`/api/laboratorio/ordenes/${ORDEN_ID}`)
        .set(await sesionComo('paciente'));

      expect(admin.status).toBe(404);
      expect(pac.status).toBe(403);
    });
  });

  describe('PATCH .../estado (pendiente → en_proceso)', () => {
    test('recepción inicia un examen pendiente → 200 en_proceso', async () => {
      const headers = await sesionComo('recepcionista');
      lab('findExamen').mockResolvedValue(examen('pendiente'));
      const iniciar = lab('iniciarExamen').mockResolvedValue(examen('en_proceso'));

      const res = await request(app).patch(`${URL_EXAMEN}/estado`).set(headers).send({ estado: 'en_proceso' });

      expect(res.status).toBe(200);
      expect(OrdenExamenSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data.estado).toBe('en_proceso');
      expect(iniciar).toHaveBeenCalledWith(EXAMEN_ID);
    });

    test.each(['en_proceso', 'completado'] as const)('un examen %s no se inicia otra vez → 422', async (estado) => {
      const headers = await sesionComo('recepcionista');
      lab('findExamen').mockResolvedValue(examen(estado));
      const iniciar = lab('iniciarExamen');

      const res = await request(app).patch(`${URL_EXAMEN}/estado`).set(headers).send({ estado: 'en_proceso' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('TRANSICION_INVALIDA');
      expect(iniciar).not.toHaveBeenCalled();
    });

    test.each(['completado', 'pendiente'])('pedir estado %s por esta ruta → 400 VALIDACION', async (estado) => {
      const res = await request(app)
        .patch(`${URL_EXAMEN}/estado`)
        .set(await sesionComo('recepcionista'))
        .send({ estado });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION');
    });

    test('si la BD rechaza la transición (carrera) → 422 TRANSICION_INVALIDA', async () => {
      lab('findExamen').mockResolvedValue(examen('pendiente'));
      lab('iniciarExamen').mockRejectedValue(
        new Error('TRANSICION_INVALIDA: un examen no pasa de en_proceso a en_proceso'),
      );

      const res = await request(app)
        .patch(`${URL_EXAMEN}/estado`)
        .set(await sesionComo('administrador'))
        .send({ estado: 'en_proceso' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('TRANSICION_INVALIDA');
    });

    test('examen que no es de esa orden → 404', async () => {
      lab('findExamen').mockResolvedValue(null);

      const res = await request(app)
        .patch(`${URL_EXAMEN}/estado`)
        .set(await sesionComo('recepcionista'))
        .send({ estado: 'en_proceso' });

      expect(res.status).toBe(404);
    });

    test.each(['doctor', 'paciente'] as const)('%s no procesa exámenes → 403', async (rol) => {
      const res = await request(app)
        .patch(`${URL_EXAMEN}/estado`)
        .set(await sesionComo(rol))
        .send({ estado: 'en_proceso' });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT .../resultado (en_proceso → completado)', () => {
    test('con valor (sin PDF) → 200 completado y validado por recepción', async () => {
      const headers = await comoPersonal('recepcionista', PERSONAL_RECEPCION);
      lab('findExamen').mockResolvedValue(examen('en_proceso'));
      const registrar = lab('registrarResultado').mockResolvedValue(examen('completado'));
      const subir = storage('subirPdf');

      const res = await request(app)
        .put(`${URL_EXAMEN}/resultado`)
        .set(headers)
        .field('valor', ' 13.8 ')
        .field('unidad', 'g/dL');

      expect(res.status).toBe(200);
      expect(OrdenExamenSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data).toMatchObject({ estado: 'completado', resultado: { validado_por: recepcion } });
      expect(registrar).toHaveBeenCalledWith(EXAMEN_ID, PERSONAL_RECEPCION, {
        valor: '13.8',
        unidad: 'g/dL',
        rango_referencia: undefined,
        observaciones: undefined,
        archivo_url: undefined,
      });
      expect(subir).not.toHaveBeenCalled();
    });

    test('con PDF → se sube a Storage y se guarda su ruta', async () => {
      const headers = await comoPersonal('recepcionista', PERSONAL_RECEPCION);
      lab('findExamen').mockResolvedValue(examen('en_proceso'));
      const subir = storage('subirPdf').mockResolvedValue();
      const registrar = lab('registrarResultado').mockResolvedValue(examen('completado', 'ruta.pdf'));

      const res = await request(app)
        .put(`${URL_EXAMEN}/resultado`)
        .set(headers)
        .attach('archivo', PDF, { filename: 'hemograma.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(200);
      expect(res.body.data.resultado.tiene_archivo).toBe(true);
      expect(subir).toHaveBeenCalledWith(`${ORDEN_ID}/${EXAMEN_ID}.pdf`, expect.any(Buffer));
      expect(registrar.mock.calls[0][2]).toMatchObject({ archivo_url: `${ORDEN_ID}/${EXAMEN_ID}.pdf` });
    });

    test('sin valor ni PDF → 422 RESULTADO_REQUERIDO', async () => {
      const headers = await comoPersonal('recepcionista', PERSONAL_RECEPCION);
      lab('findExamen').mockResolvedValue(examen('en_proceso'));
      const registrar = lab('registrarResultado');

      const res = await request(app).put(`${URL_EXAMEN}/resultado`).set(headers).field('valor', '   ');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('RESULTADO_REQUERIDO');
      expect(registrar).not.toHaveBeenCalled();
    });

    test.each([
      ['pendiente', 'inícialo antes'],
      ['completado', 'ya está completado'],
    ] as const)('examen %s → 422 TRANSICION_INVALIDA', async (estado, texto) => {
      const headers = await comoPersonal('recepcionista', PERSONAL_RECEPCION);
      lab('findExamen').mockResolvedValue(examen(estado));

      const res = await request(app).put(`${URL_EXAMEN}/resultado`).set(headers).field('valor', '13.8');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('TRANSICION_INVALIDA');
      expect(res.body.message).toContain(texto);
    });

    test('un archivo que no es PDF → 400 SOLICITUD_INVALIDA', async () => {
      const headers = await comoPersonal('recepcionista', PERSONAL_RECEPCION);

      const res = await request(app)
        .put(`${URL_EXAMEN}/resultado`)
        .set(headers)
        .attach('archivo', Buffer.from('hola'), { filename: 'nota.txt', contentType: 'text/plain' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SOLICITUD_INVALIDA');
    });

    test('un "PDF" falso (no empieza con %PDF-) → 400 SOLICITUD_INVALIDA', async () => {
      const headers = await comoPersonal('recepcionista', PERSONAL_RECEPCION);
      lab('findExamen').mockResolvedValue(examen('en_proceso'));
      const subir = storage('subirPdf');

      const res = await request(app)
        .put(`${URL_EXAMEN}/resultado`)
        .set(headers)
        .attach('archivo', Buffer.from('MZ ejecutable'), { filename: 'virus.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(400);
      expect(subir).not.toHaveBeenCalled();
    });

    test('un PDF de más de 10 MB → 400 SOLICITUD_INVALIDA', async () => {
      const headers = await comoPersonal('recepcionista', PERSONAL_RECEPCION);
      const grande = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);

      const res = await request(app)
        .put(`${URL_EXAMEN}/resultado`)
        .set(headers)
        .attach('archivo', grande, { filename: 'grande.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('10 MB');
    });

    test('si la BD falla después de subir el PDF, se borra el archivo', async () => {
      const headers = await comoPersonal('recepcionista', PERSONAL_RECEPCION);
      lab('findExamen').mockResolvedValue(examen('en_proceso'));
      storage('subirPdf').mockResolvedValue();
      lab('registrarResultado').mockRejectedValue(new Error('TRANSICION_INVALIDA: el examen ya está completado'));
      const eliminar = storage('eliminar').mockResolvedValue();

      const res = await request(app)
        .put(`${URL_EXAMEN}/resultado`)
        .set(headers)
        .attach('archivo', PDF, { filename: 'r.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(422);
      expect(eliminar).toHaveBeenCalledWith(`${ORDEN_ID}/${EXAMEN_ID}.pdf`);
    });

    test('recepción sin registro de personal → 403 PERFIL_INCOMPLETO', async () => {
      const res = await request(app)
        .put(`${URL_EXAMEN}/resultado`)
        .set(await comoPersonal('recepcionista', null))
        .field('valor', '13.8');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERFIL_INCOMPLETO');
    });

    test.each(['doctor', 'paciente'] as const)('%s no registra resultados → 403', async (rol) => {
      const res = await request(app)
        .put(`${URL_EXAMEN}/resultado`)
        .set(await sesionComo(rol))
        .field('valor', '13.8');

      expect(res.status).toBe(403);
    });
  });

  describe('GET .../resultado/archivo (URL firmada)', () => {
    const conPdf = () => {
      lab('findAcceso').mockResolvedValue(acceso());
      lab('findExamen').mockResolvedValue(examen('completado', `${ORDEN_ID}/${EXAMEN_ID}.pdf`));
      return storage('urlFirmada').mockResolvedValue('https://storage.test/firmada?token=abc');
    };

    test.each(['administrador', 'paciente'] as const)('%s obtiene la URL firmada (10 min)', async (rol) => {
      const firmar = conPdf();

      const res = await request(app)
        .get(`${URL_EXAMEN}/resultado/archivo`)
        .set(await sesionComo(rol));

      expect(res.status).toBe(200);
      expect(ArchivoFirmadoSchema.safeParse(res.body.data).success).toBe(true);
      expect(firmar).toHaveBeenCalledWith(`${ORDEN_ID}/${EXAMEN_ID}.pdf`, 600);
    });

    test('el médico tratante la obtiene; otro doctor → 403', async () => {
      conPdf();
      const esTratante = jest.spyOn(PacientesRepository.prototype, 'esTratante').mockResolvedValueOnce(true);

      const tratante = await request(app)
        .get(`${URL_EXAMEN}/resultado/archivo`)
        .set(await comoPersonal('doctor', PERSONAL_DOCTOR));
      esTratante.mockResolvedValueOnce(false);
      const otro = await request(app)
        .get(`${URL_EXAMEN}/resultado/archivo`)
        .set(await comoPersonal('doctor', 'cccccccc-0000-4000-8000-000000000005'));

      expect(tratante.status).toBe(200);
      expect(otro.status).toBe(403);
    });

    test('recepción no descarga resultados → 403', async () => {
      const res = await request(app)
        .get(`${URL_EXAMEN}/resultado/archivo`)
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(403);
    });

    test('resultado sin PDF → 404', async () => {
      lab('findAcceso').mockResolvedValue(acceso());
      lab('findExamen').mockResolvedValue(examen('completado', null));

      const res = await request(app)
        .get(`${URL_EXAMEN}/resultado/archivo`)
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(404);
    });
  });
});
