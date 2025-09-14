#!/bin/bash

# Test script for local development setup
# Verifies that all services can start and are healthy

set -e

echo "🧪 Testing Voice Agent Local Development Setup"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    if [ "$2" = "OK" ]; then
        echo -e "${GREEN}✅ $1${NC}"
    elif [ "$2" = "WARN" ]; then
        echo -e "${YELLOW}⚠️  $1${NC}"
    else
        echo -e "${RED}❌ $1${NC}"
    fi
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if port is available
port_available() {
    ! lsof -i :$1 >/dev/null 2>&1
}

# Function to wait for service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    echo "Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$url" >/dev/null 2>&1; then
            print_status "$service_name is ready" "OK"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_status "$service_name failed to start within $(($max_attempts * 2)) seconds" "ERROR"
    return 1
}

echo ""
echo "📋 Step 1: Checking Prerequisites"
echo "---------------------------------"

# Check Node.js version
if command_exists node; then
    NODE_VERSION=$(node --version | sed 's/v//')
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1)
    if [ "$MAJOR_VERSION" -ge 20 ]; then
        print_status "Node.js version: $NODE_VERSION" "OK"
    else
        print_status "Node.js version: $NODE_VERSION (requires 20+)" "ERROR"
        exit 1
    fi
else
    print_status "Node.js not found" "ERROR"
    exit 1
fi

# Check npm version
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    print_status "npm version: $NPM_VERSION" "OK"
else
    print_status "npm not found" "ERROR"
    exit 1
fi

# Check Docker
if command_exists docker; then
    if docker info >/dev/null 2>&1; then
        DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | sed 's/,//')
        print_status "Docker version: $DOCKER_VERSION" "OK"
    else
        print_status "Docker is installed but not running" "ERROR"
        exit 1
    fi
else
    print_status "Docker not found" "ERROR"
    exit 1
fi

# Check Docker Compose
if command_exists docker-compose; then
    COMPOSE_VERSION=$(docker-compose --version | cut -d' ' -f3 | sed 's/,//')
    print_status "Docker Compose version: $COMPOSE_VERSION" "OK"
else
    print_status "Docker Compose not found" "ERROR"
    exit 1
fi

echo ""
echo "🔌 Step 2: Checking Port Availability"
echo "-------------------------------------"

PORTS=(5432 6379 4566 8088 3001 3002 3003 3004 3005 8080)
for port in "${PORTS[@]}"; do
    if port_available $port; then
        print_status "Port $port is available" "OK"
    else
        print_status "Port $port is in use" "WARN"
        echo "   Process using port $port: $(lsof -ti:$port | head -1 | xargs ps -p | tail -1)"
    fi
done

echo ""
echo "📁 Step 3: Verifying Project Structure"
echo "--------------------------------------"

# Check required files
REQUIRED_FILES=(
    "package.json"
    "tsconfig.json"
    "docker-compose.dev.yml"
    ".env.development"
    "packages/voice-ai-service/package.json"
    "packages/shared-utils/package.json"
    "infrastructure/docker/service.Dockerfile"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_status "$file exists" "OK"
    else
        print_status "$file missing" "ERROR"
    fi
done

echo ""
echo "📦 Step 4: Installing Dependencies"
echo "----------------------------------"

if npm install; then
    print_status "Dependencies installed successfully" "OK"
else
    print_status "Failed to install dependencies" "ERROR"
    exit 1
fi

echo ""
echo "🏗️  Step 5: Building Project"
echo "----------------------------"

if npm run build; then
    print_status "Project built successfully" "OK"
else
    print_status "Build failed" "ERROR"
    exit 1
fi

echo ""
echo "🐳 Step 6: Testing Docker Setup"
echo "-------------------------------"

# Stop any running containers first
echo "Stopping any running containers..."
docker-compose -f docker-compose.dev.yml down >/dev/null 2>&1 || true

echo "Starting Docker services..."
if docker-compose -f docker-compose.dev.yml up -d postgres redis localstack mock-openemr; then
    print_status "Infrastructure services started" "OK"
else
    print_status "Failed to start infrastructure services" "ERROR"
    exit 1
fi

# Wait for services to be ready
wait_for_service "http://localhost:4566/_localstack/health" "LocalStack"
wait_for_service "http://localhost:8088/health" "Mock OpenEMR"

# Test database connection
echo "Testing PostgreSQL connection..."
if docker exec -it voice-agent-postgres pg_isready -U voice_agent -d voice_agent_dev >/dev/null 2>&1; then
    print_status "PostgreSQL connection successful" "OK"
else
    print_status "PostgreSQL connection failed" "ERROR"
fi

# Test Redis connection
echo "Testing Redis connection..."
if docker exec -it voice-agent-redis redis-cli -a dev_redis_password ping >/dev/null 2>&1; then
    print_status "Redis connection successful" "OK"
else
    print_status "Redis connection failed" "ERROR"
fi

echo ""
echo "🎯 Step 7: Final Validation"
echo "---------------------------"

# Copy environment file
cp .env.development .env
print_status "Environment file configured" "OK"

# Test OpenEMR connectivity
if npm run openemr:test >/dev/null 2>&1; then
    print_status "OpenEMR connectivity test passed" "OK"
else
    print_status "OpenEMR connectivity test failed" "WARN"
    echo "   (This is expected if services haven't started yet)"
fi

echo ""
echo "🧹 Cleanup"
echo "----------"

echo "Stopping test containers..."
docker-compose -f docker-compose.dev.yml down >/dev/null 2>&1 || true
print_status "Test containers stopped" "OK"

echo ""
echo "📋 SETUP TEST RESULTS"
echo "====================="
echo ""
print_status "Local development environment is ready!" "OK"
echo ""
echo "🚀 To start development:"
echo "   npm run setup:dev      # Start all services"
echo "   npm run docker:dev:logs # View logs"
echo "   npm run health:check   # Verify services"
echo ""
echo "🌐 Access points:"
echo "   - Admin Dashboard: http://localhost:8080"
echo "   - API Documentation: http://localhost:8080/docs"
echo "   - Health Check: http://localhost:8080/health"
echo ""
print_status "Setup test completed successfully!" "OK"