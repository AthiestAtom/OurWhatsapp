import { RedisClientType } from 'redis';
export declare function connectRedis(): Promise<RedisClientType>;
export declare function getRedisClient(): RedisClientType;
export declare function disconnectRedis(): Promise<void>;
export declare class RedisService {
    private client;
    constructor();
    setSession(userId: string, sessionData: any, ttl?: number): Promise<void>;
    getSession(userId: string): Promise<any | null>;
    deleteSession(userId: string): Promise<void>;
    setUserOnline(userId: string, socketId: string): Promise<void>;
    setUserOffline(userId: string): Promise<void>;
    isUserOnline(userId: string): Promise<boolean>;
    getOnlineUsers(): Promise<string[]>;
    enqueueMessage(conversationId: string, messageData: any): Promise<void>;
    dequeueMessage(conversationId: string): Promise<any | null>;
    getMessageQueueLength(conversationId: string): Promise<number>;
    setCache(key: string, value: any, ttl?: number): Promise<void>;
    getCache(key: string): Promise<any | null>;
    deleteCache(key: string): Promise<void>;
    invalidateCachePattern(pattern: string): Promise<void>;
    incrementRateLimit(key: string, windowMs: number): Promise<number>;
    setTyping(conversationId: string, userId: string): Promise<void>;
    removeTyping(conversationId: string, userId: string): Promise<void>;
    getTypingUsers(conversationId: string): Promise<string[]>;
    setUserSocket(userId: string, socketId: string): Promise<void>;
    getUserSocketId(userId: string): Promise<string | null>;
    removeUserSocket(userId: string): Promise<void>;
    flushAll(): Promise<void>;
    quit(): Promise<void>;
}
export declare function getRedisService(): RedisService;
//# sourceMappingURL=redis.d.ts.map