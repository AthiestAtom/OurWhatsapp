# WhatsApp Clone Backend - Production Deployment Script (Windows PowerShell)
# Usage: .\deploy.ps1 [environment]

param(
    [Parameter(Mandatory=$false)]
    [string]$Environment = "production"
)

Write-Host "🚀 Deploying WhatsApp Clone Backend to $Environment environment..." -ForegroundColor Green

# Generate secure secrets if not provided
$env:JWT_SECRET = if ([string]::IsNullOrEmpty($env:JWT_SECRET)) { 
    $secret = -join ((1..32) | ForEach-Object { [char](Get-Random -Minimum 33 -Maximum 126) }) 
    Write-Host "🔐 Generated JWT_SECRET: $($secret.Substring(0, 20))..." -ForegroundColor Yellow
    $secret
} else { 
    $env:JWT_SECRET 
}

$env:ENCRYPTION_KEY = if ([string]::IsNullOrEmpty($env:ENCRYPTION_KEY)) { 
    $key = -join ((1..32) | ForEach-Object { "{0:X2}" -f (Get-Random -Minimum 0 -Maximum 255) }) 
    Write-Host "🔒 Generated ENCRYPTION_KEY: $($key.Substring(0, 20))..." -ForegroundColor Yellow
    $key
} else { 
    $env:ENCRYPTION_KEY 
}

# Set environment file
$envFile = ".env.$Environment"
if ($Environment -eq "production") {
    $composeFile = "production-docker-compose.yml"
} else {
    $composeFile = "docker-compose.yml"
}

Write-Host "📝 Using environment file: $envFile" -ForegroundColor Cyan
Write-Host "📝 Using compose file: $composeFile" -ForegroundColor Cyan

# Stop existing containers
Write-Host "🛑 Stopping existing containers..." -ForegroundColor Yellow
try {
    docker-compose -f $composeFile down
} catch {
    Write-Host "⚠️ No containers to stop" -ForegroundColor Yellow
}

# Build and start containers
Write-Host "🔨 Building and starting containers..." -ForegroundColor Blue
try {
    if ($Environment -eq "production") {
        docker-compose -f production-docker-compose.yml up --build -d
    } else {
        docker-compose -f docker-compose.yml up -d
    }
} catch {
    Write-Host "❌ Failed to start containers: $_" -ForegroundColor Red
    exit 1
}

# Wait for services to be ready
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Blue
Start-Sleep -Seconds 30

# Health checks
Write-Host "🏥 Performing health checks..." -ForegroundColor Green

# Check MongoDB
Write-Host "📊 Checking MongoDB..." -ForegroundColor Blue
$mongoReady = $false
for ($i = 1; $i -le 10; $i++) {
    try {
        $result = docker exec whatsapp-mongodb mongosh --eval "db.adminCommand('ping')" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ MongoDB is ready" -ForegroundColor Green
            $mongoReady = $true
            break
        }
    } catch {
        # Continue trying
    }
    Start-Sleep -Seconds 5
}

if (-not $mongoReady) {
    Write-Host "❌ MongoDB failed to start" -ForegroundColor Red
    exit 1
}

# Check Redis
Write-Host "📊 Checking Redis..." -ForegroundColor Blue
$redisReady = $false
for ($i = 1; $i -le 10; $i++) {
    try {
        $result = docker exec whatsapp-redis redis-cli ping 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Redis is ready" -ForegroundColor Green
            $redisReady = $true
            break
        }
    } catch {
        # Continue trying
    }
    Start-Sleep -Seconds 2
}

if (-not $redisReady) {
    Write-Host "❌ Redis failed to start" -ForegroundColor Red
    exit 1
}

# Check Backend API
Write-Host "🌐 Checking Backend API..." -ForegroundColor Blue
$apiReady = $false
for ($i = 1; $i -le 10; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing $false -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Backend API is ready" -ForegroundColor Green
            $apiReady = $true
            break
        }
    } catch {
        # Continue trying
    }
    Start-Sleep -Seconds 5
}

if (-not $apiReady) {
    Write-Host "❌ Backend API failed to start" -ForegroundColor Red
    exit 1
}

# Show running containers
Write-Host "📋 Running containers:" -ForegroundColor Cyan
docker-compose -f $composeFile ps

# Show logs
Write-Host "📋 Recent logs:" -ForegroundColor Cyan
docker-compose -f $composeFile logs --tail=50

# Deployment complete
Write-Host "🎉 Deployment complete!" -ForegroundColor Green
Write-Host "🌐 Backend URL: http://localhost:3000" -ForegroundColor Green
Write-Host "📊 MongoDB: localhost:27017" -ForegroundColor Green
Write-Host "📊 Redis: localhost:6379" -ForegroundColor Green
Write-Host ""

Write-Host "📝 Environment variables:" -ForegroundColor Cyan
Write-Host "   - JWT_SECRET: $($env:JWT_SECRET.Substring(0, 20))..." -ForegroundColor Yellow
Write-Host "   - ENCRYPTION_KEY: $($env:ENCRYPTION_KEY.Substring(0, 20))..." -ForegroundColor Yellow
Write-Host ""

Write-Host "🔧 Management commands:" -ForegroundColor Cyan
Write-Host "   View logs: docker-compose -f $composeFile logs -f" -ForegroundColor White
Write-Host "   Stop services: docker-compose -f $composeFile down" -ForegroundColor White
Write-Host "   Restart: docker-compose -f $composeFile restart" -ForegroundColor White
Write-Host ""
Write-Host "📊 Health check: curl -f http://localhost:3000/health" -ForegroundColor White

# Optional: Open browser for testing
if ($Environment -eq "development") {
    Write-Host "🌐 Opening browser for testing..." -ForegroundColor Blue
    Start-Process "http://localhost:3000/health"
}
