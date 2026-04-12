# WhatsApp Clone Backend - Database Setup

## 🚀 Quick Start with Docker (Recommended)

### Prerequisites
- Docker Desktop installed and running
- Git

### Setup Instructions

1. **Start Database Services:**
```bash
docker-compose up -d
```

2. **Use Docker Environment:**
```bash
cp .env.docker .env
```

3. **Install Dependencies:**
```bash
npm install
```

4. **Start the Server:**
```bash
npm run dev
```

## 📋 Database Services

### MongoDB
- **URL**: `mongodb://whatsapp_user:whatsapp_pass@localhost:27017/whatsapp-clone`
- **Port**: `27017`
- **Database**: `whatsapp-clone`
- **Collections**: users, conversations, messages, contacts

### Redis
- **URL**: `redis://:redis123@localhost:6379`
- **Port**: `6379`
- **Password**: `redis123`

## 🔧 Management Commands

### View Logs
```bash
docker-compose logs -f mongodb
docker-compose logs -f redis
```

### Stop Services
```bash
docker-compose down
```

### Reset Data
```bash
docker-compose down -v
docker-compose up -d
```

### MongoDB Shell Access
```bash
docker exec -it whatsapp-mongodb mongosh -u whatsapp_user -p whatsapp_pass --authenticationDatabase whatsapp-clone
```

### Redis CLI Access
```bash
docker exec -it whatsapp-redis redis-cli -a redis123
```

## 🗄️ Alternative: Manual Installation

### MongoDB (Windows)
1. Download MongoDB Community Server from https://www.mongodb.com/try/download/community
2. Install with default settings
3. Start MongoDB service

### Redis (Windows)
1. Download Redis for Windows from https://github.com/microsoftarchive/redis/releases
2. Extract and run `redis-server.exe`
3. Or use WSL2 with Linux Redis

## 🌐 Cloud Options

### MongoDB Atlas
1. Create free cluster at https://www.mongodb.com/cloud/atlas
2. Get connection string
3. Update `.env` with `MONGODB_URI=mongodb+srv://...`

### Redis Cloud
1. Create free account at https://redis.com/try-free
2. Get connection string
3. Update `.env` with `REDIS_URL=redis://...`

## ✅ Verification

Once databases are running, test the server:
```bash
npm run dev
```

You should see:
```
✅ Connected to MongoDB
✅ Connected to Redis
🚀 Server running on port 3000
📱 WhatsApp Clone Backend
🌍 Environment: development
```

## 🔍 Troubleshooting

### Port Conflicts
If ports 27017 or 6379 are in use, modify `docker-compose.yml` ports:
```yaml
ports:
  - "27018:27017"  # MongoDB on 27018
  - "6380:6379"    # Redis on 6380
```

### Permission Issues
On Windows, ensure Docker Desktop has necessary permissions.

### Connection Issues
Check if containers are running:
```bash
docker ps
```
