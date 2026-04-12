# 🚀 WhatsApp Clone Backend - Windows Deployment Guide

## 📋 Quick Start (Windows)

### Option 1: PowerShell Script (Recommended)
```powershell
# Deploy to production
.\deploy.ps1 production

# Deploy to development  
.\deploy.ps1 development
```

### Option 2: Manual Docker Commands
```powershell
# Set environment variables
$env:JWT_SECRET = "your-super-secure-jwt-secret-key-change-this"
$env:ENCRYPTION_KEY = "your-32-character-encryption-key-change-this"

# Build and start production containers
docker-compose -f production-docker-compose.yml up -d --build

# Check status
docker-compose -f production-docker-compose.yml ps
```

## 🔧 Environment Setup

### Step 1: Copy Environment File
```powershell
# Copy production template
Copy-Item ".env.production" ".env"

# Edit with your secrets
notepad .env
```

### Step 2: Update Secrets
Update these values in `.env`:
```bash
JWT_SECRET=your-super-secure-jwt-secret-key-change-this
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-key-change-this
ENCRYPTION_KEY=your-32-character-encryption-key-change-this
```

## 🏗️ Deployment Process

### Build and Start
```powershell
# Production deployment
docker-compose -f production-docker-compose.yml up -d --build

# Watch logs
docker-compose -f production-docker-compose.yml logs -f
```

### Health Verification
```powershell
# Check all services
docker-compose -f production-docker-compose.yml ps

# Test API
curl http://localhost:3000/health

# Check containers
docker ps
```

## 📊 Service URLs

### Local Development
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379

### Production (with domain)
- **Backend API**: https://yourdomain.com/api
- **Health Check**: https://yourdomain.com/health
- **WebSocket**: wss://yourdomain.com/socket.io

## 🔧 Management Commands

### Container Management
```powershell
# View logs
docker-compose -f production-docker-compose.yml logs app

# Stop services
docker-compose -f production-docker-compose.yml down

# Restart services
docker-compose -f production-docker-compose.yml restart

# Scale services
docker-compose -f production-docker-compose.yml up -d --scale app=3
```

### Database Management
```powershell
# Access MongoDB
docker exec -it whatsapp-mongodb-prod mongosh

# Access Redis
docker exec -it whatsapp-redis-prod redis-cli

# Backup MongoDB
docker exec whatsapp-mongodb-prod mongodump --db whatsapp-clone --out backup
```

## 🔒 Security Configuration

### SSL/TLS Setup
```powershell
# Generate self-signed certificate (for testing)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout private.key -out certificate.crt

# Or use Let's Encrypt (for production)
certbot --nginx -d yourdomain.com
```

### Firewall Configuration
```powershell
# Allow required ports
New-NetFirewallRule -DisplayName "WhatsApp Backend" -Direction Inbound -Port 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "MongoDB" -Direction Inbound -Port 27017 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Redis" -Direction Inbound -Port 6379 -Protocol TCP -Action Allow
```

## 📈 Performance Monitoring

### Windows Performance Monitor
```powershell
# Check Docker resource usage
docker stats

# Monitor container health
docker-compose -f production-docker-compose.yml ps

# View system performance
Get-Counter -Counter "\Processor(_Total)\% Processor Time"
Get-Counter -Counter "\Memory\Available MBytes"
```

### Log Analysis
```powershell
# Real-time logs
docker-compose -f production-docker-compose.yml logs -f --tail=100

# Error logs only
docker-compose -f production-docker-compose.yml logs app | Select-String "ERROR"

# Performance logs
docker-compose -f production-docker-compose.yml logs app | Select-String "response time"
```

## 🚨 Troubleshooting

### Common Issues

#### Port Already in Use
```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process
taskkill /PID <PID> /F
```

#### Container Won't Start
```powershell
# Check container logs
docker logs whatsapp-backend-prod

# Check Docker service
Get-Service docker

# Restart Docker service
Restart-Service docker
```

#### Database Connection Issues
```powershell
# Test MongoDB connection
docker exec whatsapp-mongodb-prod mongosh --eval "db.adminCommand('ping')"

# Test Redis connection
docker exec whatsapp-redis-prod redis-cli ping

# Check network connectivity
docker network ls
docker network inspect whatsapp-network-prod
```

#### Memory Issues
```powershell
# Check container memory usage
docker stats --no-stream

# Check system memory
Get-WmiObject -Class Win32_OperatingSystem | Select-Object TotalVisibleMemorySize, FreePhysicalMemory

# Clear Docker cache
docker system prune -f
```

## 🔄 Updates and Maintenance

### Zero-Downtime Updates
```powershell
# Build new image
docker build -f Dockerfile.prod -t whatsapp-backend:new

# Update with rolling restart
docker-compose -f production-docker-compose.yml up -d --no-deps app
```

### Backup Strategy
```powershell
# Automated backup script
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
docker exec whatsapp-mongodb-prod mongodump --db whatsapp-clone --out "backup_$timestamp"

# Compress old backups
Compress-Archive -Path "backup_*" -Destination "backups.zip" -Force
```

### Security Updates
```powershell
# Update base images
docker pull mongo:7.0
docker pull redis:7.2-alpine
docker pull node:18-alpine

# Rebuild with updated images
docker-compose -f production-docker-compose.yml up -d --build
```

## 📞 Support

### Log Locations
- **Application Logs**: Docker container logs
- **System Logs**: Windows Event Viewer
- **Docker Logs**: `%PROGRAMDATA%\Docker\log\`

### Emergency Recovery
```powershell
# Full system restart
Restart-Computer -Force

# Restore from backup
docker exec whatsapp-mongodb-prod mongorestore --db whatsapp-clone backup_file.gz

# Reset to clean state
docker-compose -f production-docker-compose.yml down -v
docker-compose -f production-docker-compose.yml up -d --build
```

---

## 🎉 Success Checklist

### ✅ Pre-Deployment
- [ ] Environment variables configured
- [ ] Secrets generated and secured
- [ ] Firewall rules configured
- [ ] SSL certificates ready (if needed)
- [ ] Backup strategy planned

### ✅ Post-Deployment
- [ ] All containers running healthy
- [ ] Health endpoint responding
- [ ] Database connections working
- [ ] API accessible from browser
- [ ] Logs showing normal operation
- [ ] Monitoring configured

### 🚀 Ready for Production!

Your WhatsApp Clone Backend is now running in production mode on Windows!
