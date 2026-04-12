# Docker WSL2 Setup Script - Run as Administrator
Write-Host "🐳 Setting up Docker WSL2 with admin privileges..." -ForegroundColor Green

# Step 1: Enable WSL feature
Write-Host "Step 1: Enabling WSL feature..." -ForegroundColor Yellow
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart

# Step 2: Enable Virtual Machine Platform
Write-Host "Step 2: Enabling Virtual Machine Platform..." -ForegroundColor Yellow
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart

# Step 3: Set WSL2 as default
Write-Host "Step 3: Setting WSL2 as default..." -ForegroundColor Yellow
wsl --set-default-version 2

# Step 4: Install Ubuntu (default distribution)
Write-Host "Step 4: Installing Ubuntu..." -ForegroundColor Yellow
wsl --install -d Ubuntu

# Step 5: Restart Docker Desktop
Write-Host "Step 5: Restarting Docker Desktop..." -ForegroundColor Yellow
Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Step 6: Wait for Docker to initialize
Write-Host "Step 6: Waiting for Docker to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 60

# Step 7: Test Docker
Write-Host "Step 7: Testing Docker..." -ForegroundColor Yellow
docker version
docker ps

Write-Host "✅ Docker setup complete!" -ForegroundColor Green
Write-Host "You can now run: docker-compose up -d" -ForegroundColor Cyan
