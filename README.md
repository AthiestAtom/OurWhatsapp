# WhatsApp Clone Backend

A scalable, real-time messaging application backend inspired by WhatsApp, built with Node.js, TypeScript, and modern web technologies.

## 🚀 Features

- **Real-time Messaging**: WebSocket-based instant messaging with Socket.IO
- **End-to-End Encryption**: Secure message encryption using AES-256
- **User Authentication**: JWT-based authentication with refresh tokens
- **Contact Management**: Add, remove, and manage contacts
- **Group Conversations**: Create and manage group chats
- **Media Handling**: Upload and share images, videos, and documents
- **Online Status**: Real-time online/offline status tracking
- **Typing Indicators**: See when someone is typing
- **Message Status**: Sent, delivered, read receipts
- **Scalable Architecture**: Microservices-ready design
- **Rate Limiting**: Built-in protection against abuse
- **Comprehensive Error Handling**: Structured error responses

## 🏗️ Architecture

### Core Components

- **Authentication Service**: User registration, login, token management
- **User Management**: Profile management, contact synchronization
- **Messaging Service**: Real-time message delivery, history
- **Media Service**: File upload, storage, CDN integration
- **Notification Service**: Push notifications
- **Encryption Service**: End-to-end encryption key management

### Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST APIs
- **Real-time**: Socket.IO for WebSocket connections
- **Database**: MongoDB (primary) + Redis (caching/sessions)
- **Message Queue**: Redis for async processing
- **File Storage**: AWS S3 compatible storage
- **Security**: JWT, bcrypt, AES encryption

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB 5.0+
- Redis 6.0+
- AWS S3 or MinIO (for media storage)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd whatsapp-clone-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start MongoDB and Redis**
   ```bash
   # Using Docker
   docker-compose up -d mongodb redis
   
   # Or start them locally
   mongod
   redis-server
   ```

5. **Build and run the application**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm run build
   npm start
   ```

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/whatsapp-clone
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
JWT_EXPIRE=24h
JWT_REFRESH_EXPIRE=7d

# Encryption Configuration
ENCRYPTION_KEY=your-32-character-encryption-key-here

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
S3_BUCKET_NAME=whatsapp-clone-media

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
CORS_ORIGIN=http://localhost:3001
```

## 📡 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | User logout |
| POST | `/api/auth/send-verification` | Send verification code |
| POST | `/api/auth/verify-phone` | Check phone availability |

### User Management Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/profile` | Get user profile |
| PUT | `/api/users/profile` | Update user profile |
| GET | `/api/users/contacts` | Get user contacts |
| POST | `/api/users/contacts` | Add contact |
| DELETE | `/api/users/contacts/:contactId` | Remove contact |

### Conversation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | Get user conversations |
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations/:id` | Get conversation details |
| PUT | `/api/conversations/:id` | Update conversation |
| DELETE | `/api/conversations/:id` | Delete conversation |

### Message Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations/:id/messages` | Get conversation messages |
| POST | `/api/conversations/:id/messages` | Send message |
| PUT | `/api/messages/:id/status` | Update message status |
| DELETE | `/api/messages/:id` | Delete message |

### Media Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/media/upload` | Upload media file |
| GET | `/api/media/:fileId` | Get media file |

## 🔌 WebSocket Events

### Client → Server Events

- `join_conversation` - Join a conversation room
- `leave_conversation` - Leave a conversation room
- `send_message` - Send a message
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `mark_read` - Mark message as read
- `get_typing_users` - Get typing users in conversation

### Server → Client Events

- `message_received` - New message received
- `message_status_update` - Message status updated
- `user_online` - User came online
- `user_offline` - User went offline
- `typing_indicator` - Typing indicator update
- `user_joined` - User joined conversation
- `user_left` - User left conversation
- `error` - Error occurred

## 🗄️ Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  phoneNumber: String (unique),
  username: String (unique),
  displayName: String,
  profilePicture: String,
  status: String,
  lastSeen: Date,
  isOnline: Boolean,
  publicKey: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Conversations Collection
```javascript
{
  _id: ObjectId,
  participants: [ObjectId],
  isGroup: Boolean,
  groupName: String (if group),
  groupPicture: String (if group),
  createdBy: ObjectId,
  admins: [ObjectId],
  lastMessage: {
    content: String,
    sender: ObjectId,
    timestamp: Date,
    type: String
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Messages Collection
```javascript
{
  _id: ObjectId,
  conversationId: ObjectId,
  sender: ObjectId,
  content: String,
  type: String,
  metadata: {
    fileName: String,
    fileSize: Number,
    mimeType: String,
    thumbnail: String
  },
  status: String,
  readBy: [{
    user: ObjectId,
    readAt: Date
  }],
  replyTo: ObjectId,
  deletedAt: Date,
  createdAt: Date
}
```

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Refresh Tokens**: Long-lived refresh tokens for better UX
- **Rate Limiting**: Protection against brute force attacks
- **Input Validation**: Comprehensive input sanitization
- **Encryption**: End-to-end message encryption
- **CORS Protection**: Proper cross-origin configuration
- **Helmet.js**: Security headers and protections

## 📊 Monitoring & Logging

- **Structured Logging**: JSON format with correlation IDs
- **Error Tracking**: Comprehensive error handling
- **Health Checks**: Service health monitoring
- **Performance Metrics**: Response time tracking

## 🚀 Deployment

### Docker Deployment

```bash
# Build Docker image
docker build -t whatsapp-clone-backend .

# Run with Docker Compose
docker-compose up -d
```

### Kubernetes Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/
```

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## 📝 Development

### Project Structure

```
src/
├── controllers/     # Request handlers
├── middleware/      # Express middleware
├── models/         # Database models
├── routes/         # API routes
├── services/       # Business logic
├── utils/          # Utility functions
├── types/          # TypeScript definitions
├── database/       # Database connections
└── index.ts        # Application entry point
```

### Code Style

- **ESLint**: Code linting and formatting
- **Prettier**: Code formatting
- **TypeScript**: Type safety
- **Husky**: Git hooks for code quality

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you have any questions or issues, please:

1. Check the [documentation](README.md)
2. Search existing [issues](../../issues)
3. Create a new [issue](../../issues/new)

## 🔮 Roadmap

- [ ] Push notifications (Firebase/APNs)
- [ ] Voice/video calling
- [ ] Message reactions
- [ ] Message search
- [ ] End-to-end encryption implementation
- [ ] Multi-device support
- [ ] Advanced admin panel
- [ ] Analytics dashboard
- [ ] Rate limiting improvements
- [ ] Caching optimizations
- [ ] Database sharding support

---

Built with ❤️ for modern real-time communication
