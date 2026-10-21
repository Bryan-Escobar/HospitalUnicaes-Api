# Use Node.js LTS (Long Term Support) version
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema (needed for prisma generate)
COPY prisma ./prisma

# Install all dependencies (including dev dependencies for build)
RUN npm install && \
    npm cache clean --force

# Copy TypeScript config and source code BEFORE prisma generate
# so that the generated Linux client overwrites the macOS one from the repo
COPY tsconfig.json ./
COPY src ./src

# Generate Prisma client for the current platform (Linux)
# This regenerates src/generated/prisma with the correct linux engine
RUN npx prisma generate

# Build TypeScript to JavaScript
RUN npm run build

# Copy Prisma native engine binary to dist
# tsc only compiles .ts files; .node binaries must be copied manually
RUN cp src/generated/prisma/*.node dist/generated/prisma/

# Production stage
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy public folder if needed
COPY public ./public

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the port (adjust if your app uses a different port)
EXPOSE 3000

# Start the application
CMD ["node", "dist/app.js"]