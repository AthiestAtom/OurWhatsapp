"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const models_1 = require("@/models");
const redis_1 = require("@/database/redis");
const encryptionService_1 = require("@/services/encryptionService");
const types_1 = require("@/types");
const errorHandler_1 = require("@/middleware/errorHandler");
const router = (0, express_1.Router)();
let redisServiceInstance;
let encryptionServiceInstance;
function getRedisServiceInstance() {
    if (!redisServiceInstance) {
        redisServiceInstance = (0, redis_1.getRedisService)();
    }
    return redisServiceInstance;
}
function getEncryptionServiceInstance() {
    if (!encryptionServiceInstance) {
        encryptionServiceInstance = new encryptionService_1.EncryptionService();
    }
    return encryptionServiceInstance;
}
const sendMessageSchema = joi_1.default.object({
    content: joi_1.default.string().when('type', {
        is: 'text',
        then: joi_1.default.string().min(1).max(10000).required(),
        otherwise: joi_1.default.string().optional()
    }),
    type: joi_1.default.string().valid(...Object.values(types_1.MessageType)).default(types_1.MessageType.TEXT),
    replyTo: joi_1.default.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    metadata: joi_1.default.object({
        fileName: joi_1.default.string().optional(),
        fileSize: joi_1.default.number().integer().min(0).optional(),
        mimeType: joi_1.default.string().optional(),
        thumbnail: joi_1.default.string().uri().optional(),
        duration: joi_1.default.number().integer().min(0).optional(),
        latitude: joi_1.default.number().min(-90).max(90).optional(),
        longitude: joi_1.default.number().min(-180).max(180).optional()
    }).optional()
});
const paginationSchema = joi_1.default.object({
    page: joi_1.default.number().integer().min(1).default(1),
    limit: joi_1.default.number().integer().min(1).max(100).default(50),
    before: joi_1.default.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    after: joi_1.default.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
});
const updateMessageStatusSchema = joi_1.default.object({
    status: joi_1.default.string().valid('read').required()
});
router.get('/conversations/:conversationId/messages', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { conversationId } = req.params;
    const { error, value } = paginationSchema.validate(req.query);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { page, limit, before, after } = value;
    if (!conversationId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid conversation ID format');
    }
    const conversation = await models_1.Conversation.findById(conversationId);
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.NotFoundError('Conversation');
    }
    let query = {
        conversationId,
        deletedAt: null
    };
    if (before) {
        const beforeMessage = await models_1.Message.findById(before);
        if (beforeMessage) {
            query.createdAt = { $lt: beforeMessage.createdAt };
        }
    }
    if (after) {
        const afterMessage = await models_1.Message.findById(after);
        if (afterMessage) {
            query.createdAt = { $gt: afterMessage.createdAt };
        }
    }
    const skip = (page - 1) * limit;
    const messages = await models_1.Message.find(query)
        .populate('sender', 'username displayName profilePicture')
        .populate('replyTo', 'content sender type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    const total = await models_1.Message.countDocuments(query);
    const decryptedMessages = await Promise.all(messages.map(async (message) => {
        let decryptedContent = message.content;
        try {
            const encryptionService = getEncryptionServiceInstance();
            if (message.encryptedContent && message.type === types_1.MessageType.TEXT) {
                decryptedContent = encryptionService.decryptMessage(message.encryptedContent, message.encryptionKey, message.iv);
            }
        }
        catch (error) {
            console.error('Error decrypting message:', error);
        }
        const isReadByUser = message.isReadBy ? message.isReadBy(req.userId) : false;
        return {
            ...message.toObject(),
            content: decryptedContent,
            isReadByUser
        };
    }));
    const undeliveredMessages = messages.filter((msg) => msg.status === 'sent');
    if (undeliveredMessages.length > 0) {
        await Promise.all(undeliveredMessages.map((msg) => msg.markAsDelivered()));
    }
    const response = {
        success: true,
        message: 'Messages retrieved successfully',
        data: {
            messages: decryptedMessages.reverse(),
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
router.post('/conversations/:conversationId/messages', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { conversationId } = req.params;
    const { error, value } = sendMessageSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { content, type, replyTo, metadata } = value;
    if (!conversationId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid conversation ID format');
    }
    const conversation = await models_1.Conversation.findById(conversationId);
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.NotFoundError('Conversation');
    }
    if (replyTo) {
        const replyMessage = await models_1.Message.findById(replyTo);
        if (!replyMessage || replyMessage.conversationId.toString() !== conversationId) {
            throw new errorHandler_1.ValidationError('Invalid reply-to message');
        }
    }
    if ([types_1.MessageType.IMAGE, types_1.MessageType.VIDEO, types_1.MessageType.DOCUMENT, types_1.MessageType.AUDIO].includes(type) && !metadata) {
        throw new errorHandler_1.ValidationError('Media messages must include metadata');
    }
    const sender = await models_1.User.findById(userId);
    if (!sender) {
        throw new errorHandler_1.NotFoundError('User');
    }
    let encryptedContent = content;
    if (type === types_1.MessageType.TEXT && content) {
        try {
            const encryptionService = getEncryptionServiceInstance();
            const encryption = encryptionService.encryptMessage(content);
            encryptedContent = encryption.encryptedContent;
        }
        catch (error) {
            throw new errorHandler_1.ValidationError('Failed to encrypt message');
        }
    }
    const message = new models_1.Message({
        conversationId,
        sender: userId,
        content: encryptedContent,
        type,
        replyTo: replyTo || null,
        metadata: metadata || null,
        status: 'sent'
    });
    await message.save();
    await message.populate('sender', 'username displayName profilePicture');
    if (replyTo) {
        await message.populate('replyTo', 'content sender type');
    }
    await conversation.updateLastMessage({
        content: type === types_1.MessageType.TEXT ? content : `[${type}]`,
        sender: userId,
        timestamp: message.createdAt,
        type
    });
    const recipients = conversation.participants.filter((p) => p.toString() !== userId);
    const io = require('@/index').io;
    const messageData = {
        ...message.toObject(),
        content: type === types_1.MessageType.TEXT ? content : message.content
    };
    recipients.forEach((recipient) => {
        const recipientId = recipient.toString();
        io.to(`user:${recipientId}`).emit('message_received', {
            message: messageData,
            conversationId
        });
    });
    let isDelivered = false;
    for (const recipient of recipients) {
        const recipientIdString = recipient.toString();
        const isOnline = await getRedisServiceInstance().isUserOnline(recipientIdString);
        if (isOnline) {
            await message.markAsDelivered();
            isDelivered = true;
            break;
        }
    }
    if (isDelivered) {
        io.to(`user:${userId}`).emit('message_status_update', {
            messageId: message._id,
            status: 'delivered',
            conversationId
        });
    }
    const response = {
        success: true,
        message: 'Message sent successfully',
        data: {
            message: {
                ...message.toObject(),
                content: type === types_1.MessageType.TEXT ? content : message.content
            }
        }
    };
    res.status(201).json(response);
}));
router.get('/:messageId', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { messageId } = req.params;
    if (!messageId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid message ID format');
    }
    const message = await models_1.Message.findById(messageId)
        .select('+encryptedContent +encryptionKey +iv')
        .populate('sender', 'username displayName profilePicture')
        .populate('replyTo', 'content sender type');
    if (!message) {
        throw new errorHandler_1.NotFoundError('Message');
    }
    const conversation = await models_1.Conversation.findById(message.conversationId);
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.AuthorizationError('Access denied');
    }
    let decryptedContent = message.content;
    try {
        if (message.type === types_1.MessageType.TEXT) {
            const encryptionService = getEncryptionServiceInstance();
            const messageAny = message;
            if (messageAny.encryptedContent) {
                decryptedContent = encryptionService.decryptMessage(messageAny.encryptedContent, messageAny.encryptionKey, messageAny.iv);
            }
        }
    }
    catch (error) {
        console.error('Error decrypting message:', error);
    }
    const isReadByUser = message.isReadBy(userId);
    const response = {
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
router.put('/:messageId/status', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { messageId } = req.params;
    const { error, value } = updateMessageStatusSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { status } = value;
    if (!messageId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid message ID format');
    }
    const message = await models_1.Message.findById(messageId);
    if (!message) {
        throw new errorHandler_1.NotFoundError('Message');
    }
    const conversation = await models_1.Conversation.findById(message.conversationId);
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.AuthorizationError('Access denied');
    }
    if (status !== 'read') {
        throw new errorHandler_1.ValidationError('Only "read" status can be updated manually');
    }
    if (message.sender.toString() === userId) {
        throw new errorHandler_1.ValidationError('Cannot mark your own message as read');
    }
    await message.markAsRead(userId);
    const io = require('@/index').io;
    io.to(`user:${message.sender}`).emit('message_status_update', {
        messageId,
        status: 'read',
        readBy: userId,
        conversationId: message.conversationId
    });
    const response = {
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
router.delete('/:messageId', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { messageId } = req.params;
    if (!messageId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid message ID format');
    }
    const message = await models_1.Message.findById(messageId);
    if (!message) {
        throw new errorHandler_1.NotFoundError('Message');
    }
    if (message.sender.toString() !== userId) {
        throw new errorHandler_1.AuthorizationError('Only message sender can delete message');
    }
    await message.softDelete();
    const conversation = await models_1.Conversation.findById(message.conversationId);
    if (conversation) {
        const io = require('@/index').io;
        conversation.participants.forEach((participant) => {
            io.to(`user:${participant._id}`).emit('message_deleted', {
                messageId,
                conversationId: message.conversationId
            });
        });
    }
    const response = {
        success: true,
        message: 'Message deleted successfully',
        data: {
            messageId
        }
    };
    res.status(200).json(response);
}));
router.post('/:messageId/reactions', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { messageId } = req.params;
    const response = {
        success: false,
        message: 'Reactions feature not yet implemented',
        error: 'NOT_IMPLEMENTED'
    };
    res.status(501).json(response);
}));
router.get('/unread', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const totalUnread = await models_1.Message.countUnreadMessages(userId);
    const conversations = await models_1.Conversation.findByParticipant(userId);
    const unreadByConversation = await Promise.all(conversations.map(async (conversation) => {
        const unreadCount = await models_1.Message.countUnreadMessages(userId, conversation._id.toString());
        return {
            conversationId: conversation._id,
            conversationName: conversation.isGroup ? conversation.groupName : 'Private Chat',
            unreadCount
        };
    }));
    const conversationsWithUnread = unreadByConversation.filter((c) => c.unreadCount > 0);
    const response = {
        success: true,
        message: 'Unread messages count retrieved successfully',
        data: {
            totalUnread,
            conversations: conversationsWithUnread
        }
    };
    res.status(200).json(response);
}));
exports.default = router;
//# sourceMappingURL=messages.js.map