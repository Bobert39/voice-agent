# Multi-stage Node.js Dockerfile for microservices
FROM node:20-alpine AS base

# Build argument for service name
ARG SERVICE_NAME

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl

# Development stage
FROM base AS development

# Copy package files
COPY package*.json ./
COPY packages/${SERVICE_NAME}/package*.json ./packages/${SERVICE_NAME}/
COPY packages/shared-utils/package*.json ./packages/shared-utils/

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY packages/${SERVICE_NAME} ./packages/${SERVICE_NAME}
COPY packages/shared-utils ./packages/shared-utils
COPY tsconfig*.json ./

# Build the service and shared utilities
RUN npm run build

# Expose port (will be overridden by compose)
EXPOSE 3000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Development command with nodemon for hot reload
CMD ["npm", "run", "dev", "--workspace", "packages/${SERVICE_NAME}"]

# Production stage
FROM base AS production

# Copy package files
COPY package*.json ./
COPY packages/${SERVICE_NAME}/package*.json ./packages/${SERVICE_NAME}/
COPY packages/shared-utils/package*.json ./packages/shared-utils/

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application
COPY --from=development --chown=nodejs:nodejs /app/packages/${SERVICE_NAME}/dist ./packages/${SERVICE_NAME}/dist
COPY --from=development --chown=nodejs:nodejs /app/packages/shared-utils/dist ./packages/shared-utils/dist

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Production command
CMD ["node", "packages/${SERVICE_NAME}/dist/server.js"]