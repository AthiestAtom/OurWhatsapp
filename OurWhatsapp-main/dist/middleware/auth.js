"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.optionalAuthMiddleware = optionalAuthMiddleware;
exports.requireOwnership = requireOwnership;
exports.requireParticipant = requireParticipant;
exports.requireAdmin = requireAdmin;
exports.validateApiKey = validateApiKey;
exports.rateLimitMiddleware = rateLimitMiddleware;
const auth_1 = require("../utils/auth");
const models_1 = require("../models");
async function authMiddleware(req, res, next) {
    try {
        const token = (0, auth_1.extractTokenFromHeader)(req.headers.authorization);
        if (!token) {
            const response = {
                success: false,
                message: 'Access token required',
                error: 'UNAUTHORIZED'
            };
            res.status(401).json(response);
            return;
        }
        const decoded = (0, auth_1.verifyToken)(token);
        const user = await models_1.User.findById(decoded.userId).select('-publicKey');
        if (!user) {
            const response = {
                success: false,
                message: 'User not found',
                error: 'USER_NOT_FOUND'
            };
            res.status(401).json(response);
            return;
        }
        req.user = user;
        req.userId = decoded.userId;
        next();
    }
    catch (error) {
        console.error('Auth middleware error:', error);
        const response = {
            success: false,
            message: 'Invalid or expired token',
            error: 'INVALID_TOKEN'
        };
        res.status(401).json(response);
    }
}
async function optionalAuthMiddleware(req, res, next) {
    try {
        const token = (0, auth_1.extractTokenFromHeader)(req.headers.authorization);
        if (token) {
            const decoded = (0, auth_1.verifyToken)(token);
            const user = await models_1.User.findById(decoded.userId).select('-publicKey');
            if (user) {
                req.user = user;
                req.userId = decoded.userId;
            }
        }
        next();
    }
    catch (error) {
        next();
    }
}
function requireOwnership(resourceUserIdField = 'userId') {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                const response = {
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTH_REQUIRED'
                };
                res.status(401).json(response);
                return;
            }
            const resourceUserId = req.body[resourceUserIdField] || req.params[resourceUserIdField];
            if (resourceUserId !== req.userId) {
                const response = {
                    success: false,
                    message: 'Access denied',
                    error: 'ACCESS_DENIED'
                };
                res.status(403).json(response);
                return;
            }
            next();
        }
        catch (error) {
            console.error('Ownership middleware error:', error);
            const response = {
                success: false,
                message: 'Access verification failed',
                error: 'VERIFICATION_FAILED'
            };
            res.status(500).json(response);
        }
    };
}
function requireParticipant(conversationIdParam = 'conversationId') {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                const response = {
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTH_REQUIRED'
                };
                res.status(401).json(response);
                return;
            }
            const conversationId = req.params[conversationIdParam] || req.body[conversationIdParam];
            if (!conversationId) {
                const response = {
                    success: false,
                    message: 'Conversation ID required',
                    error: 'CONVERSATION_ID_REQUIRED'
                };
                res.status(400).json(response);
                return;
            }
            const Conversation = require('@/models/Conversation').Conversation;
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                const response = {
                    success: false,
                    message: 'Conversation not found',
                    error: 'CONVERSATION_NOT_FOUND'
                };
                res.status(404).json(response);
                return;
            }
            if (!conversation.isParticipant(req.userId)) {
                const response = {
                    success: false,
                    message: 'Not a participant in this conversation',
                    error: 'NOT_PARTICIPANT'
                };
                res.status(403).json(response);
                return;
            }
            next();
        }
        catch (error) {
            console.error('Participant middleware error:', error);
            const response = {
                success: false,
                message: 'Access verification failed',
                error: 'VERIFICATION_FAILED'
            };
            res.status(500).json(response);
        }
    };
}
function requireAdmin(conversationIdParam = 'conversationId') {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                const response = {
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTH_REQUIRED'
                };
                res.status(401).json(response);
                return;
            }
            const conversationId = req.params[conversationIdParam] || req.body[conversationIdParam];
            if (!conversationId) {
                const response = {
                    success: false,
                    message: 'Conversation ID required',
                    error: 'CONVERSATION_ID_REQUIRED'
                };
                res.status(400).json(response);
                return;
            }
            const Conversation = require('@/models/Conversation').Conversation;
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                const response = {
                    success: false,
                    message: 'Conversation not found',
                    error: 'CONVERSATION_NOT_FOUND'
                };
                res.status(404).json(response);
                return;
            }
            if (!conversation.isAdmin(req.userId) && !conversation.isCreator(req.userId)) {
                const response = {
                    success: false,
                    message: 'Admin privileges required',
                    error: 'ADMIN_REQUIRED'
                };
                res.status(403).json(response);
                return;
            }
            next();
        }
        catch (error) {
            console.error('Admin middleware error:', error);
            const response = {
                success: false,
                message: 'Access verification failed',
                error: 'VERIFICATION_FAILED'
            };
            res.status(500).json(response);
        }
    };
}
function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        const response = {
            success: false,
            message: 'API key required',
            error: 'API_KEY_REQUIRED'
        };
        res.status(401).json(response);
        return;
    }
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
    if (!validApiKeys.includes(apiKey)) {
        const response = {
            success: false,
            message: 'Invalid API key',
            error: 'INVALID_API_KEY'
        };
        res.status(401).json(response);
        return;
    }
    next();
}
function rateLimitMiddleware(maxRequests = 100, windowMs = 15 * 60 * 1000) {
    const requests = new Map();
    return (req, res, next) => {
        const identifier = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        const now = Date.now();
        const windowStart = now - windowMs;
        for (const [key, value] of requests.entries()) {
            if (value.resetTime < now) {
                requests.delete(key);
            }
        }
        const userRequests = requests.get(identifier);
        if (!userRequests || userRequests.resetTime < now) {
            requests.set(identifier, { count: 1, resetTime: now + windowMs });
            next();
            return;
        }
        if (userRequests.count >= maxRequests) {
            const response = {
                success: false,
                message: 'Too many requests, please try again later',
                error: 'RATE_LIMIT_EXCEEDED'
            };
            res.status(429).json(response);
            return;
        }
        userRequests.count++;
        next();
    };
}
//# sourceMappingURL=auth.js.map