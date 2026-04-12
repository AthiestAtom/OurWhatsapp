# WhatsApp Clone - System Architecture

## Overview
A scalable, real-time messaging application similar to WhatsApp with focus on security, performance, and user experience.

## Core Components

### 1. Backend Services Architecture

#### Microservices Design
- **Authentication Service**: User registration, login, JWT token management
- **User Management Service**: Profile management, contact synchronization
- **Messaging Service**: Real-time message delivery, message history
- **Media Service**: File upload, storage, and CDN integration
- **Notification Service**: Push notifications, email alerts
- **Encryption Service**: End-to-end encryption key management

#### Technology Stack
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST APIs
- **Real-time**: Socket.IO for WebSocket connections
- **Database**: MongoDB (primary) + Redis (caching/sessions)
- **Message Queue**: RabbitMQ for async processing
- **File Storage**: AWS S3 / MinIO for media files
- **Containerization**: Docker with Kubernetes orchestration

### 2. Database Design

#### MongoDB Collections
```javascript
// Users Collection
{
  _id: ObjectId,
  phoneNumber: String (unique, indexed),
  username: String,
  displayName: String,
  profilePicture: String,
  status: String,
  lastSeen: Date,
  isOnline: Boolean,
  publicKey: String, // For E2E encryption
  createdAt: Date,
  updatedAt: Date
}

// Conversations Collection
{
  _id: ObjectId,
  participants: [ObjectId], // Array of user IDs
  isGroup: Boolean,
  groupName: String (if group),
  groupPicture: String (if group),
  createdBy: ObjectId,
  admins: [ObjectId],
  lastMessage: {
    content: String,
    sender: ObjectId,
    timestamp: Date,
    type: String // text, image, video, document
  },
  createdAt: Date,
  updatedAt: Date
}

// Messages Collection
{
  _id: ObjectId,
  conversationId: ObjectId,
  sender: ObjectId,
  content: String, // Encrypted content
  type: String, // text, image, video, document, location
  metadata: {
    fileName: String,
    fileSize: Number,
    mimeType: String,
    thumbnail: String
  },
  status: String, // sent, delivered, read
  readBy: [{
    user: ObjectId,
    readAt: Date
  }],
  replyTo: ObjectId, // For threaded replies
  deletedAt: Date, // For "delete for everyone"
  createdAt: Date
}

// Contacts Collection
{
  _id: ObjectId,
  userId: ObjectId,
  contacts: [{
    phoneNumber: String,
    displayName: String,
    addedAt: Date
  }],
  updatedAt: Date
}
```

#### Redis Data Structures
- **Sessions**: `session:{userId}` - User session data
- **Online Status**: `online:{userId}` - TTL-based online tracking
- **Message Queue**: `queue:messages:{conversationId}` - Real-time message queue
- **Cache**: `cache:user:{userId}` - Frequently accessed user data

### 3. API Design

#### REST Endpoints
```
Authentication:
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/verify-phone

User Management:
GET /api/users/profile
PUT /api/users/profile
GET /api/users/contacts
POST /api/users/contacts
DELETE /api/users/contacts/{contactId}

Conversations:
GET /api/conversations
POST /api/conversations
GET /api/conversations/{id}
PUT /api/conversations/{id}
DELETE /api/conversations/{id}

Messages:
GET /api/conversations/{id}/messages
POST /api/conversations/{id}/messages
PUT /api/messages/{id}/status
DELETE /api/messages/{id}

Media:
POST /api/media/upload
GET /api/media/{fileId}
```

#### WebSocket Events
```javascript
// Client -> Server
'join_conversation'
'leave_conversation'
'send_message'
'typing_start'
'typing_stop'
'mark_read'

// Server -> Client
'message_received'
'message_status_update'
'user_online'
'user_offline'
'typing_indicator'
'new_conversation'
```

### 4. Security Architecture

#### End-to-End Encryption
- **Signal Protocol**: Double Ratchet algorithm for E2E encryption
- **Key Management**: Each user generates key pairs on device registration
- **Message Encryption**: Messages encrypted with recipient's public key
- **Key Exchange**: X3DH protocol for initial key exchange

#### Security Measures
- **Rate Limiting**: Prevent spam and abuse
- **Input Validation**: Sanitize all inputs
- **CORS Configuration**: Proper cross-origin setup
- **JWT Tokens**: Secure authentication with refresh tokens
- **HTTPS**: All communication encrypted in transit

### 5. Scalability Considerations

#### Horizontal Scaling
- **Load Balancer**: Nginx for HTTP traffic distribution
- **API Gateway**: Kong or similar for routing and rate limiting
- **Database Sharding**: MongoDB sharding by user ID
- **Redis Cluster**: Distributed caching
- **Message Queue Clustering**: RabbitMQ cluster for high availability

#### Performance Optimization
- **Database Indexing**: Proper indexes on frequently queried fields
- **Caching Strategy**: Redis for hot data, CDN for media
- **Connection Pooling**: Efficient database connections
- **Lazy Loading**: Load messages in chunks
- **Compression**: Gzip for API responses

### 6. Real-time Architecture

#### WebSocket Connection Management
- **Connection Pool**: Manage multiple WebSocket connections
- **Room Management**: Socket.IO rooms for conversations
- **Heartbeat**: Keep connections alive with ping/pong
- **Reconnection Logic**: Handle network interruptions

#### Message Delivery
- **Guaranteed Delivery**: Message queue with acknowledgments
- **Offline Storage**: Store messages for offline users
- **Push Notifications**: Firebase/APNs for offline alerts
- **Message Status**: Track sent/delivered/read states

### 7. Monitoring & Observability

#### Logging
- **Structured Logging**: JSON format with correlation IDs
- **Log Levels**: Error, warn, info, debug
- **Log Aggregation**: ELK stack or similar

#### Metrics
- **Application Metrics**: Response times, error rates
- **Business Metrics**: Messages sent, active users
- **Infrastructure Metrics**: CPU, memory, disk usage

#### Health Checks
- **Service Health**: Endpoint health monitoring
- **Database Health**: Connection and query performance
- **Dependency Health**: External service availability

### 8. Deployment Architecture

#### Container Strategy
```dockerfile
# Multi-stage builds for optimized images
# Alpine Linux for smaller footprint
# Health checks built-in
# Environment-based configuration
```

#### Kubernetes Setup
- **Pods**: Individual service containers
- **Services**: Internal service discovery
- **Ingress**: External traffic routing
- **ConfigMaps**: Configuration management
- **Secrets**: Sensitive data management

### 9. Development Workflow

#### CI/CD Pipeline
1. **Code Quality**: ESLint, Prettier, TypeScript checks
2. **Testing**: Unit tests, integration tests, E2E tests
3. **Security**: Dependency scanning, SAST
4. **Build**: Docker image creation
5. **Deploy**: Kubernetes deployment

#### Development Environment
- **Local Development**: Docker Compose setup
- **Database Seeding**: Test data generation
- **Mock Services**: External API mocking
- **Hot Reload**: Development server with auto-restart

## Next Steps
1. Set up basic project structure
2. Implement authentication service
3. Create database models and migrations
4. Set up WebSocket server
5. Implement basic messaging functionality
