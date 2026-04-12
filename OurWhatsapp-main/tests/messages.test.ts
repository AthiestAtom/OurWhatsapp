import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { app } from '../src/index';
import { Message, Conversation, User } from '../src/models';
import { getRedisService } from '../src/database/redis';

describe('Message Endpoints', () => {
  let server: any;
  let testUser: any;
  let testConversation: any;
  let testMessage: any;

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
    await Message.deleteMany({});
    await Conversation.deleteMany({});
    await User.deleteMany({});
    const redis = getRedisService();
    await redis.flushAll();
  });

  describe('POST /api/conversations/:conversationId/messages', () => {
    beforeEach(async () => {
      // Create test user and conversation
      testUser = new User({
        username: 'testuser',
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        displayName: 'Test User'
      });
      await testUser.save();

      testConversation = new Conversation({
        participants: [testUser._id],
        isGroup: false
      });
      await testConversation.save();
    });

    it('should send a text message successfully', async () => {
      const messageData = {
        content: 'Hello, this is a test message!',
        type: 'text'
      };

      const response = await request(server)
        .post(`/api/conversations/${testConversation._id}/messages`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send(messageData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.content).toBe('');
      expect(response.body.data.encryptedContent).toBeDefined();
    });

    it('should send an image message successfully', async () => {
      const messageData = {
        content: '', // Media messages have empty content
        type: 'image',
        metadata: {
          fileName: 'test.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg'
        }
      };

      const response = await request(server)
        .post(`/api/conversations/${testConversation._id}/messages`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send(messageData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('image');
      expect(response.body.data.metadata).toBeDefined();
    });

    it('should validate message content', async () => {
      const response = await request(server)
        .post(`/api/conversations/${testConversation._id}/messages`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send({
          type: 'text'
          // Missing content
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });

    it('should validate conversation participation', async () => {
      const response = await request(server)
        .post(`/api/conversations/nonexistent-id/messages`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send({
          content: 'Test message'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Conversation');
    });
  });

  describe('GET /api/conversations/:conversationId/messages', () => {
    beforeEach(async () => {
      // Create test messages
      const messages = [
        new Message({
          conversationId: testConversation._id,
          sender: testUser._id,
          content: 'Message 1',
          type: 'text',
          status: 'sent'
        }),
        new Message({
          conversationId: testConversation._id,
          sender: testUser._id,
          content: 'Message 2',
          type: 'text',
          status: 'delivered'
        })
      ];
      await Message.insertMany(messages);
    });

    it('should retrieve conversation messages with pagination', async () => {
      const response = await request(server)
        .get(`/api/conversations/${testConversation._id}/messages`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toHaveLength(2);
      expect(response.body.data.pagination).toHaveProperty('page');
      expect(response.body.data.pagination).toHaveProperty('total');
    });

    it('should filter messages by status', async () => {
      const response = await request(server)
        .get(`/api/conversations/${testConversation._id}/messages?status=delivered`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toHaveLength(1);
      expect(response.body.data.messages[0].status).toBe('delivered');
    });
  });

  describe('PUT /api/messages/:messageId/status', () => {
    beforeEach(async () => {
      // Create a test message
      testMessage = new Message({
        conversationId: testConversation._id,
        sender: testUser._id,
        content: 'Test message',
        type: 'text',
        status: 'sent'
      });
      await testMessage.save();
    });

    it('should mark message as read', async () => {
      const response = await request(server)
        .put(`/api/messages/${testMessage._id}/status`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send({ status: 'read' })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify message is marked as read
      const updatedMessage = await Message.findById(testMessage._id);
      if (updatedMessage) {
        expect(updatedMessage.status).toBe('read');
      }
    });

    it('should mark message as delivered', async () => {
      const response = await request(server)
        .put(`/api/messages/${testMessage._id}/status`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send({ status: 'delivered' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should validate status value', async () => {
      const response = await request(server)
        .put(`/api/messages/${testMessage._id}/status`)
        .set('Authorization', `Bearer ${testUser.generateAuthToken()}`)
        .send({ status: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('valid');
    });
  });
});

// Extend User model for testing
User.prototype.generateAuthToken = function() {
  return 'test-jwt-token';
};
