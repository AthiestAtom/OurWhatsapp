"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocketHandlers = setupSocketHandlers;
const redis_1 = require("@/database/redis");
const models_1 = require("@/models");
const types_1 = require("@/types");
const auth_1 = require("@/utils/auth");
let redisService;
function setupSocketHandlers(io) {
    redisService = (0, redis_1.getRedisService)();
    const connectedUsers = new Map();
    const socketToUser = new Map();
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication token required'));
            }
            const decoded = (0, auth_1.verifyToken)(token);
            const user = await models_1.User.findById(decoded.userId);
            if (!user) {
                return next(new Error('User not found'));
            }
            socket.userId = decoded.userId;
            socket.user = user;
            next();
        }
        catch (error) {
            next(new Error('Invalid authentication token'));
        }
    });
    io.on('connection', async (socket) => {
        const userId = socket.userId;
        console.log(`🔗 User ${userId} connected with socket ${socket.id}`);
        connectedUsers.set(userId, socket.id);
        socketToUser.set(socket.id, userId);
        await redisService.setUserOnline(userId, socket.id);
        await redisService.setUserSocket(userId, socket.id);
        models_1.User.findByIdAndUpdate(userId, {
            isOnline: true,
            lastSeen: new Date()
        }).catch(console.error);
        socket.join(`user:${userId}`);
        socket.on('join_conversation', async (conversationId) => {
            try {
                const conversation = await models_1.Conversation.findById(conversationId);
                if (!conversation) {
                    socket.emit('error', { message: 'Conversation not found' });
                    return;
                }
                if (!conversation.participants.includes(userId)) {
                    socket.emit('error', { message: 'Not a participant in this conversation' });
                    return;
                }
                socket.join(`conversation:${conversationId}`);
                console.log(`📱 User ${userId} joined conversation ${conversationId}`);
                socket.to(`conversation:${conversationId}`).emit('user_joined', {
                    userId,
                    conversationId
                });
            }
            catch (error) {
                console.error('Error joining conversation:', error);
                socket.emit('error', { message: 'Failed to join conversation' });
            }
        });
        socket.on('leave_conversation', (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
            socket.to(`conversation:${conversationId}`).emit('user_left', {
                userId,
                conversationId
            });
            console.log(`📱 User ${userId} left conversation ${conversationId}`);
        });
        socket.on('send_message', async (messageData) => {
            try {
                const { conversationId, content, type = types_1.MessageType.TEXT, replyTo, metadata } = messageData;
                const conversation = await models_1.Conversation.findById(conversationId);
                if (!conversation || !conversation.participants.includes(userId)) {
                    socket.emit('error', { message: 'Invalid conversation' });
                    return;
                }
                const message = new models_1.Message({
                    conversationId,
                    sender: userId,
                    content,
                    type,
                    replyTo,
                    metadata,
                    status: types_1.MessageStatus.SENT
                });
                await message.save();
                await message.populate('sender', 'username displayName profilePicture');
                if (replyTo) {
                    await message.populate('replyTo', 'content sender type');
                }
                io.to(`conversation:${conversationId}`).emit('message_received', {
                    message: message.toObject(),
                    conversationId
                });
                const otherParticipants = conversation.participants.filter((p) => p.toString() !== userId);
                for (const participant of otherParticipants) {
                    const participantSocketId = connectedUsers.get(participant.toString());
                    if (participantSocketId) {
                        await message.markAsDelivered();
                        break;
                    }
                }
                console.log(`📨 Message sent in conversation ${conversationId} by user ${userId}`);
            }
            catch (error) {
                console.error('Error sending message:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });
        socket.on('typing_start', async (conversationId) => {
            try {
                const conversation = await models_1.Conversation.findById(conversationId);
                if (!conversation || !conversation.participants.includes(userId)) {
                    return;
                }
                await redisService.setTyping(conversationId, userId);
                socket.to(`conversation:${conversationId}`).emit('typing_indicator', {
                    conversationId,
                    userId,
                    isTyping: true
                });
            }
            catch (error) {
                console.error('Error handling typing start:', error);
            }
        });
        socket.on('typing_stop', async (conversationId) => {
            try {
                const conversation = await models_1.Conversation.findById(conversationId);
                if (!conversation || !conversation.participants.includes(userId)) {
                    return;
                }
                await redisService.removeTyping(conversationId, userId);
                socket.to(`conversation:${conversationId}`).emit('typing_indicator', {
                    conversationId,
                    userId,
                    isTyping: false
                });
            }
            catch (error) {
                console.error('Error handling typing stop:', error);
            }
        });
        socket.on('mark_read', async (data) => {
            try {
                const { messageId, conversationId } = data;
                const message = await models_1.Message.findById(messageId);
                if (!message) {
                    socket.emit('error', { message: 'Message not found' });
                    return;
                }
                const conversation = await models_1.Conversation.findById(conversationId);
                if (!conversation || !conversation.participants.includes(userId)) {
                    socket.emit('error', { message: 'Not a participant in this conversation' });
                    return;
                }
                await message.markAsRead(userId);
                io.to(`user:${message.sender}`).emit('message_status_update', {
                    messageId,
                    status: types_1.MessageStatus.READ,
                    readBy: userId,
                    conversationId
                });
                console.log(`📖 Message ${messageId} marked as read by user ${userId}`);
            }
            catch (error) {
                console.error('Error marking message as read:', error);
                socket.emit('error', { message: 'Failed to mark message as read' });
            }
        });
        socket.on('get_typing_users', async (conversationId) => {
            try {
                const typingUsers = await redisService.getTypingUsers(conversationId);
                socket.emit('typing_users', {
                    conversationId,
                    typingUsers: typingUsers.filter((id) => id !== userId)
                });
            }
            catch (error) {
                console.error('Error getting typing users:', error);
            }
        });
        socket.on('disconnect', async (reason) => {
            console.log(`🔌 User ${userId} disconnected: ${reason}`);
            connectedUsers.delete(userId);
            socketToUser.delete(socket.id);
            await redisService.removeUserSocket(userId);
            const remainingConnections = Array.from(socketToUser.values())
                .filter(id => id === userId).length;
            if (remainingConnections === 0) {
                await redisService.setUserOffline(userId);
                await models_1.User.findByIdAndUpdate(userId, {
                    isOnline: false,
                    lastSeen: new Date()
                });
                const conversations = await models_1.Conversation.find({
                    participants: userId
                });
                conversations.forEach((conversation) => {
                    io.to(`conversation:${conversation._id}`).emit('user_offline', {
                        userId,
                        conversationId: conversation._id
                    });
                });
            }
        });
        socket.on('error', (error) => {
            console.error(`❌ Socket error for user ${userId}:`, error);
        });
    });
    function getConnectedUsers() {
        return Array.from(connectedUsers.keys());
    }
    function isUserConnected(userId) {
        return connectedUsers.has(userId);
    }
    function getUserSocketId(userId) {
        return connectedUsers.get(userId);
    }
    io.getConnectedUsers = getConnectedUsers;
    io.isUserConnected = isUserConnected;
    io.getUserSocketId = getUserSocketId;
    console.log('🔌 Socket.IO handlers setup complete');
}
//# sourceMappingURL=socketService.js.map