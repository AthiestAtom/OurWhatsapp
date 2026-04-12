import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getRedisService } from '@/database/redis';
import { Message, Conversation, User } from '@/models';
import { MessageType, MessageStatus } from '@/types';
import { verifyToken } from '@/utils/auth';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: any;
}

interface SocketUser {
  userId: string;
  socketId: string;
  isOnline: boolean;
}

let redisService: any;

export function setupSocketHandlers(io: Server): void {
  // Initialize Redis service when setting up socket handlers
  redisService = getRedisService();
  const connectedUsers = new Map<string, string>(); // userId -> socketId
  const socketToUser = new Map<string, string>(); // socketId -> userId

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = verifyToken(token) as any;
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = decoded.userId;
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    
    console.log(`🔗 User ${userId} connected with socket ${socket.id}`);

    // Store connection mappings
    connectedUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);

    // Set user online in Redis
    await redisService.setUserOnline(userId, socket.id);
    await redisService.setUserSocket(userId, socket.id);

    // Update user's online status in database
    User.findByIdAndUpdate(userId, { 
      isOnline: true,
      lastSeen: new Date()
    }).catch(console.error);

    // Join user to their personal room for direct messages
    socket.join(`user:${userId}`);

    // Handle joining conversations
    socket.on('join_conversation', async (conversationId: string) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        
        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }

        if (!conversation.participants.includes(userId as any)) {
          socket.emit('error', { message: 'Not a participant in this conversation' });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        console.log(`📱 User ${userId} joined conversation ${conversationId}`);

        // Notify other participants that user is online in this conversation
        socket.to(`conversation:${conversationId}`).emit('user_joined', {
          userId,
          conversationId
        });

      } catch (error) {
        console.error('Error joining conversation:', error);
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // Handle leaving conversations
    socket.on('leave_conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      socket.to(`conversation:${conversationId}`).emit('user_left', {
        userId,
        conversationId
      });
      console.log(`📱 User ${userId} left conversation ${conversationId}`);
    });

    // Handle sending messages
    socket.on('send_message', async (messageData: any) => {
      try {
        const { conversationId, content, type = MessageType.TEXT, replyTo, metadata } = messageData;

        // Validate conversation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.includes(userId as any)) {
          socket.emit('error', { message: 'Invalid conversation' });
          return;
        }

        // Create message
        const message = new Message({
          conversationId,
          sender: userId,
          content,
          type,
          replyTo,
          metadata,
          status: MessageStatus.SENT
        });

        await message.save();

        // Populate message data for response
        await message.populate('sender', 'username displayName profilePicture');
        if (replyTo) {
          await message.populate('replyTo', 'content sender type');
        }

        // Send to all participants in the conversation
        io.to(`conversation:${conversationId}`).emit('message_received', {
          message: message.toObject(),
          conversationId
        });

        // Mark as delivered for other participants
        const otherParticipants = conversation.participants.filter(
          (p: any) => p.toString() !== userId
        );

        for (const participant of otherParticipants) {
          const participantSocketId = connectedUsers.get(participant.toString());
          if (participantSocketId) {
            await (message as any).markAsDelivered();
            break; // Only mark as delivered once
          }
        }

        console.log(`📨 Message sent in conversation ${conversationId} by user ${userId}`);

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', async (conversationId: string) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.includes(userId as any)) {
          return;
        }

        // Set typing in Redis with TTL
        await redisService.setTyping(conversationId, userId);

        // Notify other participants
        socket.to(`conversation:${conversationId}`).emit('typing_indicator', {
          conversationId,
          userId,
          isTyping: true
        });

      } catch (error) {
        console.error('Error handling typing start:', error);
      }
    });

    socket.on('typing_stop', async (conversationId: string) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.includes(userId as any)) {
          return;
        }

        // Remove typing from Redis
        await redisService.removeTyping(conversationId, userId);

        // Notify other participants
        socket.to(`conversation:${conversationId}`).emit('typing_indicator', {
          conversationId,
          userId,
          isTyping: false
        });

      } catch (error) {
        console.error('Error handling typing stop:', error);
      }
    });

    // Handle marking messages as read
    socket.on('mark_read', async (data: { messageId: string, conversationId: string }) => {
      try {
        const { messageId, conversationId } = data;

        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        // Validate user is participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.includes(userId as any)) {
          socket.emit('error', { message: 'Not a participant in this conversation' });
          return;
        }

        // Mark as read
        await (message as any).markAsRead(userId);

        // Notify sender that message was read
        io.to(`user:${message.sender}`).emit('message_status_update', {
          messageId,
          status: MessageStatus.READ,
          readBy: userId,
          conversationId
        });

        console.log(`📖 Message ${messageId} marked as read by user ${userId}`);

      } catch (error) {
        console.error('Error marking message as read:', error);
        socket.emit('error', { message: 'Failed to mark message as read' });
      }
    });

    // Handle getting typing users in a conversation
    socket.on('get_typing_users', async (conversationId: string) => {
      try {
        const typingUsers = await redisService.getTypingUsers(conversationId);
        socket.emit('typing_users', {
          conversationId,
          typingUsers: typingUsers.filter((id: any) => id !== userId)
        });
      } catch (error) {
        console.error('Error getting typing users:', error);
      }
    });

        // Handle disconnection
    socket.on('disconnect', async (reason: any) => {
      console.log(`🔌 User ${userId} disconnected: ${reason}`);

      // Remove from mappings
      connectedUsers.delete(userId);
      socketToUser.delete(socket.id);

      // Remove socket mapping from Redis
      await redisService.removeUserSocket(userId);

      // Check if user has other connections
      const remainingConnections = Array.from(socketToUser.values())
        .filter(id => id === userId).length;

      if (remainingConnections === 0) {
        // Set user offline in Redis
        await redisService.setUserOffline(userId);

        // Update user's online status in database
        await User.findByIdAndUpdate(userId, { 
          isOnline: false,
          lastSeen: new Date()
        });

        // Notify all conversations user is in that they're offline
        const conversations = await Conversation.find({ 
          participants: userId 
        });

        conversations.forEach((conversation: any) => {
          io.to(`conversation:${conversation._id}`).emit('user_offline', {
            userId,
            conversationId: conversation._id
          });
        });
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error for user ${userId}:`, error);
    });
  });

  // Utility functions
  function getConnectedUsers(): string[] {
    return Array.from(connectedUsers.keys());
  }

  function isUserConnected(userId: string): boolean {
    return connectedUsers.has(userId);
  }

  function getUserSocketId(userId: string): string | undefined {
    return connectedUsers.get(userId);
  }

  // Expose utility functions
  (io as any).getConnectedUsers = getConnectedUsers;
  (io as any).isUserConnected = isUserConnected;
  (io as any).getUserSocketId = getUserSocketId;

  console.log('🔌 Socket.IO handlers setup complete');
}
