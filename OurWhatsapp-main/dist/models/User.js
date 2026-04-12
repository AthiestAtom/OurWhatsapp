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
exports.User = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const userSchema = new mongoose_1.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
        validate: {
            validator: function (phone) {
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
            validator: function (username) {
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
        transform: function (doc, ret) {
            delete ret.__v;
            return ret;
        }
    }
});
userSchema.index({ phoneNumber: 1 });
userSchema.index({ username: 1 });
userSchema.index({ isOnline: 1 });
userSchema.index({ lastSeen: 1 });
userSchema.statics.findByPhoneNumber = function (phoneNumber) {
    return this.findOne({ phoneNumber });
};
userSchema.statics.findByUsername = function (username) {
    return this.findOne({ username });
};
userSchema.statics.findOnlineUsers = function () {
    return this.find({ isOnline: true });
};
userSchema.methods.toSafeObject = function () {
    const userObject = this.toObject();
    delete userObject.publicKey;
    delete userObject.__v;
    return userObject;
};
userSchema.methods.updateLastSeen = function () {
    this.lastSeen = new Date();
    return this.save();
};
userSchema.methods.setOnlineStatus = function (isOnline) {
    this.isOnline = isOnline;
    if (!isOnline) {
        this.lastSeen = new Date();
    }
    return this.save();
};
userSchema.pre('save', async function (next) {
    if (!this.isModified('phoneNumber') && !this.isModified('username')) {
        return next();
    }
    if (!this.publicKey) {
        const crypto = require('crypto');
        this.publicKey = crypto.randomBytes(32).toString('hex');
    }
    next();
});
exports.User = mongoose_1.default.model('User', userSchema);
//# sourceMappingURL=User.js.map