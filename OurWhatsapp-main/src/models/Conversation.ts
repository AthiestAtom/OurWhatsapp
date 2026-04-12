import mongoose, { Schema } from 'mongoose';
import { IConversation, MessageType } from '../types';

const messageSubSchema = new Schema({
  content: {
    type: String,
    required: true
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  type: {
    type: String,
    enum: Object.values(MessageType),
    default: MessageType.TEXT
  }
}, { _id: false });

const conversationSchema = new Schema<IConversation>({
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  isGroup: {
    type: Boolean,
    default: false,
    required: true
  },
  groupName: {
    type: String,
    trim: true,
    maxlength: 50,
    validate: {
      validator: function(this: IConversation, name: string) {
        return !this.isGroup || (name && name.trim().length > 0);
      },
      message: 'Group name is required for group conversations'
    }
  },
  groupPicture: {
    type: String,
    default: null
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  lastMessage: {
    type: messageSubSchema,
    default: null
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ createdBy: 1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ 'lastMessage.timestamp': -1 });

// Compound indexes
conversationSchema.index({ participants: 1, updatedAt: -1 });

// Static methods
conversationSchema.statics.findByParticipant = function(userId: string) {
  return this.find({ participants: userId })
    .populate('participants', 'username displayName profilePicture isOnline lastSeen')
    .populate('lastMessage.sender', 'username displayName')
    .sort({ updatedAt: -1 });
};

conversationSchema.statics.findByUsername = function(username: string) {
  return this.findOne({ username });
};

conversationSchema.statics.findPrivateConversation = function(userId1: string, userId2: string) {
  return this.findOne({
    participants: { $all: [userId1, userId2] },
    isGroup: false
  });
};

conversationSchema.statics.findGroupConversations = function(userId: string) {
  return this.find({
    participants: userId,
    isGroup: true
  })
    .populate('participants', 'username displayName profilePicture isOnline lastSeen')
    .populate('createdBy', 'username displayName')
    .populate('admins', 'username displayName')
    .sort({ updatedAt: -1 });
};

// Instance methods
conversationSchema.methods.isParticipant = function(userId: string) {
  return this.participants.some((participant: any) => 
    participant.toString() === userId
  );
};

conversationSchema.methods.isAdmin = function(userId: string) {
  if (!this.isGroup) return false;
  return this.admins.some((admin: any) => 
    admin.toString() === userId
  );
};

conversationSchema.methods.isCreator = function(userId: string) {
  return this.createdBy.toString() === userId;
};

conversationSchema.methods.addParticipant = function(userId: string) {
  if (!this.isParticipant(userId)) {
    this.participants.push(userId);
  }
  return this.save();
};

conversationSchema.methods.removeParticipant = function(userId: string) {
  this.participants = this.participants.filter((participant: any) => 
    participant.toString() !== userId
  );
  
  // Remove from admins if they were an admin
  this.admins = this.admins.filter((admin: any) => 
    admin.toString() !== userId
  );
  
  return this.save();
};

conversationSchema.methods.addAdmin = function(userId: string) {
  if (!this.isAdmin(userId) && this.isParticipant(userId)) {
    this.admins.push(userId);
  }
  return this.save();
};

conversationSchema.methods.removeAdmin = function(userId: string) {
  this.admins = this.admins.filter((admin: any) => 
    admin.toString() !== userId
  );
  return this.save();
};

conversationSchema.methods.updateLastMessage = function(messageData: any) {
  this.lastMessage = messageData;
  this.updatedAt = new Date();
  return this.save();
};

// Validation
conversationSchema.pre('save', function(next) {
  // Ensure creator is a participant
  if (!this.participants.includes(this.createdBy)) {
    this.participants.push(this.createdBy);
  }
  
  // For private conversations, ensure only 2 participants
  if (!this.isGroup && this.participants.length !== 2) {
    return next(new Error('Private conversations must have exactly 2 participants'));
  }
  
  // For group conversations, ensure creator is an admin
  if (this.isGroup && !this.admins.includes(this.createdBy)) {
    this.admins.push(this.createdBy);
  }
  
  next();
});

export const Conversation = mongoose.model<IConversation>('Conversation', conversationSchema);
