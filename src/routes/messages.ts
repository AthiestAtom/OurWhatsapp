import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { Message, Conversation, User } from '@/models';
import { getRedisService } from '@/database/redis';
import { EncryptionService } from '@/services/encryptionService';
import { ApiResponse, SendMessageRequest, PaginationQuery, PaginationResult, MessageType } from '@/types';
import { asyncHandler, ValidationError, NotFoundError, AuthorizationError } from '@/middleware/errorHandler';

const router = Router();

let redisServiceInstance: any;
let encryptionServiceInstance: any;

function getRedisServiceInstance() {
  if (!redisServiceInstance) {
    redisServiceInstance = getRedisService();
  }
  return redisServiceInstance;
}

function getEncryptionServiceInstance() {
  if (!encryptionServiceInstance) {
    encryptionServiceInstance = new EncryptionService();
  }
  return encryptionServiceInstance;
}

// Validation schemas
const sendMessageSchema = Joi.object({
  content: Joi.string().when('type', {
    is: 'text',
    then: Joi.string().min(1).max(10000).required(),
    otherwise: Joi.string().optional()
  }),
  type: Joi.string().valid(...Object.values(MessageType)).default(MessageType.TEXT),
  replyTo: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  metadata: Joi.object({
    fileName: Joi.string().optional(),
    fileSize: Joi.number().integer().min(0).optional(),
    mimeType: Joi.string().optional(),
    thumbnail: Joi.string().uri().optional(),
    duration: Joi.number().integer().min(0).optional(), // For audio/video
    latitude: Joi.number().min(-90).max(90).optional(), // For location
    longitude: Joi.number().min(-180).max(180).optional() // For location
  }).optional()
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  before: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(), // Get messages before this message ID
  after: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional()  // Get messages after this message ID
});

const updateMessageStatusSchema = Joi.object({
  status: Joi.string().valid('read').required()
});

// GET /api/conversations/:conversationId/messages - Get conversation messages
router.get('/conversations/:conversationId/messages', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { conversationId } = req.params;
  
  const { error, value } = paginationSchema.validate(req.query);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { page, limit, before, after } = value;

  // Validate conversation ID format
  if (!conversationId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid conversation ID format');
  }

  // Check if conversation exists and user is participant
  const conversation = await Conversation.findById(conversationId);
  
  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new NotFoundError('Conversation');
  }

  // Build query
  let query: any = { 
    conversationId, 
    deletedAt: null 
  };

  // Add before/after filters
  if (before) {
    const beforeMessage = await Message.findById(before);
    if (beforeMessage) {
      query.createdAt = { $lt: beforeMessage.createdAt };
    }
  }

  if (after) {
    const afterMessage = await Message.findById(after);
    if (afterMessage) {
      query.createdAt = { $gt: afterMessage.createdAt };
    }
  }

  // Get messages with pagination
  const skip = (page - 1) * limit;
  const messages = await Message.find(query)
    .populate('sender', 'username displayName profilePicture')
    .populate('replyTo', 'content sender type')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Get total count for pagination
  const total = await Message.countDocuments(query);

  // Decrypt message content for current user
  const decryptedMessages = await Promise.all(
    messages.map(async (message: any) => {
      let decryptedContent = message.content;
      
      try {
        const encryptionService = getEncryptionServiceInstance();
        if (message.encryptedContent && message.type === MessageType.TEXT) {
          decryptedContent = encryptionService.decryptMessage(
            message.encryptedContent,
            message.encryptionKey,
            message.iv
          );
        }
      } catch (error) {
        console.error('Error decrypting message:', error);
        // Keep original content if decryption fails
      }
      
      // Check if message is read by current user
      const isReadByUser = message.isReadBy ? message.isReadBy(req.userId!) : false;
      
      return {
        ...message.toObject(),
        content: decryptedContent,
        isReadByUser
      };
    })
  );

  // Mark messages as delivered if they weren't already
  const undeliveredMessages = messages.filter((msg: any) => msg.status === 'sent');
  if (undeliveredMessages.length > 0) {
    await Promise.all(
      undeliveredMessages.map((msg: any) => msg.markAsDelivered())
    );
  }

  const response: ApiResponse = {
    success: true,
    message: 'Messages retrieved successfully',
    data: {
      messages: decryptedMessages.reverse(), // Return in chronological order
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      conversationId
    }
  };

  res.status(200).json(response);
}));

// POST /api/conversations/:conversationId/messages - Send message
router.post('/conversations/:conversationId/messages', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { conversationId } = req.params;
  
  const { error, value } = sendMessageSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { content, type, replyTo, metadata } = value;

  // Validate conversation ID format
  if (!conversationId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid conversation ID format');
  }

  // Check if conversation exists and user is participant
  const conversation = await Conversation.findById(conversationId);
  
  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new NotFoundError('Conversation');
  }

  // Validate reply-to message if provided
  if (replyTo) {
    const replyMessage = await Message.findById(replyTo);
    if (!replyMessage || replyMessage.conversationId.toString() !== conversationId) {
      throw new ValidationError('Invalid reply-to message');
    }
  }

  // Validate media messages have metadata
  if ([MessageType.IMAGE, MessageType.VIDEO, MessageType.DOCUMENT, MessageType.AUDIO].includes(type) && !metadata) {
    throw new ValidationError('Media messages must include metadata');
  }

  // Get sender's public key for encryption
  const sender = await User.findById(userId);
  if (!sender) {
    throw new NotFoundError('User');
  }

  // Encrypt message content (for text messages)
  let encryptedContent = content;
  if (type === MessageType.TEXT && content) {
    try {
      const encryptionService = getEncryptionServiceInstance();
      const encryption = encryptionService.encryptMessage(content);
      encryptedContent = encryption.encryptedContent;
    } catch (error) {
      throw new ValidationError('Failed to encrypt message');
    }
  }

  // Create message
  const message = new Message({
    conversationId,
    sender: userId,
    content: encryptedContent,
    type,
    replyTo: replyTo || null,
    metadata: metadata || null,
    status: 'sent'
  });

  await message.save();

  // Populate message details
  await message.populate('sender', 'username displayName profilePicture');
  if (replyTo) {
    await message.populate('replyTo', 'content sender type');
  }

  // Update conversation's last message
  await (conversation as any).updateLastMessage({
    content: type === MessageType.TEXT ? content : `[${type}]`,
    sender: userId,
    timestamp: message.createdAt,
    type
  });

  // Get recipient information for WebSocket notification
  const recipients = conversation.participants.filter(
    (p: any) => p.toString() !== userId
  );

  // Send real-time notification via WebSocket
  const io = require('@/index').io;
  const messageData = {
    ...message.toObject(),
    content: type === MessageType.TEXT ? content : message.content // Send original content for real-time
  };

  recipients.forEach((recipient: any) => {
    const recipientId = recipient.toString();
    io.to(`user:${recipientId}`).emit('message_received', {
      message: messageData,
      conversationId
    });
  });

  // Check if recipients are online for delivery status
  let isDelivered = false;
  for (const recipient of recipients) {
    const recipientIdString = recipient.toString();
    const isOnline = await getRedisServiceInstance().isUserOnline(recipientIdString);
    if (isOnline) {
      await (message as any).markAsDelivered();
      isDelivered = true;
      break;
    }
  }

  // Send delivery confirmation if delivered
  if (isDelivered) {
    io.to(`user:${userId}`).emit('message_status_update', {
      messageId: message._id,
      status: 'delivered',
      conversationId
    });
  }

  const response: ApiResponse = {
    success: true,
    message: 'Message sent successfully',
    data: {
      message: {
        ...message.toObject(),
        content: type === MessageType.TEXT ? content : message.content // Return original content to sender
      }
    }
  };

  res.status(201).json(response);
}));

// GET /api/messages/:messageId - Get single message
router.get('/:messageId', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { messageId } = req.params;

  // Validate message ID format
  if (!messageId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid message ID format');
  }

  // Get message
  const message = await Message.findById(messageId)
    .select('+encryptedContent +encryptionKey +iv')
    .populate('sender', 'username displayName profilePicture')
    .populate('replyTo', 'content sender type');

  if (!message) {
    throw new NotFoundError('Message');
  }

  // Check if user is participant in the conversation
  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new AuthorizationError('Access denied');
  }

  // Decrypt content if it's a text message
  let decryptedContent = message.content;
  try {
    if (message.type === MessageType.TEXT) {
      const encryptionService = getEncryptionServiceInstance();
      const messageAny = message as any;
      if (messageAny.encryptedContent) {
        decryptedContent = encryptionService.decryptMessage(
          messageAny.encryptedContent,
          messageAny.encryptionKey,
          messageAny.iv
        );
      }
    }
  } catch (error) {
    console.error('Error decrypting message:', error);
  }

  // Check if message is read by current user
  const isReadByUser = (message as any).isReadBy(userId);

  const response: ApiResponse = {
    success: true,
    message: 'Message retrieved successfully',
    data: {
      message: {
        ...message.toObject(),
        content: decryptedContent,
        isReadByUser
      }
    }
  };

  res.status(200).json(response);
}));

// PUT /api/messages/:messageId/status - Update message status
router.put('/:messageId/status', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { messageId } = req.params;
  
  const { error, value } = updateMessageStatusSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { status } = value;

  // Validate message ID format
  if (!messageId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid message ID format');
  }

  // Get message
  const message = await Message.findById(messageId);
  
  if (!message) {
    throw new NotFoundError('Message');
  }

  // Check if user is participant in the conversation
  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new AuthorizationError('Access denied');
  }

  // Only allow marking as read (delivery is automatic)
  if (status !== 'read') {
    throw new ValidationError('Only "read" status can be updated manually');
  }

  // Don't allow sender to mark their own message as read
  if (message.sender.toString() === userId) {
    throw new ValidationError('Cannot mark your own message as read');
  }

  // Mark as read
  await (message as any).markAsRead(userId);

  // Notify sender via WebSocket
  const io = require('@/index').io;
  io.to(`user:${message.sender}`).emit('message_status_update', {
    messageId,
    status: 'read',
    readBy: userId,
    conversationId: message.conversationId
  });

  const response: ApiResponse = {
    success: true,
    message: 'Message status updated successfully',
    data: {
      messageId,
      status: 'read',
      readAt: new Date()
    }
  };

  res.status(200).json(response);
}));

// DELETE /api/messages/:messageId - Delete message
router.delete('/:messageId', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { messageId } = req.params;

  // Validate message ID format
  if (!messageId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid message ID format');
  }

  // Get message
  const message = await Message.findById(messageId);
  
  if (!message) {
    throw new NotFoundError('Message');
  }

  // Check if user is sender (only sender can delete their own messages)
  if (message.sender.toString() !== userId) {
    throw new AuthorizationError('Only message sender can delete message');
  }

  // Soft delete message
  await (message as any).softDelete();

  // Notify participants via WebSocket
  const conversation = await Conversation.findById(message.conversationId);
  if (conversation) {
    const io = require('@/index').io;
    conversation.participants.forEach((participant: any) => {
      io.to(`user:${participant._id}`).emit('message_deleted', {
        messageId,
        conversationId: message.conversationId
      });
    });
  }

  const response: ApiResponse = {
    success: true,
    message: 'Message deleted successfully',
    data: {
      messageId
    }
  };

  res.status(200).json(response);
}));

// POST /api/messages/:messageId/reactions - Add reaction to message (future feature)
router.post('/:messageId/reactions', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { messageId } = req.params;

  // This is a placeholder for future reaction functionality
  const response: ApiResponse = {
    success: false,
    message: 'Reactions feature not yet implemented',
    error: 'NOT_IMPLEMENTED'
  };

  res.status(501).json(response);
}));

// GET /api/messages/unread - Get unread messages count
router.get('/unread', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  // Get total unread count
  const totalUnread = await (Message as any).countUnreadMessages(userId);
  const conversations = await (Conversation as any).findByParticipant(userId);

  // Get unread count per conversation
  const unreadByConversation = await Promise.all(
    conversations.map(async (conversation: any) => {
      const unreadCount = await (Message as any).countUnreadMessages(userId, conversation._id.toString());
      return {
        conversationId: conversation._id,
        conversationName: conversation.isGroup ? conversation.groupName : 'Private Chat',
        unreadCount
      };
    })
  );

  // Filter to only conversations with unread messages
  const conversationsWithUnread = unreadByConversation.filter((c: any) => c.unreadCount > 0);

  const response: ApiResponse = {
    success: true,
    message: 'Unread messages count retrieved successfully',
    data: {
      totalUnread,
      conversations: conversationsWithUnread
    }
  };

  res.status(200).json(response);
}));

export default router;
