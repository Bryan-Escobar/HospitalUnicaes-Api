# Despliegue en el VPS con Dokploy (HUNI-99)

Cómo se levanta la API en un VPS con [Dokploy](https://dokploy.com), en los entornos **staging** y
**producción**. Es el mismo mecanismo que usa PragmaCRM-Api.

> **Regla de oro del orden:** primero la migración, después el redeploy. Las migraciones y el seed
> se aplican a mano con Supabase CLI (`supabase db push`, ver README › _Base de datos y
> migraciones_). Si se redespliega antes, la API arranca contra un esquema que todavía no existe.

---

## Cómo se despliega

Dokploy **construye desde Git dentro del VPS**: clona el repositorio, ejecuta `docker build` con el
`Dockerfile` de la raíz y levanta el contenedor. No hay registry de imágenes ni workflow que
publique nada: el único artefacto versionado es el código.

```
supabase db push (a mano) ──► esquema actualizado en Supabase
                                        │
merge a staging / prod ─────────────────┴──► Dokploy: git clone + docker build + run
```

En cada PR, el job `docker-build` de CI construye la misma imagen, espera a que el `HEALTHCHECK`
la marque `healthy` y comprueba que `docker stop` la apaga en orden. Si ese job está verde, Dokploy
puede construirla.

---

## Configuración de la aplicación en Dokploy

Una aplicación por entorno, dentro de un mismo proyecto de Dokploy (p. ej. `HospitalUnicaes`).

| Campo          | staging                                       | prod                                          |
| -------------- | --------------------------------------------- | --------------------------------------------- |
| Tipo           | Application                                   | Application                                   |
| Provider       | GitHub — repositorio `HospitalUnicaes-Api`    | GitHub — repositorio `HospitalUnicaes-Api`    |
| Branch         | `staging`                                     | `prod`                                        |
| Build type     | **Dockerfile** (ruta `./Dockerfile`)          | **Dockerfile** (ruta `./Dockerfile`)          |
| Puerto interno | `3000`                                        | `3000`                                        |
| Start command  | **ninguno** (ver abajo)                       | **ninguno**                                   |
| Auto deploy    | activado (redeploy en cada push a la rama)    | a elección del equipo                         |
| Dominio        | el de staging, con HTTPS (Let's Encrypt)      | el de producción, con HTTPS (Let's Encrypt)   |

### No definir un start command

El `CMD` de la imagen es `node dist/app.js`. Poner `npm start` u otro comando en su lugar rompe el
apagado ordenado: `npm` no reenvía `SIGTERM` al proceso de Node, así que cada redeploy esperaría
los 10 s de gracia de Docker y cortaría las peticiones en curso. Dejar el campo vacío.

### TLS

Traefik (incluido en Dokploy) gestiona el certificado y termina TLS en el borde; el contenedor
habla HTTP dentro de la red de Docker. Activar HTTPS y la redirección de HTTP a HTTPS al crear el
dominio en Dokploy.

`trust proxy` está en `1` (`src/presentation/server.ts`): **un solo proxy** (Traefik). Si más
adelante se pone Cloudflare u otro proxy delante, hay que subir ese número o `req.ip` será la IP
del proxy.

### Memoria

La API es liviana; lo que más memoria usa es la subida de PDFs de laboratorio, que se procesa en
memoria (multer con `memoryStorage`) con un techo de 10 MB por archivo. **256 MB** por contenedor
alcanzan; 512 MB dan margen.

### Healthcheck

La imagen trae `HEALTHCHECK` contra `GET /health`. Es un chequeo de _vida_: responde 200 mientras el
proceso viva, **aunque la base de datos esté caída**. El estado real de la BD viene en el cuerpo
(`data.database: "up" | "down"`): revisarlo en la verificación post-deploy.

---

## Variables de entorno

Se cargan en el panel de Dokploy (pestaña _Environment_ de cada aplicación). **Nunca en el
repositorio**: `.env` está en `.gitignore` y `.dockerignore`. `.env.example` es la referencia de
qué hay que llenar.

| Variable                    | staging                         | prod                             | Nota                                                                                 |
| --------------------------- | ------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `NODE_ENV`                  | `production`                    | `production`                     | Ya viene en la imagen. **Nunca `staging`**: solo acepta `development`, `test`, `production` |
| `PORT`                      | `3000`                          | `3000`                           | Ya viene en la imagen. Debe coincidir con el puerto interno de Dokploy               |
| `DATABASE_URL`              | 🔒 pooler, puerto 6543          | 🔒 pooler, puerto 6543           | Ver nota del pooler                                                                  |
| `DIRECT_URL`                | 🔒 pooler, puerto 5432          | 🔒 pooler, puerto 5432           | Obligatoria al arrancar (`envs.ts` la exige; la usa `prisma db pull`)         |
| `SUPABASE_URL`              | `https://<ref>.supabase.co`     | `https://<ref>.supabase.co`      | De aquí salen el issuer y el JWKS para validar los JWT                               |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔒                              | 🔒                               | Salta RLS. Filtrarla es peor que filtrar `DATABASE_URL`                              |
| `CORS_ORIGINS`              | dominio(s) de la web de staging | dominio(s) de la web de producción | Separados por coma. Las apps iOS/Android no usan CORS                               |
| `LOG_LEVEL`                 | `info`                          | `info`                           | Opcional                                                                             |

🔒 = secreto. No sale del panel de Dokploy ni de la bóveda que use el equipo.

Las variables obligatorias se validan en `src/config/envs.ts`: si falta una, **el proceso no
arranca** y el log dice cuál. Es deliberado: mejor un contenedor que no levanta que uno que sirve
tráfico a medias.

### Un solo proyecto de Supabase

Hoy el Hospital tiene un único proyecto de Supabase, así que **staging y prod comparten base de
datos**: lo que se haga en uno se ve en el otro. Las dos aplicaciones de Dokploy llevan las mismas
credenciales de Supabase y solo cambian el dominio y `CORS_ORIGINS`. Si más adelante se crea un
proyecto aparte para producción, basta con cambiar las cuatro variables de Supabase en la app de
prod.

### Nota del pooler

Muchos VPS salen a internet solo por IPv4 y la conexión directa a Postgres de Supabase es IPv6, así
que `DATABASE_URL` y `DIRECT_URL` deben apuntar al **pooler** (`*.pooler.supabase.com`), igual que
en `.env.example`.

### Rotación de secretos

Cambiar una variable en Dokploy exige redeploy: el proceso las lee una sola vez al arrancar.

---

## Verificación post-deploy

```bash
# 1. Vivo, público y con la BD alcanzable: data.database debe ser "up"
#    (repetirlo si la primera vez dice "down": es la conexión en frío)
curl -s https://<dominio>/health

# 2. Sin token: 401 con code de autenticación (no 500)
curl -i https://<dominio>/api/auth/me

# 3. Con un JWT real: 200 con el usuario y su rol.
#    Prueba de una vez que DATABASE_URL y SUPABASE_URL están bien y que el VPS alcanza el JWKS.
curl -H "Authorization: Bearer $TOKEN" https://<dominio>/api/auth/me

# 4. La documentación del contrato carga
curl -sI https://<dominio>/docs/ | head -1
```

El token de la prueba 3 se obtiene contra `/auth/v1/token?grant_type=password` del proyecto de
Supabase con un usuario del seed (o desde la colección de Postman).

Además, redesplegar con tráfico en curso: ninguna petición debe cortarse. La API cierra
ordenadamente al recibir `SIGTERM` (deja de aceptar conexiones, espera las que están en vuelo hasta
8 s y libera el pool de Postgres).

---

## Rollback

- **De la aplicación:** redeploy del commit anterior desde Dokploy (_Deployments_). Es inmediato,
  porque la imagen se reconstruye desde Git.
- **De la base de datos:** no hay down-migrations. La estrategia es _forward-fix_: una migración
  nueva que corrija. Por eso conviene que las migraciones sean compatibles hacia atrás: así se puede
  volver la aplicación sin tocar el esquema.

---

## Probar la imagen en local

La forma recomendada es Compose, que lee el mismo `.env` del proyecto:

```bash
docker compose up --build -d
curl http://localhost:3000/health
docker inspect --format='{{.State.Health.Status}}' hospitalunicaes-api   # healthy (tras ~30 s)
docker stop hospitalunicaes-api                                          # debe salir en ~1 s
docker compose down
```

> **Ojo con `docker run --env-file .env`:** a diferencia de Compose, no quita las comillas, así que
> `SUPABASE_URL="https://..."` llega con comillas y el arranque falla con _"SUPABASE_URL should be a
> valid URL"_. Para usarlo, el archivo debe tener los valores sin comillas. Lo mismo aplica al
> panel de Dokploy: pegar los valores **sin comillas**.

El primer `/health` justo después de arrancar puede decir `database: "down"`: la primera conexión a
Supabase tarda más que el límite de 2 s del chequeo. A partir del segundo debe decir `"up"`.

Si `docker stop` tarda los 10 s completos, el apagado ordenado dejó de funcionar: la señal no está
llegando al proceso.
