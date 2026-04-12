"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
exports.connectRedis = connectRedis;
exports.getRedisClient = getRedisClient;
exports.disconnectRedis = disconnectRedis;
exports.getRedisService = getRedisService;
const redis_1 = require("redis");
let redisClient;
async function connectRedis() {
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        redisClient = (0, redis_1.createClient)({
            url: redisUrl,
            socket: {
                connectTimeout: 5000,
            }
        });
        redisClient.on('error', (error) => {
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
        await redisClient.ping();
        console.log('✅ Redis connection verified');
        return redisClient;
    }
    catch (error) {
        console.error('❌ Failed to connect to Redis:', error);
        throw error;
    }
}
function getRedisClient() {
    if (!redisClient) {
        throw new Error('Redis client not initialized. Call connectRedis() first.');
    }
    return redisClient;
}
async function disconnectRedis() {
    try {
        if (redisClient) {
            await redisClient.quit();
            console.log('✅ Disconnected from Redis');
        }
    }
    catch (error) {
        console.error('❌ Error disconnecting from Redis:', error);
        throw error;
    }
}
class RedisService {
    constructor() {
        this.client = getRedisClient();
    }
    async setSession(userId, sessionData, ttl = 86400) {
        const key = `session:${userId}`;
        await this.client.setEx(key, ttl, JSON.stringify(sessionData));
    }
    async getSession(userId) {
        const key = `session:${userId}`;
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : null;
    }
    async deleteSession(userId) {
        const key = `session:${userId}`;
        await this.client.del(key);
    }
    async setUserOnline(userId, socketId) {
        const key = `online:${userId}`;
        await this.client.setEx(key, 300, socketId);
    }
    async setUserOffline(userId) {
        const key = `online:${userId}`;
        await this.client.del(key);
    }
    async isUserOnline(userId) {
        const key = `online:${userId}`;
        const exists = await this.client.exists(key);
        return exists === 1;
    }
    async getOnlineUsers() {
        const pattern = 'online:*';
        const keys = await this.client.keys(pattern);
        return keys.map((key) => key.replace('online:', ''));
    }
    async enqueueMessage(conversationId, messageData) {
        const key = `queue:messages:${conversationId}`;
        await this.client.lPush(key, JSON.stringify(messageData));
    }
    async dequeueMessage(conversationId) {
        const key = `queue:messages:${conversationId}`;
        const data = await this.client.rPop(key);
        return data ? JSON.parse(data) : null;
    }
    async getMessageQueueLength(conversationId) {
        const key = `queue:messages:${conversationId}`;
        return await this.client.lLen(key);
    }
    async setCache(key, value, ttl = 3600) {
        await this.client.setEx(key, ttl, JSON.stringify(value));
    }
    async getCache(key) {
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : null;
    }
    async deleteCache(key) {
        await this.client.del(key);
    }
    async invalidateCachePattern(pattern) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
            await this.client.del(keys);
        }
    }
    async incrementRateLimit(key, windowMs) {
        const count = await this.client.incr(key);
        if (count === 1) {
            await this.client.pExpire(key, windowMs);
        }
        return count;
    }
    async setTyping(conversationId, userId) {
        const key = `typing:${conversationId}:${userId}`;
        await this.client.setEx(key, 5, 'true');
    }
    async removeTyping(conversationId, userId) {
        const key = `typing:${conversationId}:${userId}`;
        await this.client.del(key);
    }
    async getTypingUsers(conversationId) {
        const pattern = `typing:${conversationId}:*`;
        const keys = await this.client.keys(pattern);
        return keys.map((key) => key.split(':')[2]);
    }
    async setUserSocket(userId, socketId) {
        const key = `socket:${userId}`;
        await this.client.setEx(key, 3600, socketId);
    }
    async getUserSocketId(userId) {
        const key = `socket:${userId}`;
        return await this.client.get(key);
    }
    async removeUserSocket(userId) {
        const key = `socket:${userId}`;
        await this.client.del(key);
    }
    async flushAll() {
        await this.client.flushAll();
    }
    async quit() {
        await this.client.quit();
    }
}
exports.RedisService = RedisService;
let redisService;
function getRedisService() {
    if (!redisService) {
        redisService = new RedisService();
    }
    return redisService;
}
//# sourceMappingURL=redis.js.map