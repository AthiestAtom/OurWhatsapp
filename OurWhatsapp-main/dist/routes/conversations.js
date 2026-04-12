"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const models_1 = require("@/models");
const redis_1 = require("@/database/redis");
const errorHandler_1 = require("@/middleware/errorHandler");
let redisServiceInstance;
const router = (0, express_1.Router)();
function getRedisServiceInstance() {
    if (!redisServiceInstance) {
        redisServiceInstance = (0, redis_1.getRedisService)();
    }
    return redisServiceInstance;
}
const createConversationSchema = joi_1.default.object({
    participants: joi_1.default.array().items(joi_1.default.string().pattern(/^[0-9a-fA-F]{24}$/)).min(1).max(100).required(),
    isGroup: joi_1.default.boolean().default(false),
    groupName: joi_1.default.string().when('isGroup', {
        is: true,
        then: joi_1.default.string().min(1).max(50).required(),
        otherwise: joi_1.default.string().optional()
    }),
    groupPicture: joi_1.default.string().uri().optional()
});
const updateConversationSchema = joi_1.default.object({
    groupName: joi_1.default.string().min(1).max(50).optional(),
    groupPicture: joi_1.default.string().uri().optional(),
    addParticipants: joi_1.default.array().items(joi_1.default.string().pattern(/^[0-9a-fA-F]{24}$/)).optional(),
    removeParticipants: joi_1.default.array().items(joi_1.default.string().pattern(/^[0-9a-fA-F]{24}$/)).optional(),
    addAdmins: joi_1.default.array().items(joi_1.default.string().pattern(/^[0-9a-fA-F]{24}$/)).optional(),
    removeAdmins: joi_1.default.array().items(joi_1.default.string().pattern(/^[0-9a-fA-F]{24}$/)).optional()
});
const paginationSchema = joi_1.default.object({
    page: joi_1.default.number().integer().min(1).default(1),
    limit: joi_1.default.number().integer().min(1).max(50).default(20),
    sortBy: joi_1.default.string().valid('createdAt', 'updatedAt', 'lastMessage.timestamp').default('updatedAt'),
    sortOrder: joi_1.default.string().valid('asc', 'desc').default('desc')
});
router.get('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { error, value } = paginationSchema.validate(req.query);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { page, limit, sortBy, sortOrder } = value;
    const conversations = await models_1.Conversation.findByParticipant(userId);
    const conversationsWithDetails = await Promise.all(conversations.map(async (conversation) => {
        const unreadCount = await models_1.Message.countUnreadMessages(userId, conversation._id.toString());
        const participantsWithStatus = await Promise.all(conversation.participants.map(async (participant) => {
            const isOnline = await getRedisServiceInstance().isUserOnline(participant._id.toString());
            return {
                ...participant.toObject(),
                isOnline
            };
        }));
        return {
            ...conversation.toObject(),
            participants: participantsWithStatus,
            unreadMessages: unreadCount,
            isGroup: conversation.isGroup,
            lastMessage: conversation.lastMessage
        };
    }));
    conversationsWithDetails.sort((a, b) => {
        const getSortValue = (conv) => {
            if (sortBy === 'lastMessage.timestamp' && conv.lastMessage) {
                return new Date(conv.lastMessage.timestamp).getTime();
            }
            return new Date(conv[sortBy]).getTime();
        };
        const aValue = getSortValue(a);
        const bValue = getSortValue(b);
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });
    const total = conversationsWithDetails.length;
    const pages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedConversations = conversationsWithDetails.slice(startIndex, endIndex);
    const response = {
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
router.post('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { error, value } = createConversationSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { participants, isGroup, groupName, groupPicture } = value;
    const participantUsers = await models_1.User.find({ _id: { $in: participants } });
    if (participantUsers.length !== participants.length) {
        throw new errorHandler_1.ValidationError('One or more participants do not exist');
    }
    if (!isGroup && participants.length === 1) {
        const existingConversation = await models_1.Conversation.findPrivateConversation(userId, participants[0]);
        if (existingConversation) {
            throw new errorHandler_1.ConflictError('Private conversation already exists');
        }
    }
    const allParticipants = [...new Set([userId, ...participants])];
    const conversation = new models_1.Conversation({
        participants: allParticipants,
        isGroup,
        groupName: isGroup ? groupName : undefined,
        groupPicture: isGroup ? groupPicture : undefined,
        createdBy: userId,
        admins: isGroup ? [userId] : []
    });
    await conversation.save();
    await conversation.populate('participants', 'username displayName profilePicture isOnline lastSeen');
    await conversation.populate('createdBy', 'username displayName');
    if (isGroup) {
        await conversation.populate('admins', 'username displayName');
    }
    const io = require('@/index').io;
    allParticipants.forEach(async (participantId) => {
        if (participantId !== userId) {
            const socketId = await getRedisServiceInstance().getUserSocketId(participantId);
            if (socketId) {
                io.to(`user:${participantId}`).emit('new_conversation', {
                    conversation: conversation.toObject()
                });
            }
        }
    });
    const response = {
        success: true,
        message: 'Conversation created successfully',
        data: {
            conversation: conversation.toObject()
        }
    };
    res.status(201).json(response);
}));
router.get('/:id', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid conversation ID format');
    }
    const conversation = await models_1.Conversation.findById(id)
        .populate('participants', 'username displayName profilePicture isOnline lastSeen')
        .populate('createdBy', 'username displayName')
        .populate('admins', 'username displayName');
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.AuthorizationError('Access denied');
    }
    const unreadCount = await models_1.Message.countUnreadMessages(userId, id);
    const recentMessages = await models_1.Message.findByConversation(id, 1, 5);
    const response = {
        success: true,
        message: 'Conversation retrieved successfully',
        data: {
            conversation: {
                ...conversation.toObject(),
                unreadMessages: unreadCount,
                recentMessages: recentMessages.reverse()
            }
        }
    };
    res.status(200).json(response);
}));
router.put('/:id', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { id } = req.params;
    const { error, value } = updateConversationSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { groupName, groupPicture, addParticipants, removeParticipants, addAdmins, removeAdmins } = value;
    const conversation = await models_1.Conversation.findById(id);
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.AuthorizationError('Not a participant in this conversation');
    }
    const isCreator = conversation.isCreator(userId);
    const isAdmin = conversation.isAdmin(userId);
    if (conversation.isGroup && !isCreator && !isAdmin) {
        throw new errorHandler_1.AuthorizationError('Admin privileges required');
    }
    if (conversation.isGroup) {
        if (groupName !== undefined) {
            conversation.groupName = groupName;
        }
        if (groupPicture !== undefined) {
            conversation.groupPicture = groupPicture;
        }
    }
    if (isCreator || isAdmin) {
        if (addParticipants && addParticipants.length > 0) {
            const newParticipantUsers = await models_1.User.find({ _id: { $in: addParticipants } });
            if (newParticipantUsers.length !== addParticipants.length) {
                throw new errorHandler_1.ValidationError('One or more participants do not exist');
            }
            for (const participantId of addParticipants) {
                await conversation.addParticipant(participantId);
            }
        }
        if (removeParticipants && removeParticipants.length > 0) {
            if (removeParticipants.includes(conversation.createdBy.toString())) {
                throw new errorHandler_1.ValidationError('Cannot remove conversation creator');
            }
            for (const participantId of removeParticipants) {
                await conversation.removeParticipant(participantId);
            }
        }
    }
    if (isCreator) {
        if (addAdmins && addAdmins.length > 0) {
            for (const adminId of addAdmins) {
                await conversation.addAdmin(adminId);
            }
        }
        if (removeAdmins && removeAdmins.length > 0) {
            if (removeAdmins.includes(conversation.createdBy.toString())) {
                throw new errorHandler_1.ValidationError('Cannot remove creator from admins');
            }
            for (const adminId of removeAdmins) {
                await conversation.removeAdmin(adminId);
            }
        }
    }
    await conversation.save();
    await conversation.populate('participants', 'username displayName profilePicture isOnline lastSeen');
    await conversation.populate('createdBy', 'username displayName');
    await conversation.populate('admins', 'username displayName');
    const io = require('@/index').io;
    conversation.participants.forEach((participant) => {
        io.to(`user:${participant._id}`).emit('conversation_updated', {
            conversationId: id,
            conversation: conversation.toObject()
        });
    });
    const response = {
        success: true,
        message: 'Conversation updated successfully',
        data: {
            conversation: conversation.toObject()
        }
    };
    res.status(200).json(response);
}));
router.delete('/:id', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid conversation ID format');
    }
    const conversation = await models_1.Conversation.findById(id);
    if (!conversation) {
        throw new errorHandler_1.NotFoundError('Conversation');
    }
    if (!conversation.isCreator(userId)) {
        throw new errorHandler_1.AuthorizationError('Only conversation creator can delete conversation');
    }
    await models_1.Message.deleteMany({ conversationId: id });
    await models_1.Conversation.findByIdAndDelete(id);
    const io = require('@/index').io;
    conversation.participants.forEach((participant) => {
        io.to(`user:${participant._id}`).emit('conversation_deleted', {
            conversationId: id
        });
    });
    const response = {
        success: true,
        message: 'Conversation deleted successfully',
        data: {
            conversationId: id
        }
    };
    res.status(200).json(response);
}));
router.post('/:id/leave', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid conversation ID format');
    }
    const conversation = await models_1.Conversation.findById(id);
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.AuthorizationError('Not a participant in this conversation');
    }
    if (!conversation.isGroup) {
        throw new errorHandler_1.ValidationError('Cannot leave private conversations');
    }
    if (conversation.isCreator(userId)) {
        throw new errorHandler_1.ValidationError('Conversation creator cannot leave. Transfer ownership or delete conversation.');
    }
    await conversation.removeParticipant(userId);
    const io = require('@/index').io;
    conversation.participants.forEach((participant) => {
        if (participant._id.toString() !== userId) {
            io.to(`user:${participant._id}`).emit('participant_left', {
                conversationId: id,
                userId
            });
        }
    });
    const response = {
        success: true,
        message: 'Left conversation successfully',
        data: {
            conversationId: id
        }
    };
    res.status(200).json(response);
}));
router.get('/:id/participants', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid conversation ID format');
    }
    const conversation = await models_1.Conversation.findById(id)
        .populate('participants', 'username displayName profilePicture isOnline lastSeen')
        .populate('createdBy', 'username displayName')
        .populate('admins', 'username displayName');
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.AuthorizationError('Access denied');
    }
    const participantsWithStatus = await Promise.all(conversation.participants.map(async (participant) => {
        const isOnline = await getRedisServiceInstance().isUserOnline(participant._id.toString());
        return {
            ...participant.toObject(),
            isOnline,
            isAdmin: conversation.isAdmin(participant._id.toString()),
            isCreator: conversation.isCreator(participant._id.toString())
        };
    }));
    const response = {
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
exports.default = router;
//# sourceMappingURL=conversations.js.map