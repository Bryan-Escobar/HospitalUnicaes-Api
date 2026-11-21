# Datos y cuentas demo para la defensa (HUNI-93)

Los datos demo salen de `supabase/seed.sql`. `npm run demo:reset` los reinicia desde cero en cualquier
momento, así que la presentación siempre empieza igual. La agenda, las caducidades y los servicios se calculan
a partir del día en que corre el reinicio.

## Cuentas demo (3 doctores, 3 recepcionistas, 3 pacientes y el administrador)

| Rol | Email | Quién es | Dónde entra |
|---|---|---|---|
| **Administrador** | `administrador@demo.hospitalunicaes.test` | Andrea Méndez (EMP-0001) | Web |
| **Doctor** | `doctor@demo.hospitalunicaes.test` | Dr. Roberto Castillo, Medicina interna (EMP-0002) | iOS / Android |
| **Recepcionista/Asistente** | `recepcion@demo.hospitalunicaes.test` | Lucía Herrera (EMP-0003) | Android / Web |
| **Paciente** | `paciente@demo.hospitalunicaes.test` | Carlos Martínez | iOS |
| Doctor (Pediatría, tarde y fines de semana) | `pediatria@demo.hospitalunicaes.test` | Dra. Gabriela Ortiz (EMP-0005) | iOS / Android |
| Doctor (Emergencia, noche) | `emergencia@demo.hospitalunicaes.test` | Dr. Fernando Aguilar (EMP-0006) | iOS / Android |
| Paciente | `paciente2@demo.hospitalunicaes.test` | Ana Sofía Ramírez | iOS |
| Recepcionista/Asistente (Recepcionista, tarde) | `recepcion2@demo.hospitalunicaes.test` | Karla Menjívar (EMP-0010) | Android / Web |
| Recepcionista/Asistente (Asistente, fines de semana) | `recepcion3@demo.hospitalunicaes.test` | Diego Rivas (EMP-0011) | Android / Web |
| Paciente | `paciente3@demo.hospitalunicaes.test` | Luis Alberto Quintanilla | iOS |

**Contraseña**

- **Local:** la del seed (`HospitalDemo2026`). Es pública porque está en el repositorio.
- **Producción:** otra, que se comparte **solo con el equipo** (por el chat privado del grupo, nunca en el
  repositorio, en Jira ni en las diapositivas). `npm run demo:reset -- --remoto` no acepta la contraseña pública.

## Qué muestra cada rol

| Rol | Qué enseñar |
|---|---|
| Administrador | Dashboard (camas, ambulancia, laboratorio), personal de varios tipos, turnos de 24 h, inventario con alertas, avisos públicos e internos |
| Doctor | Agenda del día, consulta abierta de Rosa Elena con examen pendiente, historial de Carlos (consulta cerrada con diagnóstico, receta y laboratorio) |
| Recepcionista | Pacientes y citas, cola de laboratorio (un examen en proceso), asignar cama, 2 solicitudes de ambulancia pendientes y 2 solicitudes de atención |
| Paciente | Sus citas (una próxima confirmada), sus resultados, pedir ambulancia o atención, ver una solicitud rechazada con respuesta |

## Qué datos carga

- **Personal** (11): 3 doctores con cuenta, alergista, 2 enfermeros, 2 recepcionistas y un asistente con cuenta,
  administrativa y un asistente desactivado. Los turnos van de hoy − 7 a hoy + 14 y cubren las 24 horas (incluye un turno nocturno).
- **Pacientes** (9, con expediente): 3 con cuenta, una niña (Pediatría) y uno desactivado.
- **Citas** pasadas (atendidas, canceladas, no asistió) y futuras (programadas y confirmadas), siempre dentro del
  turno del doctor.
- **Laboratorio**: exámenes completados con resultado, uno en proceso y pendientes (uno urgente y uno crítico).
- **Camas**: 4 de 17 ocupadas (VIP-301, VIP-302, HAB-201 y HAB-202) y una hospitalización con traslado y alta en el
  historial.
- **Inventario** (HUNI-97): 3 proveedores (1 desactivado); un lote que vence en 10 días (alerta de ≤ 15 días), uno
  en 25 días, uno ya vencido con unidades y uno debajo del mínimo; equipos en uso, disponible, en mantenimiento y
  dado de baja.
- **Ambulancia** disponible, con historial (servicios finalizados, una falsa alarma y un mantenimiento) y 2
  solicitudes pendientes.
- **Avisos**: públicos e internos vigentes, uno programado y uno vencido.

## Reiniciar los datos antes de la presentación

`supabase/demo/reset-demo.mjs` corre todo en **una transacción**: vacía los datos de operación
(`supabase/demo/reset-demo.sql`), vuelve a cargar el seed y pone la contraseña a las cuentas demo. Si algo falla
no cambia nada.

**Se borra:** citas, turnos, asistencia, consultas, laboratorio, hospitalizaciones, ambulancia, solicitudes,
avisos, el inventario y los pacientes y el personal demo o sin cuenta (todo lo que se creó al probar).
**Se conserva:** el esquema, las 11 habitaciones y 17 camas (quedan disponibles), la ambulancia, los catálogos y
todas las cuentas de Auth. Si una cuenta que no es demo (por ejemplo, la de un integrante) tiene ficha de
paciente o de personal, la ficha se queda, pero sin citas ni historial.

### Local

```bash
supabase start          # si no está levantado
npm run demo:reset
```

### Producción (el día de la defensa)

1. Aplica las migraciones pendientes primero (`supabase db push`, ver `docs/DEPLOY_DOKPLOY.md`).
2. En `.env` (nunca en el repositorio) pon:
   ```bash
   # Supabase Dashboard > Connect > Session pooler (puerto 5432), no el de transacción (6543)
   DEMO_DB_URL="postgresql://postgres.<project-ref>:[PASSWORD]@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
   DEMO_PASSWORD="<la contraseña que conoce el equipo>"
   ```
3. Corre el reinicio y escribe el host cuando lo pida:
   ```bash
   npm run demo:reset -- --remoto
   ```
4. Revisa el resumen que imprime (camas ocupadas, lotes por vencer, citas próximas) e inicia sesión con una
   cuenta de cada rol.

Hazlo **el mismo día** de la presentación: las citas y las alertas de caducidad son relativas a la fecha del
reinicio. Cierra sesión en las apps después de reiniciar: los perfiles y las cuentas no cambian, pero los
datos que tenían en pantalla sí.

> Los archivos de resultados de laboratorio subidos a Storage no se borran; quedan sin referencia y no se muestran.
