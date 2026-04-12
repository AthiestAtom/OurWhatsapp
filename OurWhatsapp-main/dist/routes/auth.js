"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const User_1 = require("@/models/User");
const redis_1 = require("@/database/redis");
const auth_1 = require("@/utils/auth");
const errorHandler_1 = require("@/middleware/errorHandler");
let redisServiceInstance;
const router = (0, express_1.Router)();
function getRedisServiceInstance() {
    if (!redisServiceInstance) {
        redisServiceInstance = (0, redis_1.getRedisService)();
    }
    return redisServiceInstance;
}
const registerSchema = joi_1.default.object({
    phoneNumber: joi_1.default.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    username: joi_1.default.string().alphanum().min(3).max(30).required(),
    displayName: joi_1.default.string().min(1).max(50).required(),
    verificationCode: joi_1.default.string().length(6).required()
});
const loginSchema = joi_1.default.object({
    phoneNumber: joi_1.default.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    verificationCode: joi_1.default.string().length(6).required()
});
const refreshTokenSchema = joi_1.default.object({
    refreshToken: joi_1.default.string().required()
});
const sendVerificationSchema = joi_1.default.object({
    phoneNumber: joi_1.default.string().pattern(/^\+?[1-9]\d{1,14}$/).required()
});
async function sendVerificationCode(phoneNumber) {
    const verificationCode = (0, auth_1.generateVerificationCode)();
    await getRedisServiceInstance().setCache(`verification:${phoneNumber}`, {
        code: verificationCode,
        attempts: 0,
        createdAt: new Date()
    }, 600);
    console.log(`📱 Verification code for ${phoneNumber}: ${verificationCode}`);
}
router.post('/register', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { phoneNumber, username, displayName, verificationCode } = value;
    if (!(0, auth_1.validatePhoneNumber)(phoneNumber)) {
        throw new errorHandler_1.ValidationError('Invalid phone number format');
    }
    const verificationData = await getRedisServiceInstance().getCache(`verification:${phoneNumber}`);
    if (!verificationData) {
        throw new errorHandler_1.ValidationError('Verification code expired or not found');
    }
    if (verificationData.code !== verificationCode) {
        verificationData.attempts++;
        await getRedisServiceInstance().setCache(`verification:${phoneNumber}`, verificationData, 600);
        if (verificationData.attempts >= 3) {
            await getRedisServiceInstance().deleteCache(`verification:${phoneNumber}`);
            throw new errorHandler_1.ValidationError('Too many failed attempts. Please request a new code.');
        }
        throw new errorHandler_1.ValidationError('Invalid verification code');
    }
    const existingUser = await User_1.User.findOne({
        $or: [{ phoneNumber }, { username }]
    });
    if (existingUser) {
        if (existingUser.phoneNumber === phoneNumber) {
            throw new errorHandler_1.ValidationError('Phone number already registered');
        }
        if (existingUser.username === username) {
            throw new errorHandler_1.ValidationError('Username already taken');
        }
    }
    const user = new User_1.User({
        phoneNumber,
        username,
        displayName
    });
    await user.save();
    const { accessToken, refreshToken } = (0, auth_1.generateTokens)(user._id.toString(), phoneNumber);
    await getRedisServiceInstance().setSession(user._id.toString(), {
        refreshToken,
        loginTime: new Date(),
        lastActivity: new Date()
    }, 604800);
    await getRedisServiceInstance().deleteCache(`verification:${phoneNumber}`);
    const response = {
        success: true,
        message: 'User registered successfully',
        data: {
            user: user.toSafeObject(),
            accessToken,
            refreshToken
        }
    };
    res.status(201).json(response);
}));
router.post('/login', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { phoneNumber, verificationCode } = value;
    if (!(0, auth_1.validatePhoneNumber)(phoneNumber)) {
        throw new errorHandler_1.ValidationError('Invalid phone number format');
    }
    const verificationData = await getRedisServiceInstance().getCache(`verification:${phoneNumber}`);
    if (!verificationData) {
        throw new errorHandler_1.ValidationError('Verification code expired or not found');
    }
    if (verificationData.code !== verificationCode) {
        verificationData.attempts++;
        await getRedisServiceInstance().setCache(`verification:${phoneNumber}`, verificationData, 600);
        if (verificationData.attempts >= 3) {
            await getRedisServiceInstance().deleteCache(`verification:${phoneNumber}`);
            throw new errorHandler_1.ValidationError('Too many failed attempts. Please request a new code.');
        }
        throw new errorHandler_1.ValidationError('Invalid verification code');
    }
    const user = await User_1.User.findOne({ phoneNumber });
    if (!user) {
        throw new errorHandler_1.AuthenticationError('User not found. Please register first.');
    }
    user.lastSeen = new Date();
    user.isOnline = true;
    await user.save();
    const { accessToken, refreshToken } = (0, auth_1.generateTokens)(user._id.toString(), phoneNumber);
    await getRedisServiceInstance().setSession(user._id.toString(), {
        refreshToken,
        loginTime: new Date(),
        lastActivity: new Date()
    }, 604800);
    await getRedisServiceInstance().deleteCache(`verification:${phoneNumber}`);
    const response = {
        success: true,
        message: 'Login successful',
        data: {
            user: user.toSafeObject(),
            accessToken,
            refreshToken
        }
    };
    res.status(200).json(response);
}));
router.post('/refresh', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { error, value } = refreshTokenSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { refreshToken } = value;
    const { userId, phoneNumber } = (0, auth_1.verifyRefreshToken)(refreshToken);
    const session = await getRedisServiceInstance().getSession(userId);
    if (!session || session.refreshToken !== refreshToken) {
        throw new errorHandler_1.AuthenticationError('Invalid refresh token');
    }
    const user = await User_1.User.findById(userId);
    if (!user) {
        throw new errorHandler_1.AuthenticationError('User not found');
    }
    const { accessToken, refreshToken: newRefreshToken } = (0, auth_1.generateTokens)(userId, phoneNumber);
    await getRedisServiceInstance().setSession(userId, {
        ...session,
        refreshToken: newRefreshToken,
        lastActivity: new Date()
    }, 604800);
    const response = {
        success: true,
        message: 'Token refreshed successfully',
        data: {
            accessToken,
            refreshToken: newRefreshToken
        }
    };
    res.status(200).json(response);
}));
router.post('/logout', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        try {
            const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            const userId = decoded.userId;
            await getRedisServiceInstance().deleteSession(userId);
            await User_1.User.findByIdAndUpdate(userId, {
                isOnline: false,
                lastSeen: new Date()
            });
        }
        catch (error) {
            console.error('Logout error:', error);
        }
    }
    const response = {
        success: true,
        message: 'Logout successful'
    };
    res.status(200).json(response);
}));
router.post('/send-verification', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { error, value } = sendVerificationSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { phoneNumber } = value;
    if (!(0, auth_1.validatePhoneNumber)(phoneNumber)) {
        throw new errorHandler_1.ValidationError('Invalid phone number format');
    }
    const rateLimitKey = `verification_limit:${phoneNumber}`;
    const attempts = await getRedisServiceInstance().incrementRateLimit(rateLimitKey, 3600000);
    if (attempts > 3) {
        throw new errorHandler_1.ValidationError('Too many verification code requests. Please try again later.');
    }
    await sendVerificationCode(phoneNumber);
    const response = {
        success: true,
        message: 'Verification code sent successfully'
    };
    res.status(200).json(response);
}));
router.post('/verify-phone', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { error, value } = sendVerificationSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { phoneNumber } = value;
    if (!(0, auth_1.validatePhoneNumber)(phoneNumber)) {
        throw new errorHandler_1.ValidationError('Invalid phone number format');
    }
    const existingUser = await User_1.User.findOne({ phoneNumber });
    const response = {
        success: true,
        message: 'Phone number check completed',
        data: {
            available: !existingUser,
            phoneNumber
        }
    };
    res.status(200).json(response);
}));
exports.default = router;
//# sourceMappingURL=auth.js.map