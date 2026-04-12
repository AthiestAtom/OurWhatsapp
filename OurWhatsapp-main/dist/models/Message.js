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
exports.Message = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const types_1 = require("@/types");
const readBySubSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    readAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });
const metadataSubSchema = new mongoose_1.Schema({
    fileName: String,
    fileSize: Number,
    mimeType: String,
    thumbnail: String
}, { _id: false });
const messageSchema = new mongoose_1.Schema({
    conversationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true
    },
    sender: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    content: {
        type: String,
        required: function () {
            return !this.encryptedContent || this.type === types_1.MessageType.MEDIA;
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
        enum: Object.values(types_1.MessageType),
        default: types_1.MessageType.TEXT,
        required: true
    },
    metadata: {
        type: metadataSubSchema,
        default: null
    },
    status: {
        type: String,
        enum: Object.values(types_1.MessageStatus),
        default: types_1.MessageStatus.SENT,
        required: true,
        index: true
    },
    readBy: [readBySubSchema],
    replyTo: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        transform: function (doc, ret) {
            delete ret.__v;
            return ret;
        }
    }
});
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ status: 1 });
messageSchema.index({ deletedAt: 1 });
messageSchema.index({ replyTo: 1 });
messageSchema.index({ conversationId: 1, sender: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, deletedAt: 1, createdAt: -1 });
messageSchema.statics.findByConversation = async function (conversationId, page = 1, limit = 50) {
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
messageSchema.statics.findUnreadMessages = async function (userId) {
    return this.find({
        deletedAt: null,
        'readBy.user': { $ne: userId }
    })
        .populate('conversationId')
        .populate('sender', 'username displayName');
};
messageSchema.statics.countUnreadMessages = async function (userId, conversationId) {
    const query = {
        deletedAt: null,
        'readBy.user': { $ne: userId }
    };
    if (conversationId) {
        query.conversationId = conversationId;
    }
    return this.countDocuments(query);
};
messageSchema.statics.findMessagesBySender = function (senderId, conversationId) {
    const query = {
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
messageSchema.methods.isReadBy = function (userId) {
    return this.readBy.some((read) => read.user.toString() === userId);
};
messageSchema.methods.markAsRead = async function (userId) {
    if (!this.isReadBy(userId)) {
        this.readBy.push({
            user: userId,
            readAt: new Date()
        });
        this.status = types_1.MessageStatus.READ;
    }
    return this.save();
};
messageSchema.methods.markAsDelivered = async function () {
    if (this.status === types_1.MessageStatus.SENT) {
        this.status = types_1.MessageStatus.DELIVERED;
    }
    return this.save();
};
messageSchema.methods.softDelete = async function () {
    this.deletedAt = new Date();
    return this.save();
};
messageSchema.methods.encryptContent = function (key) {
    const EncryptionService = require('@/services/encryptionService').default;
    const encryptionService = new EncryptionService();
    if (this.type === types_1.MessageType.TEXT) {
        const encryption = encryptionService.encryptMessage(this.content, key);
        this.encryptedContent = encryption.encryptedContent;
        this.encryptionKey = encryption.encryptionKey;
        this.iv = encryption.iv;
        this.content = '';
    }
    return this.save();
};
messageSchema.methods.decryptContent = function () {
    const EncryptionService = require('@/services/encryptionService').default;
    const encryptionService = new EncryptionService();
    if (this.encryptedContent && this.encryptionKey && this.iv) {
        this.content = encryptionService.decryptMessage(this.encryptedContent, this.encryptionKey, this.iv);
    }
    return this.save();
};
messageSchema.methods.addReply = function (replyMessageId) {
    this.replyTo = replyMessageId;
    return this.save();
};
messageSchema.virtual('isDeleted').get(function () {
    return !!this.deletedAt;
});
messageSchema.pre('save', function (next) {
    if (this.encryptedContent && this.type === types_1.MessageType.TEXT) {
        if (!this.content) {
            return next(new Error('Encrypted text messages must have content field'));
        }
    }
    else if (!this.encryptedContent && this.type === types_1.MessageType.TEXT) {
        if (!this.content.trim()) {
            return next(new Error('Text messages cannot be empty'));
        }
    }
    if ([types_1.MessageType.IMAGE, types_1.MessageType.VIDEO, types_1.MessageType.DOCUMENT, types_1.MessageType.AUDIO].includes(this.type) && !this.metadata) {
        return next(new Error('Media messages must have metadata'));
    }
    next();
});
messageSchema.post('save', async function () {
    if (this.deletedAt)
        return;
    try {
        const Conversation = mongoose_1.default.model('Conversation');
        await Conversation.findByIdAndUpdate(this.conversationId, {
            lastMessage: {
                content: this.content,
                sender: this.sender,
                timestamp: this.createdAt,
                type: this.type
            },
            updatedAt: new Date()
        });
    }
    catch (error) {
        console.error('Error updating conversation last message:', error);
    }
});
exports.Message = mongoose_1.default.model('Message', messageSchema);
//# sourceMappingURL=Message.js.map