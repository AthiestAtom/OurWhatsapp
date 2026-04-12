"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Conversation = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const types_1 = require("@/types");
const messageSubSchema = new mongoose_1.Schema({
    content: {
        type: String,
        required: true
    },
    sender: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    type: {
        type: String,
        enum: Object.values(types_1.MessageType),
        default: types_1.MessageType.TEXT
    }
}, { _id: false });
const conversationSchema = new mongoose_1.Schema({
    participants: [{
            type: mongoose_1.Schema.Types.ObjectId,
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
            validator: function (name) {
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    admins: [{
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'User'
        }],
    lastMessage: {
        type: messageSubSchema,
        default: null
    }
}, {
    timestamps: true,
    toJSON: {
        transform: function (doc, ret) {
            delete ret.__v;
            return ret;
        }
    }
});
conversationSchema.index({ participants: 1 });
conversationSchema.index({ createdBy: 1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ 'lastMessage.timestamp': -1 });
conversationSchema.index({ participants: 1, updatedAt: -1 });
conversationSchema.statics.findByParticipant = function (userId) {
    return this.find({ participants: userId })
        .populate('participants', 'username displayName profilePicture isOnline lastSeen')
        .populate('lastMessage.sender', 'username displayName')
        .sort({ updatedAt: -1 });
};
conversationSchema.statics.findByUsername = function (username) {
    return this.findOne({ username });
};
conversationSchema.statics.findPrivateConversation = function (userId1, userId2) {
    return this.findOne({
        participants: { $all: [userId1, userId2] },
        isGroup: false
    });
};
conversationSchema.statics.findGroupConversations = function (userId) {
    return this.find({
        participants: userId,
        isGroup: true
    })
        .populate('participants', 'username displayName profilePicture isOnline lastSeen')
        .populate('createdBy', 'username displayName')
        .populate('admins', 'username displayName')
        .sort({ updatedAt: -1 });
};
conversationSchema.methods.isParticipant = function (userId) {
    return this.participants.some((participant) => participant.toString() === userId);
};
conversationSchema.methods.isAdmin = function (userId) {
    if (!this.isGroup)
        return false;
    return this.admins.some((admin) => admin.toString() === userId);
};
conversationSchema.methods.isCreator = function (userId) {
    return this.createdBy.toString() === userId;
};
conversationSchema.methods.addParticipant = function (userId) {
    if (!this.isParticipant(userId)) {
        this.participants.push(userId);
    }
    return this.save();
};
conversationSchema.methods.removeParticipant = function (userId) {
    this.participants = this.participants.filter((participant) => participant.toString() !== userId);
    this.admins = this.admins.filter((admin) => admin.toString() !== userId);
    return this.save();
};
conversationSchema.methods.addAdmin = function (userId) {
    if (!this.isAdmin(userId) && this.isParticipant(userId)) {
        this.admins.push(userId);
    }
    return this.save();
};
conversationSchema.methods.removeAdmin = function (userId) {
    this.admins = this.admins.filter((admin) => admin.toString() !== userId);
    return this.save();
};
conversationSchema.methods.updateLastMessage = function (messageData) {
    this.lastMessage = messageData;
    this.updatedAt = new Date();
    return this.save();
};
conversationSchema.pre('save', function (next) {
    if (!this.participants.includes(this.createdBy)) {
        this.participants.push(this.createdBy);
    }
    if (!this.isGroup && this.participants.length !== 2) {
        return next(new Error('Private conversations must have exactly 2 participants'));
    }
    if (this.isGroup && !this.admins.includes(this.createdBy)) {
        this.admins.push(this.createdBy);
    }
    next();
});
exports.Conversation = mongoose_1.default.model('Conversation', conversationSchema);
//# sourceMappingURL=Conversation.js.map