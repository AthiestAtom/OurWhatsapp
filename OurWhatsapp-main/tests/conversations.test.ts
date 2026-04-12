import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { app } from '../src/index';
import { Conversation, User, Message } from '../src/models';
import { getRedisService } from '../src/database/redis';

describe('Conversation Endpoints', () => {
  let server: any;
  let testUser: any;
  let testConversation: any;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-clone-test');
    server = app.listen(0);
  });

  afterAll(async () => {
    await mongoose.connection.close();
    if (server) {
      server.close();
    }
  });

  beforeEach(async () => {
    await Conversation.deleteMany({});
    await User.deleteMany({});
    const redis = getRedisService();
    await redis.flushAll();
  });

  describe('POST /api/conversations', () => {
    beforeEach(async () => {
      testUser = new User({
        username: 'testuser',
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        displayName: 'Test User'
      });
      await testUser.save();
    });

    it('should create a new conversation', async () => {
      const conversationData = {
        isGroup: false,
        participantIds: [testUser._id]
      };

      const response = await request(server)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send(conversationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.isGroup).toBe(false);
      expect(response.body.data.participants).toHaveLength(1);
    });

    it('should create a group conversation', async () => {
      const conversationData = {
        isGroup: true,
        groupName: 'Test Group',
        participantIds: [testUser._id]
      };

      const response = await request(server)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send(conversationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isGroup).toBe(true);
      expect(response.body.data.groupName).toBe('Test Group');
    });

    it('should validate required fields', async () => {
      const response = await request(server)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send({
          // Missing participantIds
          isGroup: false
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });
  });

  describe('GET /api/conversations', () => {
    beforeEach(async () => {
      // Create test conversations
      const user1 = new User({
        username: 'testuser1',
        email: 'test1@example.com',
        phoneNumber: '+1234567891',
        displayName: 'Test User 1'
      });
      await user1.save();

      const user2 = new User({
        username: 'testuser2',
        email: 'test2@example.com',
        phoneNumber: '+1234567892',
        displayName: 'Test User 2'
      });
      await user2.save();

      const conversation1 = new Conversation({
        participants: [user1._id],
        isGroup: false
      });
      await conversation1.save();

      const conversation2 = new Conversation({
        participants: [user1._id, user2._id],
        isGroup: true,
        groupName: 'Test Group'
      });
      await conversation2.save();
    });

    it('should get user conversations', async () => {
      const response = await request(server)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].isGroup).toBe(false);
      expect(response.body.data[1].isGroup).toBe(true);
    });

    it('should paginate conversations', async () => {
      const response = await request(server)
        .get('/api/conversations?page=1&limit=1')
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(1);
    });
  });

  describe('GET /api/conversations/:conversationId', () => {
    beforeEach(async () => {
      // Create test conversation with messages
      const testMessage = new Message({
        conversationId: testConversation._id,
        sender: testUser._id,
        content: 'Test message',
        type: 'text',
        status: 'sent'
      });
      await testMessage.save();
    });

    it('should get conversation details', async () => {
      const response = await request(server)
        .get(`/api/conversations/${testConversation._id}`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.participants).toHaveLength(1);
    });

    it('should return 404 for non-existent conversation', async () => {
      const response = await request(server)
        .get('/api/conversations/nonexistent-id')
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Conversation');
    });
  });

  describe('PUT /api/conversations/:conversationId/participants', () => {
    beforeEach(async () => {
      // Create test conversation
      testConversation = new Conversation({
        participants: [testUser._id],
        isGroup: false
      });
      await testConversation.save();
    });

    it('should add participant to conversation', async () => {
      const newUser = new User({
        username: 'newuser',
        email: 'newuser@example.com',
        phoneNumber: '+1234567899',
        displayName: 'New User'
      });
      await newUser.save();

      const response = await request(server)
        .put(`/api/conversations/${testConversation._id}/participants`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send({
          participantIds: [newUser._id]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should validate participant exists', async () => {
      const response = await request(server)
        .put(`/api/conversations/${testConversation._id}/participants`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send({
          participantIds: ['nonexistent-user-id']
        })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});

// Extend User model for testing
User.prototype.generateAuthToken = function() {
  return 'test-jwt-token';
};
