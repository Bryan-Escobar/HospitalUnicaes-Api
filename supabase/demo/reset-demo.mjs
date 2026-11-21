/* eslint-disable no-console */
// HUNI-93: reinicia los datos demo antes de la presentación.
//
// Uso:  npm run demo:reset                      → Supabase local (postgresql://…@127.0.0.1:54322)
//       npm run demo:reset -- --remoto [--si]   → la base de DEMO_DB_URL (producción o staging)
//
// En UNA transacción: vacía los datos de operación (supabase/demo/reset-demo.sql), vuelve a cargar
// supabase/seed.sql (agenda, caducidades y servicios relativos a hoy) y pone la contraseña DEMO_PASSWORD a las
// 10 cuentas demo. Si algo falla, la base queda como estaba. Ver docs/DEMO_DEFENSA.md.
//
// Variables (en .env o en la terminal):
//   DEMO_DB_URL    conexión a la base. En Supabase usa el pooler en modo sesión (puerto 5432) o la conexión
//                  directa, no el de transacción (6543). Por defecto, Supabase local.
//   DEMO_PASSWORD  contraseña de las cuentas demo. En remoto es obligatoria y no puede ser la del repositorio;
//                  compártela solo con el equipo. En local, por defecto queda la del seed.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL_LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const PASSWORD_PUBLICA = 'HospitalDemo2026'; // la que trae seed.sql (está en el repo)
const PREFIJO_DEMO = '11111111-1111-4111-8111-%'; // ids fijos de las cuentas demo en seed.sql

const args = new Set(process.argv.slice(2));
const remoto = args.has('--remoto');

const abortar = (mensaje) => {
  console.error(`\n✖ ${mensaje}`);
  process.exit(2);
};

const dbUrl = process.env.DEMO_DB_URL ?? (remoto ? '' : URL_LOCAL);
if (!dbUrl) abortar('Falta DEMO_DB_URL (la conexión a la base remota) en .env o en la terminal.');

let destino;
try {
  destino = new URL(dbUrl);
} catch {
  abortar('DEMO_DB_URL no es una URL de PostgreSQL válida.');
}
const esLocal = ['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname);

if (!esLocal && !remoto) {
  abortar(`DEMO_DB_URL apunta a ${destino.hostname}. Para reiniciar una base remota pasa --remoto.`);
}
if (destino.port === '6543') {
  abortar('Ese es el pooler en modo transacción (6543). Usa el modo sesión (5432) o la conexión directa.');
}

const password = process.env.DEMO_PASSWORD ?? (esLocal ? PASSWORD_PUBLICA : '');
if (!esLocal) {
  if (!password) abortar('En remoto falta DEMO_PASSWORD: la contraseña de las cuentas demo que conoce el equipo.');
  if (password === PASSWORD_PUBLICA) {
    abortar('En remoto DEMO_PASSWORD no puede ser la contraseña pública del repositorio.');
  }
}
if (password.length < 8) abortar('DEMO_PASSWORD debe tener al menos 8 caracteres.');

const sqlReset = readFileSync(join(RAIZ, 'supabase', 'demo', 'reset-demo.sql'), 'utf8');
const sqlSeed = readFileSync(join(RAIZ, 'supabase', 'seed.sql'), 'utf8');

console.log(`Reinicio de datos demo (HUNI-93) en ${destino.hostname}:${destino.port || 5432}${destino.pathname}`);
console.log('Se borran citas, turnos, consultas, laboratorio, hospitalizaciones, ambulancia, avisos e inventario,');
console.log('y los pacientes y el personal demo o sin cuenta. Luego se vuelve a cargar el seed.');

if (!esLocal && !args.has('--si')) {
  if (!process.stdin.isTTY) abortar('Base remota sin terminal interactiva: confirma con --si.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(`\nEscribe "${destino.hostname}" para continuar: `);
  rl.close();
  if (respuesta.trim() !== destino.hostname) abortar('Cancelado: no se tocó la base.');
}

const client = new pg.Client({
  connectionString: dbUrl,
  // Supabase exige TLS; su certificado no está en el almacén de Node, por eso no se valida la cadena.
  ssl: esLocal ? undefined : { rejectUnauthorized: false },
  application_name: 'hospitalunicaes-reset-demo',
});

const inicio = Date.now();
try {
  await client.connect();
  await client.query('begin');
  await client.query(sqlReset);
  await client.query(sqlSeed);
  const { rowCount } = await client.query(
    `update auth.users
        set encrypted_password = extensions.crypt($1, extensions.gen_salt('bf')), updated_at = now()
      where id::text like $2`,
    [password, PREFIJO_DEMO],
  );
  await client.query('commit');

  const { rows } = await client.query(`
    select
      (select count(*) from auth.users where id::text like '${PREFIJO_DEMO}')                   as cuentas_demo,
      (select count(*) from public.personal)                                                  as personal,
      (select count(*) from public.pacientes)                                                 as pacientes,
      (select count(*) from public.turnos_personal)                                           as turnos,
      (select count(*) from public.citas where fecha_hora > now()
                                          and estado in ('programada', 'confirmada'))         as citas_proximas,
      (select count(*) from public.orden_examenes where estado <> 'completado')              as examenes_en_cola,
      (select count(*) from public.camas where estado = 'ocupada')                            as camas_ocupadas,
      (select count(*) from public.camas)                                                     as camas,
      (select count(*) from public.lotes_inventario
        where cantidad_actual > 0 and fecha_caducidad between public.hoy_local()
                                                          and public.hoy_local() + 15)        as lotes_por_vencer_15d,
      (select count(*) from public.lotes_inventario
        where cantidad_actual > 0 and fecha_caducidad < public.hoy_local())                   as lotes_vencidos,
      (select string_agg(distinct estado::text, ', ' order by estado::text) from public.activos) as estados_equipos,
      (select estado::text from public.ambulancias limit 1)                                   as ambulancia
  `);
  const r = rows[0];
  console.log(`\n✔ Datos demo reiniciados en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  console.log(`  Cuentas demo:           ${r.cuentas_demo} (contraseña actualizada en ${rowCount})`);
  console.log(`  Personal / pacientes:   ${r.personal} / ${r.pacientes}`);
  console.log(`  Turnos / citas próximas: ${r.turnos} / ${r.citas_proximas}`);
  console.log(`  Exámenes en cola:       ${r.examenes_en_cola}`);
  console.log(`  Camas ocupadas:         ${r.camas_ocupadas} de ${r.camas}`);
  console.log(`  Lotes por vencer ≤ 15 d: ${r.lotes_por_vencer_15d} · vencidos con unidades: ${r.lotes_vencidos}`);
  console.log(`  Equipos:                ${r.estados_equipos}`);
  console.log(`  Ambulancia:             ${r.ambulancia}`);
  if (esLocal && password === PASSWORD_PUBLICA) {
    console.log('\n  Contraseña de las cuentas demo: la del seed (local).');
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  abortar(`El reinicio falló y se revirtió; la base quedó como estaba.\n  ${error.message}`);
} finally {
  await client.end().catch(() => {});
}
