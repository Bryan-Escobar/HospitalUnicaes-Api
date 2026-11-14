/* eslint-disable no-console */
// Pruebas de concurrencia (HUNI-78): lanza solicitudes simultáneas contra la API en marcha y comprueba que
// no hay sobrecupo de camas, doble despacho de la ambulancia ni stock negativo en un lote.
//
// Uso:  npm run test:concurrencia -- [--n=20] [--reporte=ruta.md] [--remoto]
//
// Necesita la API levantada (API_URL) contra una base con el seed, y SUPABASE_URL + SUPABASE_ANON_KEY para
// iniciar sesión con las cuentas demo. Al terminar deja libres las camas, la ambulancia y el lote que usó, así
// que se puede repetir las veces que haga falta; quedan los pacientes de prueba (apellido "Concurrencia", se
// reutilizan), el ítem CONC-0001 desactivado y el historial de lo ocurrido. Ver docs/PRUEBAS_CONCURRENCIA.md.
import 'dotenv/config';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const API = (process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/+$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'HospitalDemo2026';
const DOMINIO = 'demo.hospitalunicaes.test';
const N = Number(args.n ?? process.env.CONCURRENCIA_N ?? 20);
const MARCA = 'Concurrencia'; // apellido de los pacientes de prueba y prefijo de los datos que crea el script

const esLocal = (url) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);

const abortar = (mensaje) => {
  console.error(`\n✖ ${mensaje}`);
  process.exit(2);
};

if (!Number.isInteger(N) || N < 2 || N > 100) abortar('--n debe ser un entero entre 2 y 100');
if (!SUPABASE_URL || !ANON_KEY) abortar('Faltan SUPABASE_URL o SUPABASE_ANON_KEY (en .env o como variables)');
if (!args.remoto && !(esLocal(API) && esLocal(SUPABASE_URL))) {
  abortar(
    'La prueba escribe en la base de datos y solo corre contra un entorno local.\n' +
      `  API_URL=${API}\n  SUPABASE_URL=${SUPABASE_URL}\n` +
      '  Levanta Supabase local (supabase start) o pasa --remoto si de verdad quieres usar ese entorno.',
  );
}

// --- HTTP --------------------------------------------------------------------------------------------------

const tokens = {};

const login = async (usuario) => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${usuario}@${DOMINIO}`, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) abortar(`No se pudo iniciar sesión como ${usuario} (HTTP ${res.status})`);
  return body.access_token;
};

const api = async (rol, method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[rol]}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

/** Igual que `api`, pero falla si la respuesta no es 2xx: para preparar y limpiar datos. */
const ok = async (rol, method, path, body) => {
  const res = await api(rol, method, path, body);
  if (res.status < 200 || res.status > 299) {
    throw new Error(`${method} ${path} → ${res.status} ${res.body.code ?? ''} ${res.body.message ?? ''}`);
  }
  return res.body.data;
};

/** Dispara todas las peticiones en el mismo tick y resume las respuestas por estado y código. */
const simultaneas = async (peticiones) => {
  const inicio = performance.now();
  const respuestas = await Promise.all(peticiones.map((p) => p()));
  const ms = Math.round(performance.now() - inicio);
  const exitos = respuestas.filter((r) => r.status >= 200 && r.status <= 299);
  const rechazos = {};
  for (const r of respuestas) {
    if (r.status >= 200 && r.status <= 299) continue;
    const clave = `${r.status} ${r.body.code ?? 'SIN_CODIGO'}`;
    rechazos[clave] = (rechazos[clave] ?? 0) + 1;
  }
  return { respuestas, exitos, rechazos, ms };
};

// --- Resultados --------------------------------------------------------------------------------------------

const resultados = [];

const registrar = (escenario, { lanzadas, exitos, esperados, rechazos, ms, comprobaciones }) => {
  const soloEsperados = Object.keys(rechazos).every((clave) => escenario.rechazosValidos.includes(clave));
  const fallos = [
    ...(exitos === esperados ? [] : [`se esperaban ${esperados} éxitos y hubo ${exitos}`]),
    ...(soloEsperados ? [] : [`rechazos inesperados: ${JSON.stringify(rechazos)}`]),
    ...comprobaciones.filter((c) => !c.ok).map((c) => c.nombre),
  ];
  const resultado = {
    ...escenario,
    lanzadas,
    exitos,
    esperados,
    rechazos,
    ms,
    comprobaciones,
    paso: fallos.length === 0,
  };
  resultados.push(resultado);

  console.log(`\n${resultado.paso ? '✔' : '✖'} ${escenario.nombre}`);
  console.log(`  ${lanzadas} simultáneas en ${ms} ms → ${exitos} éxito(s), esperados ${esperados}`);
  for (const [clave, veces] of Object.entries(rechazos)) console.log(`  ${veces} × ${clave}`);
  for (const c of comprobaciones) console.log(`  ${c.ok ? '✔' : '✖'} ${c.nombre}`);
  for (const f of fallos) console.log(`  FALLA: ${f}`);
};

// --- Preparación -------------------------------------------------------------------------------------------

/** N pacientes de prueba sin hospitalización activa. Se reutilizan entre corridas. */
const prepararPacientes = async (cantidad) => {
  const lista = await ok('recepcionista', 'GET', `/api/pacientes?buscar=${MARCA}&por_pagina=100`);
  const pacientes = lista.items.filter((p) => p.apellidos === MARCA);
  for (let i = pacientes.length; i < cantidad; i++) {
    pacientes.push(
      await ok('recepcionista', 'POST', '/api/pacientes', {
        nombres: `Prueba ${String(i + 1).padStart(3, '0')}`,
        apellidos: MARCA,
      }),
    );
  }
  const elegidos = pacientes.slice(0, cantidad);
  // Si una corrida anterior se interrumpió, puede haber quedado alguno ingresado.
  const activas = await ok('recepcionista', 'GET', '/api/hospitalizaciones?estado=activa&por_pagina=100');
  const ids = new Set(elegidos.map((p) => p.id));
  for (const h of activas.items.filter((h) => ids.has(h.paciente?.id ?? h.paciente_id))) await darAlta(h);
  return elegidos;
};

const darAlta = async (hospitalizacion) => {
  await ok('recepcionista', 'POST', `/api/hospitalizaciones/${hospitalizacion.id}/alta`, {
    notas: 'Prueba de concurrencia',
  });
  // El alta deja la cama en limpieza; se devuelve a disponible para dejar la base como estaba.
  await ok('recepcionista', 'PATCH', `/api/camas/${hospitalizacion.cama.id}/estado`, { estado: 'disponible' });
};

const camasDisponibles = async () => ok('recepcionista', 'GET', '/api/camas?estado=disponible');

const buscarDoctor = async () => {
  const lista = await ok('recepcionista', 'GET', '/api/personal?activo=true&por_pagina=100');
  const doctor = lista.items.find((p) => p.rol === 'doctor');
  if (!doctor) abortar('No hay personal médico activo en la base: ¿falta el seed?');
  return doctor;
};

// --- Escenarios: camas -------------------------------------------------------------------------------------

const camasMismaCama = async (pacientes, doctor) => {
  const escenario = {
    id: 'camas-misma-cama',
    nombre: `Camas: ${N} pacientes distintos piden la misma cama`,
    regla: 'Una cama tiene como máximo un paciente activo',
    rechazosValidos: ['409 CAMA_OCUPADA', '409 CAMA_NO_DISPONIBLE'],
  };
  const [cama] = await camasDisponibles();
  if (!cama) abortar('No hay camas disponibles para la prueba');

  const r = await simultaneas(
    pacientes.map(
      (p) => () =>
        api('recepcionista', 'POST', '/api/hospitalizaciones', {
          paciente_id: p.id,
          doctor_tratante_id: doctor.id,
          cama_id: cama.id,
          motivo_ingreso: 'Prueba de concurrencia',
        }),
    ),
  );

  const activas = await ok('recepcionista', 'GET', '/api/hospitalizaciones?estado=activa&por_pagina=100');
  const enLaCama = activas.items.filter((h) => h.cama.id === cama.id);
  registrar(escenario, {
    lanzadas: pacientes.length,
    exitos: r.exitos.length,
    esperados: 1,
    rechazos: r.rechazos,
    ms: r.ms,
    comprobaciones: [
      { nombre: `La cama ${cama.codigo} queda con 1 hospitalización activa`, ok: enLaCama.length === 1 },
    ],
  });
  for (const h of enLaCama) await darAlta(h);
};

const camasMismoPaciente = async (paciente, doctor) => {
  const camas = (await camasDisponibles()).slice(0, N);
  const escenario = {
    id: 'camas-mismo-paciente',
    nombre: `Camas: el mismo paciente pide ${camas.length} camas distintas a la vez`,
    regla: 'Un paciente ocupa como máximo una cama',
    rechazosValidos: ['409 PACIENTE_YA_HOSPITALIZADO'],
  };

  const r = await simultaneas(
    camas.map(
      (c) => () =>
        api('recepcionista', 'POST', '/api/hospitalizaciones', {
          paciente_id: paciente.id,
          doctor_tratante_id: doctor.id,
          cama_id: c.id,
          motivo_ingreso: 'Prueba de concurrencia',
        }),
    ),
  );

  const activas = await ok(
    'recepcionista',
    'GET',
    `/api/hospitalizaciones?estado=activa&paciente_id=${paciente.id}&por_pagina=100`,
  );
  registrar(escenario, {
    lanzadas: camas.length,
    exitos: r.exitos.length,
    esperados: 1,
    rechazos: r.rechazos,
    ms: r.ms,
    comprobaciones: [{ nombre: 'El paciente queda con 1 hospitalización activa', ok: activas.items.length === 1 }],
  });
  for (const h of activas.items) await darAlta(h);
};

const camasSobrecupo = async (pacientes, doctor) => {
  const libres = await camasDisponibles();
  const porTipo = { vip: 0, semiprivada: 0 };
  for (const c of libres) porTipo[c.habitacion.tipo]++;
  const tipo = porTipo.semiprivada >= porTipo.vip ? 'semiprivada' : 'vip';
  const cupo = porTipo[tipo];
  const escenario = {
    id: 'camas-sobrecupo',
    nombre: `Camas: ${pacientes.length} pacientes piden cama ${tipo} con ${cupo} libres (asignación automática)`,
    regla: 'Nunca se ingresan más pacientes que camas libres, ni dos en la misma cama',
    rechazosValidos: ['409 SIN_CAMAS_DISPONIBLES', '409 CAMA_OCUPADA'],
  };

  const r = await simultaneas(
    pacientes.map(
      (p) => () =>
        api('recepcionista', 'POST', '/api/hospitalizaciones', {
          paciente_id: p.id,
          doctor_tratante_id: doctor.id,
          tipo_habitacion: tipo,
          motivo_ingreso: 'Prueba de concurrencia',
        }),
    ),
  );

  const asignadas = r.exitos.map((e) => e.body.data.cama.id);
  const quedan = (await camasDisponibles()).filter((c) => c.habitacion.tipo === tipo).length;
  registrar(escenario, {
    lanzadas: pacientes.length,
    exitos: r.exitos.length,
    esperados: Math.min(cupo, pacientes.length),
    rechazos: r.rechazos,
    ms: r.ms,
    comprobaciones: [
      { nombre: 'Cada ingreso recibió una cama distinta', ok: new Set(asignadas).size === asignadas.length },
      {
        nombre: `Quedan ${Math.max(cupo - pacientes.length, 0)} camas ${tipo} libres`,
        ok: quedan === Math.max(cupo - pacientes.length, 0),
      },
    ],
  });
  for (const e of r.exitos) await darAlta(e.body.data);
};

// --- Escenarios: ambulancia --------------------------------------------------------------------------------

const exigirAmbulanciaDisponible = async () => {
  const ambulancia = await ok('recepcionista', 'GET', '/api/ambulancia');
  if (ambulancia.estado !== 'disponible') {
    abortar(`La ambulancia está "${ambulancia.estado}": cierra el servicio en curso antes de correr la prueba`);
  }
};

const crearSolicitud = (i) =>
  ok('recepcionista', 'POST', '/api/ambulancia/solicitudes', {
    direccion_origen: `Prueba de concurrencia ${i + 1}`,
    descripcion_emergencia: 'Prueba de concurrencia',
    prioridad: 'urgente',
  });

const cerrarServicio = (solicitud) =>
  ok('recepcionista', 'POST', `/api/ambulancia/solicitudes/${solicitud.id}/cerrar`, {
    descripcion: 'Prueba de concurrencia',
  });

const comprobarAmbulancia = async (solicitudes) => {
  const ambulancia = await ok('recepcionista', 'GET', '/api/ambulancia');
  const estados = await Promise.all(
    solicitudes.map((s) => ok('recepcionista', 'GET', `/api/ambulancia/solicitudes/${s.id}`)),
  );
  const despachadas = estados.filter((s) => s.estado === 'despachada');
  return {
    despachadas,
    comprobaciones: [
      { nombre: 'La ambulancia queda en servicio', ok: ambulancia.estado === 'en_servicio' },
      { nombre: 'Hay exactamente 1 solicitud despachada', ok: despachadas.length === 1 },
    ],
  };
};

const ambulanciaVariasSolicitudes = async () => {
  const escenario = {
    id: 'ambulancia-varias-solicitudes',
    nombre: `Ambulancia: ${N} solicitudes distintas se despachan a la vez`,
    regla: 'La única ambulancia atiende un servicio a la vez',
    rechazosValidos: ['409 AMBULANCIA_NO_DISPONIBLE'],
  };
  await exigirAmbulanciaDisponible();
  const solicitudes = [];
  for (let i = 0; i < N; i++) solicitudes.push(await crearSolicitud(i));

  const r = await simultaneas(
    solicitudes.map((s) => () => api('recepcionista', 'POST', `/api/ambulancia/solicitudes/${s.id}/despachar`)),
  );

  const { despachadas, comprobaciones } = await comprobarAmbulancia(solicitudes);
  registrar(escenario, {
    lanzadas: N,
    exitos: r.exitos.length,
    esperados: 1,
    rechazos: r.rechazos,
    ms: r.ms,
    comprobaciones,
  });
  for (const s of despachadas) await cerrarServicio(s);
  const ganadoras = new Set(despachadas.map((s) => s.id));
  for (const s of solicitudes.filter((s) => !ganadoras.has(s.id))) {
    await ok('recepcionista', 'POST', `/api/ambulancia/solicitudes/${s.id}/cancelar`, {
      motivo: 'Prueba de concurrencia',
    });
  }
};

const ambulanciaMismaSolicitud = async () => {
  const escenario = {
    id: 'ambulancia-misma-solicitud',
    nombre: `Ambulancia: la misma solicitud se despacha ${N} veces a la vez (doble clic)`,
    regla: 'Una solicitud se despacha una sola vez',
    rechazosValidos: ['409 AMBULANCIA_NO_DISPONIBLE', '422 TRANSICION_INVALIDA'],
  };
  await exigirAmbulanciaDisponible();
  const solicitud = await crearSolicitud(0);

  const r = await simultaneas(
    Array.from(
      { length: N },
      () => () => api('recepcionista', 'POST', `/api/ambulancia/solicitudes/${solicitud.id}/despachar`),
    ),
  );

  const { despachadas, comprobaciones } = await comprobarAmbulancia([solicitud]);
  registrar(escenario, {
    lanzadas: N,
    exitos: r.exitos.length,
    esperados: 1,
    rechazos: r.rechazos,
    ms: r.ms,
    comprobaciones,
  });
  for (const s of despachadas) await cerrarServicio(s);
};

// --- Escenario: inventario ---------------------------------------------------------------------------------

const inventarioSalidas = async () => {
  const CANTIDAD = 3;
  // El stock alcanza para ~80 % de las salidas y deja un resto menor que una salida.
  const alcanzan = Math.max(1, Math.floor(N * 0.8));
  const stock = alcanzan * CANTIDAD + (CANTIDAD - 1);
  const escenario = {
    id: 'inventario-salidas',
    nombre: `Inventario: ${N} salidas de ${CANTIDAD} unidades del mismo lote con ${stock} en existencia`,
    regla: 'El stock de un lote nunca queda en negativo',
    rechazosValidos: ['409 STOCK_INSUFICIENTE'],
  };

  const codigo = 'CONC-0001';
  const encontrados = await ok('administrador', 'GET', `/api/inventario?buscar=${codigo}&activo=false`);
  const activos = await ok('administrador', 'GET', `/api/inventario?buscar=${codigo}`);
  let item = [...encontrados.items, ...activos.items].find((i) => i.codigo === codigo);
  if (!item) {
    item = await ok('administrador', 'POST', '/api/inventario', {
      codigo,
      nombre: 'Insumo para pruebas de concurrencia',
      categoria: 'insumo',
      unidad_medida: 'unidad',
    });
  } else if (!item.activo) {
    item = await ok('administrador', 'PATCH', `/api/inventario/${item.id}`, { activo: true });
  }
  const proveedores = await ok('administrador', 'GET', '/api/proveedores?activo=true');
  if (!proveedores.items[0]) abortar('No hay proveedores activos: ¿falta el seed?');

  const caducidad = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const numeroLote = `CONC-${Date.now()}`;
  await ok('administrador', 'POST', `/api/inventario/${item.id}/entradas`, {
    numero_lote: numeroLote,
    fecha_caducidad: caducidad,
    cantidad: stock,
    proveedor_id: proveedores.items[0].id,
    motivo: 'Prueba de concurrencia',
  });
  const buscarLote = async () =>
    (await ok('administrador', 'GET', `/api/inventario/${item.id}/lotes?con_existencias=false`)).find(
      (l) => l.numero_lote === numeroLote,
    );
  const lote = await buscarLote();

  const r = await simultaneas(
    Array.from(
      { length: N },
      () => () =>
        api('administrador', 'POST', `/api/inventario/${item.id}/salidas`, {
          lote_id: lote.id,
          cantidad: CANTIDAD,
          motivo: 'Prueba de concurrencia',
        }),
    ),
  );

  const final = await buscarLote();
  const itemFinal = await ok('administrador', 'GET', `/api/inventario/${item.id}`);
  const esperado = stock - Math.min(alcanzan, N) * CANTIDAD;
  registrar(escenario, {
    lanzadas: N,
    exitos: r.exitos.length,
    esperados: Math.min(alcanzan, N),
    rechazos: r.rechazos,
    ms: r.ms,
    comprobaciones: [
      { nombre: `El lote queda con ${esperado} unidades (nunca negativo)`, ok: final.cantidad_actual === esperado },
      { nombre: 'El stock del ítem coincide con el del lote', ok: itemFinal.stock_actual === final.cantidad_actual },
    ],
  });

  // Se vacía el lote y se desactiva el ítem para que no aparezca en el inventario de la demo.
  if (final.cantidad_actual > 0) {
    await ok('administrador', 'POST', `/api/inventario/${item.id}/ajustes`, {
      lote_id: lote.id,
      cantidad: -final.cantidad_actual,
      motivo: 'Prueba de concurrencia: vaciar el lote',
    });
  }
  await ok('administrador', 'DELETE', `/api/inventario/${item.id}`);
};

// --- Reporte -----------------------------------------------------------------------------------------------

const reporteMarkdown = () => {
  const filas = resultados.map((r) => {
    const rechazos = Object.entries(r.rechazos)
      .map(([clave, veces]) => `${veces} × \`${clave}\``)
      .join('<br>');
    return `| ${r.nombre} | ${r.lanzadas} | ${r.exitos} (esperados ${r.esperados}) | ${rechazos || '—'} | ${r.ms} ms | ${r.paso ? '✅' : '❌'} |`;
  });
  return [
    `Corrida del ${new Date().toISOString()} con N = ${N} contra \`${API}\`.`,
    '',
    '| Escenario | Simultáneas | Éxitos | Rechazos | Duración | Resultado |',
    '|---|---|---|---|---|---|',
    ...filas,
    '',
  ].join('\n');
};

// --- Principal ---------------------------------------------------------------------------------------------

const main = async () => {
  console.log(`Pruebas de concurrencia · N = ${N} · API ${API}`);
  const salud = await fetch(`${API}/health`).catch(() => null);
  if (!salud?.ok) abortar(`La API no responde en ${API}/health: levántala antes (npm run dev)`);

  tokens.administrador = await login('administrador');
  tokens.recepcionista = await login('recepcion');

  const doctor = await buscarDoctor();
  const pacientes = await prepararPacientes(N);

  await camasMismaCama(pacientes, doctor);
  await camasMismoPaciente(pacientes[0], doctor);
  await camasSobrecupo(pacientes, doctor);
  await ambulanciaVariasSolicitudes();
  await ambulanciaMismaSolicitud();
  await inventarioSalidas();

  const fallidos = resultados.filter((r) => !r.paso);
  console.log(`\n${resultados.length - fallidos.length}/${resultados.length} escenarios pasaron`);
  if (typeof args.reporte === 'string') {
    writeFileSync(args.reporte, reporteMarkdown());
    console.log(`Reporte escrito en ${args.reporte}`);
  }
  process.exit(fallidos.length === 0 ? 0 : 1);
};

main().catch((error) => {
  console.error(`\n✖ La prueba se interrumpió: ${error.message}`);
  process.exit(2);
});
