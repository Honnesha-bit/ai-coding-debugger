# Multi-stage Dockerfile for AI Coding Debugger (Production Application Gateway)
# Requires Node.js >= 22.5.0 for native node:sqlite DatabaseSync

# --- Stage 1: Build Frontend Client SPA ---
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy dependency manifests and configuration files
COPY package.json package-lock.json tsconfig.json vite.config.ts ./
COPY client/ ./client/

# Install full dependencies (including devDependencies for TypeScript and Vite build)
RUN npm ci

# Build client production bundle into public/
RUN npm run build

# --- Stage 2: Production Application Runtime (Public Gateway) ---
# Hardened: ZERO Docker CLI binary and ZERO /var/run/docker.sock access.
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/debugger.sqlite \
    SANDBOX_MODE=executor \
    SANDBOX_EXECUTOR_URL=http://sandbox-executor:3001

# Copy manifests and install production-only runtime dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy pre-compiled frontend assets from builder stage
COPY --from=builder /app/public ./public

# Copy backend source code and benchmark evaluation dataset
COPY src/ ./src/
COPY data/held_out_dataset.json ./data/held_out_dataset.json

# Prepare secure database and temporary directories with least-privilege ownership
RUN mkdir -p /app/data /app/temp && \
    chown -R node:node /app && \
    chmod 700 /app/data /app/temp

# Run gateway process as unprivileged user
USER node

# Declare persistent volume mount point for SQLite database
VOLUME ["/app/data"]

EXPOSE 3000

# Lightweight built-in healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
