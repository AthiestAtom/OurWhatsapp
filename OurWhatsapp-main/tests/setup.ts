import mongoose from 'mongoose';
import { getRedisService } from '../src/database/redis';

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Connect to test database
  const testDbUri = process.env.MONGODB_URI?.replace('/whatsapp-clone', '/whatsapp-clone-test') || 
    'mongodb://localhost:27017/whatsapp-clone-test';
  
  await mongoose.connect(testDbUri);
  
  // Clear Redis
  const redis = getRedisService();
  await redis.flushAll();
});

// Global test cleanup
afterAll(async () => {
  // Disconnect from database
  await mongoose.connection.close();
  
  // Close Redis connection
  const redis = getRedisService();
  await redis.quit();
});

// Cleanup after each test
afterEach(async () => {
  // Clear all collections
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
  
  // Clear Redis
  const redis = getRedisService();
  await redis.flushAll();
});
