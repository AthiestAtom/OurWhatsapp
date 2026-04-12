import { Router, Request, Response } from 'express';
import multer from 'multer';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { Message, Conversation } from '@/models';
import { getRedisService } from '@/database/redis';
import { ApiResponse, MessageType, MediaUploadRequest } from '@/types';
import { asyncHandler, ValidationError, NotFoundError, AuthorizationError } from '@/middleware/errorHandler';

let redisServiceInstance: any;

const router = Router();

function getRedisServiceInstance() {
  if (!redisServiceInstance) {
    redisServiceInstance = getRedisService();
  }
  return redisServiceInstance;
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    
    // Create upload directory if it doesn't exist
    try {
      await fs.access(uploadDir);
    } catch (error) {
      await fs.mkdir(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with original extension
    const uniqueSuffix = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// File filter for allowed types
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
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

  if (allowedTypes[file.mimetype as keyof typeof allowedTypes]) {
    cb(null, true);
  } else {
    cb(new ValidationError(`File type ${file.mimetype} is not allowed`));
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 5 // Maximum 5 files at once
  }
});

// Validation schemas
const uploadMediaSchema = Joi.object({
  type: Joi.string().valid(
    MessageType.IMAGE,
    MessageType.VIDEO,
    MessageType.AUDIO,
    MessageType.DOCUMENT
  ).required(),
  conversationId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
});

const sendMediaMessageSchema = Joi.object({
  conversationId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  fileId: Joi.string().required(),
  caption: Joi.string().max(1000).optional(),
  replyTo: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
});

// POST /api/media/upload - Upload media file
router.post('/upload', upload.array('files', 5), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  
  const { error, value } = uploadMediaSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { type, conversationId } = value;

  // Validate conversation ID format
  if (!conversationId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid conversation ID format');
  }

  // Check if conversation exists and user is participant
  const conversation = await Conversation.findById(conversationId);
  
  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new AuthorizationError('Access denied');
  }

  // Check if files were uploaded
  const files = req.files as Express.Multer.File[];
  
  if (!files || files.length === 0) {
    throw new ValidationError('No files uploaded');
  }

  // Validate file types match the declared type
  const validMimeTypes = {
    [MessageType.IMAGE]: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    [MessageType.VIDEO]: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
    [MessageType.AUDIO]: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
    [MessageType.DOCUMENT]: [
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv'
    ]
  };

  const allowedMimes = validMimeTypes[type as keyof typeof validMimeTypes];
  
  for (const file of files) {
    if (!allowedMimes.includes(file.mimetype)) {
      // Clean up uploaded files
      await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));
      throw new ValidationError(`File ${file.originalname} is not a valid ${type} file`);
    }
  }

  // Process uploaded files
  const uploadedFiles = await Promise.all(
    files.map(async (file) => {
      // Generate file metadata
      const metadata = {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        filePath: file.path,
        uploadedAt: new Date(),
        uploadedBy: userId
      };

      // Store file info in Redis (temporary, will be moved to permanent storage)
      const fileId = uuidv4();
      await getRedisServiceInstance().setCache(`media:${fileId}`, metadata, 3600); // 1 hour TTL

      return {
        fileId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        type,
        uploadedAt: metadata.uploadedAt
      };
    })
  );

  const response: ApiResponse = {
    success: true,
    message: 'Files uploaded successfully',
    data: {
      files: uploadedFiles,
      conversationId
    }
  };

  res.status(201).json(response);
}));

// POST /api/media/send - Send media message
router.post('/send', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  
  const { error, value } = sendMediaMessageSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { conversationId, fileId, caption, replyTo } = value;

  // Validate conversation ID format
  if (!conversationId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid conversation ID format');
  }

  // Check if conversation exists and user is participant
  const conversation = await Conversation.findById(conversationId);
  
  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new AuthorizationError('Access denied');
  }

  // Get file metadata from Redis
  const fileMetadata = await getRedisServiceInstance().getCache(`media:${fileId}`);
  
  if (!fileMetadata) {
    throw new ValidationError('File not found or expired');
  }

  // Validate reply-to message if provided
  if (replyTo) {
    const Message = require('@/models/Message').Message;
    const replyMessage = await Message.findById(replyTo);
    if (!replyMessage || replyMessage.conversationId.toString() !== conversationId) {
      throw new ValidationError('Invalid reply-to message');
    }
  }

  // Create message with media
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

  // Populate message details
  await message.populate('sender', 'username displayName profilePicture');
  if (replyTo) {
    await message.populate('replyTo', 'content sender type');
  }

  // Update conversation's last message
  await (conversation as any).updateLastMessage({
    content: caption || `[${fileMetadata.mimeType.split('/')[0]}]`,
    sender: userId,
    timestamp: message.createdAt,
    type: fileMetadata.type
  });

  // Get recipient information for WebSocket notification
  const recipients = conversation.participants.filter(
    (p: any) => p.toString() !== userId
  );

  // Send real-time notification via WebSocket
  const io = require('@/index').io;
  const messageData = message.toObject();

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
    const recipientId = recipient.toString();
    const isOnline = await getRedisServiceInstance().isUserOnline(recipientId);
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

  // Move file from temporary to permanent storage
  // For now, we'll keep it in the uploads directory
  // In production, you would move to cloud storage (S3, etc.)
  await getRedisServiceInstance().deleteCache(`media:${fileId}`);

  const response: ApiResponse = {
    success: true,
    message: 'Media message sent successfully',
    data: {
      message: messageData
    }
  };

  res.status(201).json(response);
}));

// GET /api/media/:fileId - Download media file
router.get('/:fileId', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { fileId } = req.params;

  // Validate file ID format
  if (!fileId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
    throw new ValidationError('Invalid file ID format');
  }

  // Try to get file metadata from message first (for sent messages)
  const Message = require('@/models/Message').Message;
  const message = await Message.findOne({ 
    'metadata.fileId': fileId,
    deletedAt: null 
  }).populate('conversationId');

  if (!message) {
    // Check if file is still in temporary storage
    const fileMetadata = await getRedisServiceInstance().getCache(`media:${fileId}`);
    
    if (!fileMetadata) {
      throw new NotFoundError('File');
    }

    // Only allow access to uploader
    if (fileMetadata.uploadedBy !== userId) {
      throw new AuthorizationError('Access denied');
    }

    // Serve temporary file
    const filePath = fileMetadata.filePath;
    
    try {
      await fs.access(filePath);
      
      // Set appropriate headers
      res.setHeader('Content-Type', fileMetadata.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${fileMetadata.fileName}"`);
      res.setHeader('Content-Length', fileMetadata.fileSize);
      
      // Stream file
      const fileStream = require('fs').createReadStream(filePath);
      fileStream.pipe(res);
      
      return;
    } catch (error) {
      throw new NotFoundError('File');
    }
  }

  // Check if user is participant in the conversation
  const conversation = message.conversationId as any;
  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new AuthorizationError('Access denied');
  }

  // Get file path from message metadata
  const fileMetadata = message.metadata;
  
  if (!fileMetadata || !fileMetadata.fileId) {
    throw new NotFoundError('File');
  }

  // Try to find the file in the filesystem
  // In production, this would be cloud storage
  const uploadDir = path.join(process.cwd(), 'uploads');
  const files = await fs.readdir(uploadDir);
  
  // Find file by matching the fileId in filename or by searching for the original file
  let filePath: string | null = null;
  
  for (const file of files) {
    if (file.includes(fileMetadata.fileId) || file === fileMetadata.fileName) {
      filePath = path.join(uploadDir, file);
      break;
    }
  }

  if (!filePath) {
    throw new NotFoundError('File');
  }

  try {
    await fs.access(filePath);
    
    // Set appropriate headers
    res.setHeader('Content-Type', fileMetadata.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileMetadata.fileName}"`);
    if (fileMetadata.fileSize) {
      res.setHeader('Content-Length', fileMetadata.fileSize);
    }
    
    // Stream file
    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    throw new NotFoundError('File');
  }
}));

// GET /api/media/:fileId/thumbnail - Get thumbnail for image/video
router.get('/:fileId/thumbnail', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { fileId } = req.params;

  // Validate file ID format
  if (!fileId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
    throw new ValidationError('Invalid file ID format');
  }

  // Get message with this file
  const Message = require('@/models/Message').Message;
  const message = await Message.findOne({ 
    'metadata.fileId': fileId,
    deletedAt: null 
  }).populate('conversationId');

  if (!message) {
    throw new NotFoundError('File');
  }

  // Check if user is participant in the conversation
  const conversation = message.conversationId as any;
  if (!conversation || !(conversation as any).isParticipant(userId)) {
    throw new AuthorizationError('Access denied');
  }

  // For now, return the original file as thumbnail
  // In production, you would generate actual thumbnails
  const fileMetadata = message.metadata;
  
  if (!fileMetadata || !fileMetadata.fileId) {
    throw new NotFoundError('Thumbnail');
  }

  // Check if file type supports thumbnails
  if (![MessageType.IMAGE, MessageType.VIDEO].includes(message.type)) {
    throw new ValidationError('File type does not support thumbnails');
  }

  // Redirect to the original file for now
  res.redirect(307, `/api/media/${fileId}`);
}));

// DELETE /api/media/:fileId - Delete uploaded file (if not sent in message)
router.delete('/:fileId', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { fileId } = req.params;

  // Validate file ID format
  if (!fileId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
    throw new ValidationError('Invalid file ID format');
  }

  // Get file metadata from Redis
  const fileMetadata = await getRedisServiceInstance().getCache(`media:${fileId}`);
  
  if (!fileMetadata) {
    throw new NotFoundError('File');
  }

  // Check if user uploaded this file
  if (fileMetadata.uploadedBy !== userId) {
    throw new AuthorizationError('Access denied');
  }

  // Delete file from filesystem
  try {
    await fs.unlink(fileMetadata.filePath);
  } catch (error) {
    // File might already be deleted
    console.error('Error deleting file:', error);
  }

  // Remove from Redis
  await getRedisServiceInstance().deleteCache(`media:${fileId}`);

  const response: ApiResponse = {
    success: true,
    message: 'File deleted successfully',
    data: {
      fileId
    }
  };

  res.status(200).json(response);
}));

// GET /api/media/info/:fileId - Get file information
router.get('/info/:fileId', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { fileId } = req.params;

  // Validate file ID format
  if (!fileId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
    throw new ValidationError('Invalid file ID format');
  }

  // Try to get from message first
  const Message = require('@/models/Message').Message;
  const message = await Message.findOne({ 
    'metadata.fileId': fileId,
    deletedAt: null 
  }).populate('conversationId');

  let fileMetadata: any = null;
  let isAccessible = false;

  if (message) {
    // Check if user is participant in the conversation
    const conversation = message.conversationId as any;
    isAccessible = conversation.isParticipant(userId);
    fileMetadata = message.metadata;
  } else {
    // Check temporary storage
    fileMetadata = await getRedisServiceInstance().getCache(`media:${fileId}`);
    isAccessible = fileMetadata && fileMetadata.uploadedBy === userId;
  }

  if (!fileMetadata || !isAccessible) {
    throw new NotFoundError('File');
  }

  const response: ApiResponse = {
    success: true,
    message: 'File information retrieved successfully',
    data: {
      fileId,
      fileName: fileMetadata.fileName,
      fileSize: fileMetadata.fileSize,
      mimeType: fileMetadata.mimeType,
      type: fileMetadata.type,
      uploadedAt: fileMetadata.uploadedAt,
      // Include message info if available
      messageId: message?._id,
      conversationId: message?.conversationId?._id
    }
  };

  res.status(200).json(response);
}));

export default router;
