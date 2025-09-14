# Dockerfile for Mock OpenEMR API
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
RUN apk add --no-cache \
    dumb-init \
    curl

# Copy package files
COPY package*.json ./
COPY packages/shared-utils/package*.json ./packages/shared-utils/

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy shared utilities
COPY packages/shared-utils ./packages/shared-utils

# Build shared utilities
RUN npm run build --workspace=packages/shared-utils

# Copy mock API server
COPY src/services/openemr-mock-api.ts ./server.ts

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8088

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8088/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the mock server
CMD ["npx", "tsx", "server.ts"]