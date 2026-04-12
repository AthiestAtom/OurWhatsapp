"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const joi_1 = __importDefault(require("joi"));
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const models_1 = require("@/models");
const redis_1 = require("@/database/redis");
const types_1 = require("@/types");
const errorHandler_1 = require("@/middleware/errorHandler");
let redisServiceInstance;
const router = (0, express_1.Router)();
function getRedisServiceInstance() {
    if (!redisServiceInstance) {
        redisServiceInstance = (0, redis_1.getRedisService)();
    }
    return redisServiceInstance;
}
const storage = multer_1.default.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path_1.default.join(process.cwd(), 'uploads');
        try {
            await promises_1.default.access(uploadDir);
        }
        catch (error) {
            await promises_1.default.mkdir(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = (0, uuid_1.v4)();
        const ext = path_1.default.extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
    }
});
const fileFilter = (req, file, cb) => {
    const allowedTypes = {
        'image/jpeg': true,
        'image/png': true,
        'image/gif': true,
        'image/webp': true,
        'video/mp4': true,
        'video/quicktime': true,
        'video/x-msvideo': true,
        'audio/mpeg': true,
        'audio/wav': true,
        'audio/ogg': true,
        'application/pdf': true,
        'application/msword': true,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
        'application/vnd.ms-excel': true,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
        'text/plain': true,
        'text/csv': true
    };
    if (allowedTypes[file.mimetype]) {
        cb(null, true);
    }
    else {
        cb(new errorHandler_1.ValidationError(`File type ${file.mimetype} is not allowed`));
    }
};
const upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024,
        files: 5
    }
});
const uploadMediaSchema = joi_1.default.object({
    type: joi_1.default.string().valid(types_1.MessageType.IMAGE, types_1.MessageType.VIDEO, types_1.MessageType.AUDIO, types_1.MessageType.DOCUMENT).required(),
    conversationId: joi_1.default.string().pattern(/^[0-9a-fA-F]{24}$/).required()
});
const sendMediaMessageSchema = joi_1.default.object({
    conversationId: joi_1.default.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    fileId: joi_1.default.string().required(),
    caption: joi_1.default.string().max(1000).optional(),
    replyTo: joi_1.default.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
});
router.post('/upload', upload.array('files', 5), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { error, value } = uploadMediaSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { type, conversationId } = value;
    if (!conversationId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid conversation ID format');
    }
    const conversation = await models_1.Conversation.findById(conversationId);
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.AuthorizationError('Access denied');
    }
    const files = req.files;
    if (!files || files.length === 0) {
        throw new errorHandler_1.ValidationError('No files uploaded');
    }
    const validMimeTypes = {
        [types_1.MessageType.IMAGE]: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        [types_1.MessageType.VIDEO]: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
        [types_1.MessageType.AUDIO]: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
        [types_1.MessageType.DOCUMENT]: [
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain', 'text/csv'
        ]
    };
    const allowedMimes = validMimeTypes[type];
    for (const file of files) {
        if (!allowedMimes.includes(file.mimetype)) {
            await Promise.all(files.map(f => promises_1.default.unlink(f.path).catch(() => { })));
            throw new errorHandler_1.ValidationError(`File ${file.originalname} is not a valid ${type} file`);
        }
    }
    const uploadedFiles = await Promise.all(files.map(async (file) => {
        const metadata = {
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            filePath: file.path,
            uploadedAt: new Date(),
            uploadedBy: userId
        };
        const fileId = (0, uuid_1.v4)();
        await getRedisServiceInstance().setCache(`media:${fileId}`, metadata, 3600);
        return {
            fileId,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            type,
            uploadedAt: metadata.uploadedAt
        };
    }));
    const response = {
        success: true,
        message: 'Files uploaded successfully',
        data: {
            files: uploadedFiles,
            conversationId
        }
    };
    res.status(201).json(response);
}));
router.post('/send', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { error, value } = sendMediaMessageSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { conversationId, fileId, caption, replyTo } = value;
    if (!conversationId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid conversation ID format');
    }
    const conversation = await models_1.Conversation.findById(conversationId);
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.AuthorizationError('Access denied');
    }
    const fileMetadata = await getRedisServiceInstance().getCache(`media:${fileId}`);
    if (!fileMetadata) {
        throw new errorHandler_1.ValidationError('File not found or expired');
    }
    if (replyTo) {
        const Message = require('@/models/Message').Message;
        const replyMessage = await Message.findById(replyTo);
        if (!replyMessage || replyMessage.conversationId.toString() !== conversationId) {
            throw new errorHandler_1.ValidationError('Invalid reply-to message');
        }
    }
    const Message = require('@/models/Message').Message;
    const message = new Message({
        conversationId,
        sender: userId,
        content: caption || `[${fileMetadata.mimeType.split('/')[0]}]`,
        type: fileMetadata.type,
        replyTo: replyTo || null,
        metadata: {
            fileName: fileMetadata.fileName,
            fileSize: fileMetadata.fileSize,
            mimeType: fileMetadata.mimeType,
            fileId: fileId
        },
        status: 'sent'
    });
    await message.save();
    await message.populate('sender', 'username displayName profilePicture');
    if (replyTo) {
        await message.populate('replyTo', 'content sender type');
    }
    await conversation.updateLastMessage({
        content: caption || `[${fileMetadata.mimeType.split('/')[0]}]`,
        sender: userId,
        timestamp: message.createdAt,
        type: fileMetadata.type
    });
    const recipients = conversation.participants.filter((p) => p.toString() !== userId);
    const io = require('@/index').io;
    const messageData = message.toObject();
    recipients.forEach((recipient) => {
        const recipientId = recipient.toString();
        io.to(`user:${recipientId}`).emit('message_received', {
            message: messageData,
            conversationId
        });
    });
    let isDelivered = false;
    for (const recipient of recipients) {
        const recipientId = recipient.toString();
        const isOnline = await getRedisServiceInstance().isUserOnline(recipientId);
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
    await getRedisServiceInstance().deleteCache(`media:${fileId}`);
    const response = {
        success: true,
        message: 'Media message sent successfully',
        data: {
            message: messageData
        }
    };
    res.status(201).json(response);
}));
router.get('/:fileId', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { fileId } = req.params;
    if (!fileId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
        throw new errorHandler_1.ValidationError('Invalid file ID format');
    }
    const Message = require('@/models/Message').Message;
    const message = await Message.findOne({
        'metadata.fileId': fileId,
        deletedAt: null
    }).populate('conversationId');
    if (!message) {
        const fileMetadata = await getRedisServiceInstance().getCache(`media:${fileId}`);
        if (!fileMetadata) {
            throw new errorHandler_1.NotFoundError('File');
        }
        if (fileMetadata.uploadedBy !== userId) {
            throw new errorHandler_1.AuthorizationError('Access denied');
        }
        const filePath = fileMetadata.filePath;
        try {
            await promises_1.default.access(filePath);
            res.setHeader('Content-Type', fileMetadata.mimeType);
            res.setHeader('Content-Disposition', `inline; filename="${fileMetadata.fileName}"`);
            res.setHeader('Content-Length', fileMetadata.fileSize);
            const fileStream = require('fs').createReadStream(filePath);
            fileStream.pipe(res);
            return;
        }
        catch (error) {
            throw new errorHandler_1.NotFoundError('File');
        }
    }
    const conversation = message.conversationId;
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.AuthorizationError('Access denied');
    }
    const fileMetadata = message.metadata;
    if (!fileMetadata || !fileMetadata.fileId) {
        throw new errorHandler_1.NotFoundError('File');
    }
    const uploadDir = path_1.default.join(process.cwd(), 'uploads');
    const files = await promises_1.default.readdir(uploadDir);
    let filePath = null;
    for (const file of files) {
        if (file.includes(fileMetadata.fileId) || file === fileMetadata.fileName) {
            filePath = path_1.default.join(uploadDir, file);
            break;
        }
    }
    if (!filePath) {
        throw new errorHandler_1.NotFoundError('File');
    }
    try {
        await promises_1.default.access(filePath);
        res.setHeader('Content-Type', fileMetadata.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${fileMetadata.fileName}"`);
        if (fileMetadata.fileSize) {
            res.setHeader('Content-Length', fileMetadata.fileSize);
        }
        const fileStream = require('fs').createReadStream(filePath);
        fileStream.pipe(res);
    }
    catch (error) {
        throw new errorHandler_1.NotFoundError('File');
    }
}));
router.get('/:fileId/thumbnail', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { fileId } = req.params;
    if (!fileId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
        throw new errorHandler_1.ValidationError('Invalid file ID format');
    }
    const Message = require('@/models/Message').Message;
    const message = await Message.findOne({
        'metadata.fileId': fileId,
        deletedAt: null
    }).populate('conversationId');
    if (!message) {
        throw new errorHandler_1.NotFoundError('File');
    }
    const conversation = message.conversationId;
    if (!conversation || !conversation.isParticipant(userId)) {
        throw new errorHandler_1.AuthorizationError('Access denied');
    }
    const fileMetadata = message.metadata;
    if (!fileMetadata || !fileMetadata.fileId) {
        throw new errorHandler_1.NotFoundError('Thumbnail');
    }
    if (![types_1.MessageType.IMAGE, types_1.MessageType.VIDEO].includes(message.type)) {
        throw new errorHandler_1.ValidationError('File type does not support thumbnails');
    }
    res.redirect(307, `/api/media/${fileId}`);
}));
router.delete('/:fileId', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { fileId } = req.params;
    if (!fileId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
        throw new errorHandler_1.ValidationError('Invalid file ID format');
    }
    const fileMetadata = await getRedisServiceInstance().getCache(`media:${fileId}`);
    if (!fileMetadata) {
        throw new errorHandler_1.NotFoundError('File');
    }
    if (fileMetadata.uploadedBy !== userId) {
        throw new errorHandler_1.AuthorizationError('Access denied');
    }
    try {
        await promises_1.default.unlink(fileMetadata.filePath);
    }
    catch (error) {
        console.error('Error deleting file:', error);
    }
    await getRedisServiceInstance().deleteCache(`media:${fileId}`);
    const response = {
        success: true,
        message: 'File deleted successfully',
        data: {
            fileId
        }
    };
    res.status(200).json(response);
}));
router.get('/info/:fileId', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { fileId } = req.params;
    if (!fileId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
        throw new errorHandler_1.ValidationError('Invalid file ID format');
    }
    const Message = require('@/models/Message').Message;
    const message = await Message.findOne({
        'metadata.fileId': fileId,
        deletedAt: null
    }).populate('conversationId');
    let fileMetadata = null;
    let isAccessible = false;
    if (message) {
        const conversation = message.conversationId;
        isAccessible = conversation.isParticipant(userId);
        fileMetadata = message.metadata;
    }
    else {
        fileMetadata = await getRedisServiceInstance().getCache(`media:${fileId}`);
        isAccessible = fileMetadata && fileMetadata.uploadedBy === userId;
    }
    if (!fileMetadata || !isAccessible) {
        throw new errorHandler_1.NotFoundError('File');
    }
    const response = {
        success: true,
        message: 'File information retrieved successfully',
        data: {
            fileId,
            fileName: fileMetadata.fileName,
            fileSize: fileMetadata.fileSize,
            mimeType: fileMetadata.mimeType,
            type: fileMetadata.type,
            uploadedAt: fileMetadata.uploadedAt,
            messageId: message?._id,
            conversationId: message?.conversationId?._id
        }
    };
    res.status(200).json(response);
}));
exports.default = router;
//# sourceMappingURL=media.js.map