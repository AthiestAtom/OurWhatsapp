import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType;

export async function connectRedis(): Promise<RedisClientType> {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 5000,
        // lazyConnect: true, // Removed as it's deprecated
      }
    });

    redisClient.on('error', (error: any) => {
      console.error('❌ Redis error:', error);
    });

    redisClient.on('connect', () => {
      console.log('✅ Connected to Redis');
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Reconnecting to Redis');
    });

    redisClient.on('end', () => {
      console.log('📴 Redis connection ended');
    });

    await redisClient.connect();
    
    // Test connection
    await redisClient.ping();
    console.log('✅ Redis connection verified');
    
    return redisClient;

  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error);
    throw error;
  }
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  try {
    if (redisClient) {
      await redisClient.quit();
      console.log('✅ Disconnected from Redis');
    }
  } catch (error) {
    console.error('❌ Error disconnecting from Redis:', error);
    throw error;
  }
}

// Redis utility functions
export class RedisService {
  private client: RedisClientType;

  constructor() {
    this.client = getRedisClient();
  }

  // Session management
  async setSession(userId: string, sessionData: any, ttl: number = 86400): Promise<void> {
    const key = `session:${userId}`;
    await this.client.setEx(key, ttl, JSON.stringify(sessionData));
  }

  async getSession(userId: string): Promise<any | null> {
    const key = `session:${userId}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(userId: string): Promise<void> {
    const key = `session:${userId}`;
    await this.client.del(key);
  }

  // Online status management
  async setUserOnline(userId: string, socketId: string): Promise<void> {
    const key = `online:${userId}`;
    await this.client.setEx(key, 300, socketId); // 5 minutes TTL
  }

  async setUserOffline(userId: string): Promise<void> {
    const key = `online:${userId}`;
    await this.client.del(key);
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const key = `online:${userId}`;
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  async getOnlineUsers(): Promise<string[]> {
    const pattern = 'online:*';
    const keys = await this.client.keys(pattern);
    return keys.map((key: any) => key.replace('online:', ''));
  }

  // Message queue management
  async enqueueMessage(conversationId: string, messageData: any): Promise<void> {
    const key = `queue:messages:${conversationId}`;
    await this.client.lPush(key, JSON.stringify(messageData));
  }

  async dequeueMessage(conversationId: string): Promise<any | null> {
    const key = `queue:messages:${conversationId}`;
    const data = await this.client.rPop(key);
    return data ? JSON.parse(data) : null;
  }

  async getMessageQueueLength(conversationId: string): Promise<number> {
    const key = `queue:messages:${conversationId}`;
    return await this.client.lLen(key);
  }

  // Cache management
  async setCache(key: string, value: any, ttl: number = 3600): Promise<void> {
    await this.client.setEx(key, ttl, JSON.stringify(value));
  }

  async getCache(key: string): Promise<any | null> {
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deleteCache(key: string): Promise<void> {
    await this.client.del(key);
  }

  async invalidateCachePattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  // Rate limiting
  async incrementRateLimit(key: string, windowMs: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.pExpire(key, windowMs);
    }
    return count;
  }

  // Typing indicators
  async setTyping(conversationId: string, userId: string): Promise<void> {
    const key = `typing:${conversationId}:${userId}`;
    await this.client.setEx(key, 5, 'true'); // 5 seconds TTL
  }

  async removeTyping(conversationId: string, userId: string): Promise<void> {
    const key = `typing:${conversationId}:${userId}`;
    await this.client.del(key);
  }

  async getTypingUsers(conversationId: string): Promise<string[]> {
    const pattern = `typing:${conversationId}:*`;
    const keys = await this.client.keys(pattern);
    return keys.map((key: any) => key.split(':')[2]);
  }

  // Socket connection management
  async setUserSocket(userId: string, socketId: string): Promise<void> {
    const key = `socket:${userId}`;
    await this.client.setEx(key, 3600, socketId); // 1 hour TTL
  }

  async getUserSocketId(userId: string): Promise<string | null> {
    const key = `socket:${userId}`;
    return await this.client.get(key);
  }

  async removeUserSocket(userId: string): Promise<void> {
    const key = `socket:${userId}`;
    await this.client.del(key);
  }

  // Testing utilities
  async flushAll(): Promise<void> {
    await this.client.flushAll();
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}

let redisService: RedisService;

export function getRedisService(): RedisService {
  if (!redisService) {
    redisService = new RedisService();
  }
  return redisService;
}
