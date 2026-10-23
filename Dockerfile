# ---------- Etapa 1: build ----------
FROM node:20-alpine AS builder

# Prisma necesita OpenSSL en Alpine
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

# Genera el cliente de Prisma para Linux (musl) y compila TypeScript
RUN npx prisma generate && npm run build

# tsc solo compila .ts: el motor nativo de Prisma (.node) se copia a mano
RUN cp src/generated/prisma/*.node dist/generated/prisma/

# ---------- Etapa 2: producción ----------
FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY public ./public

# Usuario sin privilegios
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

CMD ["node", "dist/app.js"]
