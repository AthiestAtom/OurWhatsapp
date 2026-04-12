# 🚀 WhatsApp Clone Backend - Production Deployment Guide

## 📋 Prerequisites

### System Requirements
- **Docker**: 20.10+ with Docker Compose
- **Docker Desktop**: For local development
- **Node.js**: 18+ (already in Dockerfile)
- **Memory**: Minimum 4GB RAM
- **Storage**: Minimum 10GB free space

### Environment Setup
- **Production Server**: Linux/Unix with Docker
- **Local Development**: Windows with Docker Desktop
- **Cloud Provider**: AWS, Azure, GCP, or DigitalOcean

## 🏗️ Deployment Options

### Option 1: Docker Compose (Recommended)
```bash
# For Production
./deploy.sh production

# For Development
./deploy.sh development
```

### Option 2: Kubernetes
```bash
# Build and push to registry
docker build -f Dockerfile.prod -t whatsapp-backend:latest
docker push your-registry/whatsapp-backend

# Deploy to Kubernetes
kubectl apply -f k8s-deployment.yaml
```

### Option 3: Cloud Services
- **MongoDB Atlas**: Use connection string from `.env.production`
- **Redis Cloud**: Use connection string from `.env.production`
- **AWS ECS**: Deploy as container service
- **Azure Container Instances**: Deploy with App Service

## 🔧 Configuration

### Environment Variables
Copy `.env.production` to `.env` and update:

```bash
# Database
MONGODB_URI=mongodb://admin:your-secure-password@mongodb:27017/whatsapp-clone?authSource=admin
REDIS_URL=redis://:your-redis-password@redis:6379

# Security (Generate new secrets)
JWT_SECRET=your-super-secure-jwt-secret-key-change-this
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-key-change-this
ENCRYPTION_KEY=your-32-character-encryption-key-change-this

# Server
NODE_ENV=production
PORT=3000
```

### Production Docker Compose
```bash
# Scale services
docker-compose -f production-docker-compose.yml up -d --scale app=3

# Update services
docker-compose -f production-docker-compose.yml up -d --no-deps app
```

## 🔒 Security Configuration

### SSL/TLS Setup
```bash
# Generate SSL certificates
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout private.key -out certificate.crt

# Configure nginx for SSL
server {
    listen 443 ssl;
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    location / {
        proxy_pass http://localhost:3000;
    }
}
```

### Firewall Configuration
```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 3000/tcp  # Backend (if direct access)
ufw enable
```

## 📊 Monitoring & Logging

### Application Monitoring
```bash
# Health check endpoint
curl -f http://localhost:3000/health

# Container logs
docker-compose -f production-docker-compose.yml logs -f

# Resource usage
docker stats
```

### Log Management
```bash
# Rotate logs
logrotate -f /var/log/whatsapp-backend/*.log

# Centralized logging
docker-compose -f production-docker-compose.yml logs | jq -r '.[] | select(.timestamp > now - 3600)'
```

## 🔧 Performance Optimization

### Database Optimization
```javascript
// MongoDB indexes
db.messages.createIndex({ conversationId: 1, createdAt: -1 });
db.messages.createIndex({ sender: 1, createdAt: -1 });
db.messages.createIndex({ status: 1, createdAt: -1 });

// Redis caching
await redis.setEx(`user:${userId}`, 3600, sessionData);
```

### Application Performance
```bash
# Set Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096"

# Enable clustering
PM2_MODE=cluster
PM2_INSTANCES=4
```

## 🚀 CI/CD Pipeline

### GitHub Actions
```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to production
        run: |
          docker build -f Dockerfile.prod -t whatsapp-backend:${{ github.sha }}
          docker push ${{ secrets.DOCKER_REGISTRY }}/whatsapp-backend
```

### Environment-Specific Deployment

#### AWS ECS
```bash
# Create task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json

# Update service
aws ecs update-service --cluster whatsapp-cluster --service whatsapp-backend --task-definition whatsapp-backend
```

#### Azure Container Instances
```bash
# Create container instance
az container create \
  --resource-group whatsapp-rg \
  --name whatsapp-backend \
  --image whatsapp-backend:latest \
  --ports 3000 \
  --environment-variables NODE_ENV=production
```

## 🔧 Troubleshooting

### Common Issues
```bash
# Container not starting
docker logs whatsapp-backend-prod

# Database connection failed
docker exec whatsapp-mongodb mongosh --eval "db.adminCommand('ping')"

# Memory issues
docker stats --no-stream

# Port conflicts
netstat -tulpn | grep :3000
```

### Performance Issues
```bash
# Slow queries
db.setProfilingLevel(2)
db.system.profile({ millis: 100 })

# Memory leaks
node --inspect app.js
```

## 📚 Documentation

### API Documentation
- Generate with Swagger/OpenAPI
- Include authentication examples
- Document error responses

### Architecture Documentation
- System design overview
- Database schema documentation
- Security implementation details

### Deployment Runbook
- Step-by-step deployment procedures
- Rollback procedures
- Emergency response plans

## 🎯 Success Criteria

### Deployment Success
- [ ] All containers running and healthy
- [ ] Health endpoints responding correctly
- [ ] Database connections established
- [ ] SSL/TLS configured (if required)
- [ ] Monitoring and logging active
- [ ] Load balancer configured (if scaling)

### Performance Benchmarks
- [ ] API response time < 200ms (95th percentile)
- [ ] Database query time < 100ms (average)
- [ ] Memory usage < 1GB per container
- [ ] CPU usage < 50% per container
- [ ] Zero security vulnerabilities in scan

## 🆘 Support & Maintenance

### Backup Strategy
```bash
# Database backups
mongodump --db whatsapp-clone --out backup-$(date +%Y%m%d).gz

# Application backups
docker exec whatsapp-backend-prod tar -czf backup-$(date +%Y%m%d).tar.gz /app/dist
```

### Update Process
```bash
# Zero downtime deployment
docker-compose -f production-docker-compose.yml up -d --no-deps app

# Rolling updates
docker-compose -f production-docker-compose.yml up -d --scale app=2 --no-deps app
```

### Security Maintenance
```bash
# Update dependencies
docker-compose -f production-docker-compose.yml exec app npm audit fix

# Security scanning
docker scan whatsapp-backend:latest
```

## 📞 Emergency Procedures

### Service Recovery
```bash
# Restart all services
docker-compose -f production-docker-compose.yml restart

# Database recovery
docker exec whatsapp-mongodb mongosh --eval "db.repairDatabase()"

# Full restore from backup
mongorestore --db whatsapp-clone backup-20240330.gz
```

### Incident Response
1. **Immediate Assessment**: Check all service health
2. **Communication**: Notify stakeholders with impact assessment
3. **Isolation**: Route traffic to healthy instances
4. **Resolution**: Fix underlying issue and verify
5. **Post-mortem**: Document root cause and prevention measures

---

**🎉 Your WhatsApp Clone Backend is Production-Ready!**
