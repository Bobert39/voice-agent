# Monitoring Service Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy dependency files
COPY package*.json ./
COPY packages/monitoring-service/package*.json ./packages/monitoring-service/
COPY packages/shared-utils/package*.json ./packages/shared-utils/

# Install dependencies
RUN npm ci --only=production --legacy-peer-deps

# Build the application
FROM base AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Build monitoring service and its dependencies
RUN npm run build --workspace=@voice-agent/shared-utils
RUN npm run build --workspace=@voice-agent/monitoring-service

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 monitoring
RUN adduser --system --uid 1001 monitoring

# Copy the built application
COPY --from=builder --chown=monitoring:monitoring /app/packages/monitoring-service/dist ./
COPY --from=builder --chown=monitoring:monitoring /app/packages/monitoring-service/package.json ./package.json

# Copy node_modules
COPY --from=deps --chown=monitoring:monitoring /app/node_modules ./node_modules

# Set environment variables
ENV NODE_ENV=production
ENV MONITORING_PORT=3006

# Expose port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "http.get('http://localhost:3006/health', (res) => { \
    if (res.statusCode === 200) process.exit(0); \
    else process.exit(1); \
  }).on('error', () => process.exit(1));"

# Switch to non-root user
USER monitoring

# Start the application
CMD ["node", "index.js"]