import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '@/types';

const userSchema = new Schema<IUser>({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: function(phone: string) {
        return /^\+?[1-9]\d{1,14}$/.test(phone);
      },
      message: 'Invalid phone number format'
    }
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    validate: {
      validator: function(username: string) {
        return /^[a-zA-Z0-9_]+$/.test(username);
      },
      message: 'Username can only contain letters, numbers, and underscores'
    }
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  profilePicture: {
    type: String,
    default: null
  },
  status: {
    type: String,
    maxlength: 150,
    default: ''
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  isOnline: {
    type: Boolean,
    default: false,
    index: true
  },
  publicKey: {
    type: String,
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
userSchema.index({ phoneNumber: 1 });
userSchema.index({ username: 1 });
userSchema.index({ isOnline: 1 });
userSchema.index({ lastSeen: 1 });

// Static methods
userSchema.statics.findByPhoneNumber = function(phoneNumber: string) {
  return this.findOne({ phoneNumber });
};

userSchema.statics.findByUsername = function(username: string) {
  return this.findOne({ username });
};

userSchema.statics.findOnlineUsers = function() {
  return this.find({ isOnline: true });
};

// Instance methods
userSchema.methods.toSafeObject = function() {
  const userObject = this.toObject();
  delete userObject.publicKey;
  delete userObject.__v;
  return userObject;
};

userSchema.methods.updateLastSeen = function() {
  this.lastSeen = new Date();
  return this.save();
};

userSchema.methods.setOnlineStatus = function(isOnline: boolean) {
  this.isOnline = isOnline;
  if (!isOnline) {
    this.lastSeen = new Date();
  }
  return this.save();
};

// Pre-save middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('phoneNumber') && !this.isModified('username')) {
    return next();
  }
  
  // Generate public key for encryption (simplified implementation)
  if (!this.publicKey) {
    const crypto = require('crypto');
    this.publicKey = crypto.randomBytes(32).toString('hex');
  }
  
  next();
});

export const User = mongoose.model<IUser>('User', userSchema);
