#!/bin/bash

# WhatsApp Clone Backend - Production Deployment Script
# Usage: ./deploy.sh [environment]

set -e

# Default environment
ENVIRONMENT=${1:-production}

echo "🚀 Deploying WhatsApp Clone Backend to $ENVIRONMENT environment..."

# Generate secure secrets if not provided
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -base64 32)
    echo "🔐 Generated JWT_SECRET: $JWT_SECRET"
fi

if [ -z "$ENCRYPTION_KEY" ]; then
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo "🔒 Generated ENCRYPTION_KEY: $ENCRYPTION_KEY"
fi

# Set environment file
ENV_FILE=".env.$ENVIRONMENT"
if [ "$ENVIRONMENT" = "production" ]; then
    COMPOSE_FILE="production-docker-compose.yml"
else
    COMPOSE_FILE="docker-compose.yml"
fi

echo "📝 Using environment file: $ENV_FILE"
echo "📝 Using compose file: $COMPOSE_FILE"

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f $COMPOSE_FILE down

# Build and start containers
echo "🔨 Building and starting containers..."
if [ "$ENVIRONMENT" = "production" ]; then
    docker-compose -f production-docker-compose.yml up --build -d
else
    docker-compose -f docker-compose.yml up -d
fi

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Health checks
echo "🏥 Performing health checks..."

# Check MongoDB
echo "📊 Checking MongoDB..."
for i in {1..10}; do
    if docker exec whatsapp-mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        echo "✅ MongoDB is ready"
        break
    fi
    sleep 5
done

# Check Redis
echo "📊 Checking Redis..."
for i in {1..10}; do
    if docker exec whatsapp-redis redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis is ready"
        break
    fi
    sleep 2
done

# Check Backend API
echo "🌐 Checking Backend API..."
for i in {1..10}; do
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo "✅ Backend API is ready"
        break
    fi
    sleep 5
done

# Show running containers
echo "📋 Running containers:"
docker-compose -f $COMPOSE_FILE ps

# Show logs
echo "📋 Recent logs:"
docker-compose -f $COMPOSE_FILE logs --tail=50

# Deployment complete
echo "🎉 Deployment complete!"
echo "🌐 Backend URL: http://localhost:3000"
echo "📊 MongoDB: localhost:27017"
echo "📊 Redis: localhost:6379"
echo ""
echo "📝 Environment variables:"
echo "   - JWT_SECRET: ${JWT_SECRET:0:20}..."
echo "   - ENCRYPTION_KEY: ${ENCRYPTION_KEY:0:20}..."
echo ""
echo "🔧 Management commands:"
echo "   View logs: docker-compose -f $COMPOSE_FILE logs -f"
echo "   Stop services: docker-compose -f $COMPOSE_FILE down"
echo "   Restart: docker-compose -f $COMPOSE_FILE restart"
echo ""
echo "📊 Health check: curl -f http://localhost:3000/health"
