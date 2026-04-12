import mongoose, { Schema } from 'mongoose';
import { IMessage, MessageType, MessageStatus } from '@/types';

const readBySubSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  readAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const metadataSubSchema = new Schema({
  fileName: String,
  fileSize: Number,
  mimeType: String,
  thumbnail: String
}, { _id: false });

const messageSchema = new Schema<IMessage>({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    required: function() {
      return !this.encryptedContent || this.type === MessageType.MEDIA;
    },
    maxlength: 10000
  },
  encryptedContent: {
    type: String,
    required: false,
    select: false
  },
  encryptionKey: {
    type: String,
    required: false,
    select: false
  },
  iv: {
    type: String,
    required: false,
    select: false
  },
  type: {
    type: String,
    enum: Object.values(MessageType),
    default: MessageType.TEXT,
    required: true
  },
  metadata: {
    type: metadataSubSchema,
    default: null
  },
  status: {
    type: String,
    enum: Object.values(MessageStatus),
    default: MessageStatus.SENT,
    required: true,
    index: true
  },
  readBy: [readBySubSchema],
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  deletedAt: {
    type: Date,
    default: null,
    index: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc: any, ret: any) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better performance
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ status: 1 });
messageSchema.index({ deletedAt: 1 });
messageSchema.index({ replyTo: 1 });

// Compound indexes
messageSchema.index({ conversationId: 1, sender: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, deletedAt: 1, createdAt: -1 });

// Static methods
messageSchema.statics.findByConversation = async function(conversationId: string, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  return this.find({ 
    conversationId, 
    deletedAt: null 
  })
    .populate('sender', 'username displayName profilePicture')
    .populate('replyTo', 'content sender type')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

messageSchema.statics.findUnreadMessages = async function(userId: string) {
  return this.find({
    deletedAt: null,
    'readBy.user': { $ne: userId }
  })
    .populate('conversationId')
    .populate('sender', 'username displayName');
};

messageSchema.statics.countUnreadMessages = async function(userId: string, conversationId?: string) {
  const query: any = {
    deletedAt: null,
    'readBy.user': { $ne: userId }
  };
  
  if (conversationId) {
    query.conversationId = conversationId;
  }
  
  return this.countDocuments(query);
};

messageSchema.statics.findMessagesBySender = function(senderId: string, conversationId?: string) {
  const query: any = {
    sender: senderId,
    deletedAt: null
  };
  
  if (conversationId) {
    query.conversationId = conversationId;
  }
  
  return this.find(query)
    .populate('conversationId', 'participants isGroup groupName')
    .sort({ createdAt: -1 });
};

// Instance methods
messageSchema.methods.isReadBy = function(userId: string) {
  return this.readBy.some((read: any) => 
    read.user.toString() === userId
  );
};

messageSchema.methods.markAsRead = async function(userId: string) {
  if (!this.isReadBy(userId)) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    
    // Update status to READ if all participants have read it
    // This would require conversation participants info
    this.status = MessageStatus.READ;
  }
  return this.save();
};

messageSchema.methods.markAsDelivered = async function() {
  if (this.status === MessageStatus.SENT) {
    this.status = MessageStatus.DELIVERED;
  }
  return this.save();
};

messageSchema.methods.softDelete = async function() {
  this.deletedAt = new Date();
  return this.save();
};

messageSchema.methods.encryptContent = function(key?: string) {
  const EncryptionService = require('@/services/encryptionService').default;
  const encryptionService = new EncryptionService();
  
  if (this.type === MessageType.TEXT) {
    const encryption = encryptionService.encryptMessage(this.content, key);
    this.encryptedContent = encryption.encryptedContent;
    this.encryptionKey = encryption.encryptionKey;
    this.iv = encryption.iv;
    this.content = ''; // Clear original content for storage
  }
  
  return this.save();
};

messageSchema.methods.decryptContent = function() {
  const EncryptionService = require('@/services/encryptionService').default;
  const encryptionService = new EncryptionService();
  
  if (this.encryptedContent && this.encryptionKey && this.iv) {
    this.content = encryptionService.decryptMessage(
      this.encryptedContent,
      this.encryptionKey,
      this.iv
    );
  }
  
  return this.save();
};

messageSchema.methods.addReply = function(replyMessageId: string) {
  this.replyTo = replyMessageId;
  return this.save();
};

// Virtual for checking if message is deleted
messageSchema.virtual('isDeleted').get(function() {
  return !!this.deletedAt;
});

// Pre-save middleware
messageSchema.pre('save', function(next) {
  // For encrypted messages, content validation is different
  if (this.encryptedContent && this.type === MessageType.TEXT) {
    // Text messages should have content encrypted
    if (!this.content) {
      return next(new Error('Encrypted text messages must have content field'));
    }
  } else if (!this.encryptedContent && this.type === MessageType.TEXT) {
    // Non-encrypted text messages cannot be empty
    if (!this.content.trim()) {
      return next(new Error('Text messages cannot be empty'));
    }
  }

  // For media messages, ensure metadata exists
  if ([MessageType.IMAGE, MessageType.VIDEO, MessageType.DOCUMENT, MessageType.AUDIO].includes(this.type) && !this.metadata) {
    return next(new Error('Media messages must have metadata'));
  }
  
  next();
});

// Post-save middleware to update conversation's last message
messageSchema.post('save', async function() {
  if (this.deletedAt) return; // Don't update for deleted messages
  
  try {
    const Conversation = mongoose.model('Conversation');
    await Conversation.findByIdAndUpdate(this.conversationId, {
      lastMessage: {
        content: this.content,
        sender: this.sender,
        timestamp: this.createdAt,
        type: this.type
      },
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error updating conversation last message:', error);
  }
});

export const Message = mongoose.model<IMessage>('Message', messageSchema);
