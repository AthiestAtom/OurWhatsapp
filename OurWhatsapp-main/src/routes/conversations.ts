import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { Conversation, Message, User } from '@/models';
import { getRedisService } from '@/database/redis';
import { ApiResponse, CreateConversationRequest, PaginationQuery, PaginationResult } from '@/types';
import { asyncHandler, ValidationError, NotFoundError, ConflictError, AuthorizationError } from '@/middleware/errorHandler';

let redisServiceInstance: any;

const router = Router();

function getRedisServiceInstance() {
  if (!redisServiceInstance) {
    redisServiceInstance = getRedisService();
  }
  return redisServiceInstance;
}

// Validation schemas
const createConversationSchema = Joi.object({
  participants: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).min(1).max(100).required(),
  isGroup: Joi.boolean().default(false),
  groupName: Joi.string().when('isGroup', {
    is: true,
    then: Joi.string().min(1).max(50).required(),
    otherwise: Joi.string().optional()
  }),
  groupPicture: Joi.string().uri().optional()
});

const updateConversationSchema = Joi.object({
  groupName: Joi.string().min(1).max(50).optional(),
  groupPicture: Joi.string().uri().optional(),
  addParticipants: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).optional(),
  removeParticipants: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).optional(),
  addAdmins: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).optional(),
  removeAdmins: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).optional()
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'lastMessage.timestamp').default('updatedAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// GET /api/conversations - Get user's conversations
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  
  const { error, value } = paginationSchema.validate(req.query);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { page, limit, sortBy, sortOrder } = value;

  // Get conversations where user is a participant
  const conversations = await (Conversation as any).findByParticipant(userId);

  // Add unread counts and online status
  const conversationsWithDetails = await Promise.all(
    conversations.map(async (conversation: any) => {
      const unreadCount = await (Message as any).countUnreadMessages(userId, conversation._id.toString());
      
      // Get online status of participants
      const participantsWithStatus = await Promise.all(
        conversation.participants.map(async (participant: any) => {
          const isOnline = await getRedisServiceInstance().isUserOnline(participant._id.toString());
          return {
            ...participant.toObject(),
            isOnline
          };
        })
      );

      return {
        ...conversation.toObject(),
        participants: participantsWithStatus,
        unreadMessages: unreadCount,
        isGroup: conversation.isGroup,
        lastMessage: conversation.lastMessage
      };
    })
  );

  // Sort conversations
  conversationsWithDetails.sort((a: any, b: any) => {
    const getSortValue = (conv: any) => {
      if (sortBy === 'lastMessage.timestamp' && conv.lastMessage) {
        return new Date(conv.lastMessage.timestamp).getTime();
      }
      return new Date(conv[sortBy]).getTime();
    };

    const aValue = getSortValue(a);
    const bValue = getSortValue(b);

    return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
  });

  // Paginate
  const total = conversationsWithDetails.length;
  const pages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedConversations = conversationsWithDetails.slice(startIndex, endIndex);

  const response: ApiResponse = {
    success: true,
    message: 'Conversations retrieved successfully',
    data: {
      conversations: paginatedConversations,
      pagination: {
        page,
        limit,
        total,
        pages
      }
    }
  };

  res.status(200).json(response);
}));

// POST /api/conversations - Create new conversation
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  
  const { error, value } = createConversationSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { participants, isGroup, groupName, groupPicture } = value;

  // Validate participants exist
  const participantUsers = await User.find({ _id: { $in: participants } });
  if (participantUsers.length !== participants.length) {
    throw new ValidationError('One or more participants do not exist');
  }

  // Check if private conversation already exists
  if (!isGroup && participants.length === 1) {
    const existingConversation = await (Conversation as any).findPrivateConversation(
      userId, 
      participants[0]
    );
    
    if (existingConversation) {
      throw new ConflictError('Private conversation already exists');
    }
  }

  // Ensure creator is included in participants
  const allParticipants = [...new Set([userId, ...participants])];

  // Create conversation
  const conversation = new Conversation({
    participants: allParticipants,
    isGroup,
    groupName: isGroup ? groupName : undefined,
    groupPicture: isGroup ? groupPicture : undefined,
    createdBy: userId,
    admins: isGroup ? [userId] : []
  });

  await conversation.save();

  // Populate participant details
  await conversation.populate('participants', 'username displayName profilePicture isOnline lastSeen');
  await conversation.populate('createdBy', 'username displayName');
  if (isGroup) {
    await conversation.populate('admins', 'username displayName');
  }

  // Notify participants via WebSocket if they're online
  const io = require('@/index').io;
  allParticipants.forEach(async (participantId: any) => {
    if (participantId !== userId) {
      const socketId = await getRedisServiceInstance().getUserSocketId(participantId);
      if (socketId) {
        io.to(`user:${participantId}`).emit('new_conversation', {
          conversation: conversation.toObject()
        });
      }
    }
  });

  const response: ApiResponse = {
    success: true,
    message: 'Conversation created successfully',
    data: {
      conversation: conversation.toObject()
    }
  };

  res.status(201).json(response);
}));

// GET /api/conversations/:id - Get conversation details
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  // Validate conversation ID format
  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid conversation ID format');
  }

  // Get conversation
  const conversation = await Conversation.findById(id)
    .populate('participants', 'username displayName profilePicture isOnline lastSeen')
    .populate('createdBy', 'username displayName')
    .populate('admins', 'username displayName');

  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new AuthorizationError('Access denied');
  }

  // Get unread message count
  const unreadCount = await (Message as any).countUnreadMessages(userId, id);

  // Get last few messages for preview
  const recentMessages = await (Message as any).findByConversation(id, 1, 5);

  const response: ApiResponse = {
    success: true,
    message: 'Conversation retrieved successfully',
    data: {
      conversation: {
        ...conversation.toObject(),
        unreadMessages: unreadCount,
        recentMessages: recentMessages.reverse() // Show newest first
      }
    }
  };

  res.status(200).json(response);
}));

// PUT /api/conversations/:id - Update conversation
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;
  
  const { error, value } = updateConversationSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { 
    groupName, 
    groupPicture, 
    addParticipants, 
    removeParticipants, 
    addAdmins, 
    removeAdmins 
  } = value;

  // Get conversation
  const conversation = await Conversation.findById(id);
  
  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new AuthorizationError('Not a participant in this conversation');
  }

  // Check permissions
  const isCreator = (conversation as any).isCreator(userId);
  const isAdmin = (conversation as any).isAdmin(userId);
  
  // Only creators and admins can update group conversations
  if (conversation.isGroup && !isCreator && !isAdmin) {
    throw new AuthorizationError('Admin privileges required');
  }

  // Update basic info (only for groups)
  if (conversation.isGroup) {
    if (groupName !== undefined) {
      conversation.groupName = groupName;
    }
    
    if (groupPicture !== undefined) {
      conversation.groupPicture = groupPicture;
    }
  }

  // Handle participants (only creators and admins)
  if (isCreator || isAdmin) {
    // Add participants
    if (addParticipants && addParticipants.length > 0) {
      // Validate new participants exist
      const newParticipantUsers = await User.find({ _id: { $in: addParticipants } });
      if (newParticipantUsers.length !== addParticipants.length) {
        throw new ValidationError('One or more participants do not exist');
      }

      for (const participantId of addParticipants) {
        await (conversation as any).addParticipant(participantId);
      }
    }

    // Remove participants
    if (removeParticipants && removeParticipants.length > 0) {
      // Cannot remove creator
      if (removeParticipants.includes(conversation.createdBy.toString())) {
        throw new ValidationError('Cannot remove conversation creator');
      }

      for (const participantId of removeParticipants) {
        await (conversation as any).removeParticipant(participantId);
      }
    }
  }

  // Handle admins (only creators can manage admins)
  if (isCreator) {
    // Add admins
    if (addAdmins && addAdmins.length > 0) {
      for (const adminId of addAdmins) {
        await (conversation as any).addAdmin(adminId);
      }
    }

    // Remove admins
    if (removeAdmins && removeAdmins.length > 0) {
      // Cannot remove creator from admins
      if (removeAdmins.includes(conversation.createdBy.toString())) {
        throw new ValidationError('Cannot remove creator from admins');
      }

      for (const adminId of removeAdmins) {
        await (conversation as any).removeAdmin(adminId);
      }
    }
  }

  await conversation.save();

  // Populate updated details
  await conversation.populate('participants', 'username displayName profilePicture isOnline lastSeen');
  await conversation.populate('createdBy', 'username displayName');
  await conversation.populate('admins', 'username displayName');

  // Notify participants about changes
  const io = require('@/index').io;
  conversation.participants.forEach((participant: any) => {
    io.to(`user:${participant._id}`).emit('conversation_updated', {
      conversationId: id,
      conversation: conversation.toObject()
    });
  });

  const response: ApiResponse = {
    success: true,
    message: 'Conversation updated successfully',
    data: {
      conversation: conversation.toObject()
    }
  };

  res.status(200).json(response);
}));

// DELETE /api/conversations/:id - Delete conversation
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  // Validate conversation ID format
  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid conversation ID format');
  }

  // Get conversation
  const conversation = await Conversation.findById(id);
  
  if (!conversation) {
    throw new NotFoundError('Conversation');
  }
  // Check if user is creator (only creators can transfer ownership)
  if (!(conversation as any).isCreator(userId)) {
    throw new AuthorizationError('Only conversation creator can delete conversation');
  }

  // Delete all messages in the conversation
  await Message.deleteMany({ conversationId: id });

  // Delete the conversation
  await Conversation.findByIdAndDelete(id);

  // Notify participants
  const io = require('@/index').io;
  conversation.participants.forEach((participant: any) => {
    io.to(`user:${participant._id}`).emit('conversation_deleted', {
      conversationId: id
    });
  });

  const response: ApiResponse = {
    success: true,
    message: 'Conversation deleted successfully',
    data: {
      conversationId: id
    }
  };

  res.status(200).json(response);
}));

// POST /api/conversations/:id/leave - Leave conversation
router.post('/:id/leave', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  // Validate conversation ID format
  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid conversation ID format');
  }

  // Get conversation
  const conversation = await Conversation.findById(id);
  
  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new AuthorizationError('Not a participant in this conversation');
  }

  // Cannot leave private conversations, only delete them
  if (!conversation.isGroup) {
    throw new ValidationError('Cannot leave private conversations');
  }

  // Cannot leave if you're the creator
  if ((conversation as any).isCreator(userId)) {
    throw new ValidationError('Conversation creator cannot leave. Transfer ownership or delete conversation.');
  }

  // Remove user from participants
  await (conversation as any).removeParticipant(userId);

  // Notify other participants
  const io = require('@/index').io;
  conversation.participants.forEach((participant: any) => {
    if (participant._id.toString() !== userId) {
      io.to(`user:${participant._id}`).emit('participant_left', {
        conversationId: id,
        userId
      });
    }
  });

  const response: ApiResponse = {
    success: true,
    message: 'Left conversation successfully',
    data: {
      conversationId: id
    }
  };

  res.status(200).json(response);
}));

// GET /api/conversations/:id/participants - Get conversation participants
router.get('/:id/participants', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  // Validate conversation ID format
  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid conversation ID format');
  }

  // Get conversation
  const conversation = await Conversation.findById(id)
    .populate('participants', 'username displayName profilePicture isOnline lastSeen')
    .populate('createdBy', 'username displayName')
    .populate('admins', 'username displayName');

  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new AuthorizationError('Access denied');
  }

  // Add online status to participants
  const participantsWithStatus = await Promise.all(
    conversation.participants.map(async (participant: any) => {
      const isOnline = await getRedisServiceInstance().isUserOnline(participant._id.toString());
      return {
        ...participant.toObject(),
        isOnline,
        isAdmin: (conversation as any).isAdmin(participant._id.toString()),
        isCreator: (conversation as any).isCreator(participant._id.toString())
      };
    })
  );

  const response: ApiResponse = {
    success: true,
    message: 'Participants retrieved successfully',
    data: {
      conversationId: id,
      isGroup: conversation.isGroup,
      groupName: conversation.groupName,
      participants: participantsWithStatus,
      creator: conversation.createdBy,
      admins: conversation.admins
    }
  };

  res.status(200).json(response);
}));

export default router;
