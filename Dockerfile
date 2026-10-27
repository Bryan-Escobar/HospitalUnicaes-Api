# Imagen de la API. Dokploy la construye desde Git en el VPS (ver docs/DEPLOY_DOKPLOY.md).
# La versión de Node coincide con .nvmrc.

# ---------- Etapa 1: build ----------
# Instala TODAS las dependencias (incluidas las de desarrollo), genera el cliente
# de Prisma para Linux (musl) y compila TypeScript.
FROM node:20-alpine AS builder

# Prisma necesita OpenSSL en Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# El esquema debe estar antes de `npm ci` y de `prisma generate`.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# tsconfig y src se copian ANTES de generar, para que el cliente generado para
# Linux sobrescriba cualquier cliente de otra plataforma.
COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate && npm run build

# tsc solo compila .ts: el motor nativo de Prisma (.node) se copia a mano.
RUN cp src/generated/prisma/*.node dist/generated/prisma/

# ---------- Etapa 2: producción ----------
# Imagen mínima: solo dependencias de runtime, sin código fuente ni devDependencies.
FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Usuario sin privilegios: el proceso no corre como root.
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs

COPY package*.json ./
# --ignore-scripts: el postinstall de Prisma intentaría generar el cliente, que ya viene en dist/.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

# --chown en el COPY en lugar de `chown -R`: no duplica una capa con todo /app.
COPY --chown=nodejs:nodejs --from=builder /app/dist ./dist
COPY --chown=nodejs:nodejs public ./public

USER nodejs

EXPOSE 3000

# /health responde 200 aunque la BD esté caída (el estado de la BD va en el cuerpo),
# así que es un chequeo de "vida" del proceso. fetch es global desde Node 18: no
# hace falta curl ni wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Arranca el binario directo, no `npm start`: así node es el PID 1 y recibe el
# SIGTERM de Docker para el apagado ordenado (npm no reenvía la señal).
CMD ["node", "dist/app.js"]
