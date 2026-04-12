"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const models_1 = require("@/models");
const redis_1 = require("@/database/redis");
const errorHandler_1 = require("@/middleware/errorHandler");
let redisServiceInstance;
const router = (0, express_1.Router)();
function getRedisServiceInstance() {
    if (!redisServiceInstance) {
        redisServiceInstance = (0, redis_1.getRedisService)();
    }
    return redisServiceInstance;
}
const updateProfileSchema = joi_1.default.object({
    displayName: joi_1.default.string().min(1).max(50).optional(),
    status: joi_1.default.string().max(150).allow('').optional(),
    profilePicture: joi_1.default.string().uri().optional()
});
const addContactSchema = joi_1.default.object({
    phoneNumber: joi_1.default.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    displayName: joi_1.default.string().min(1).max(50).required()
});
const updateContactSchema = joi_1.default.object({
    displayName: joi_1.default.string().min(1).max(50).required()
});
const searchUsersSchema = joi_1.default.object({
    query: joi_1.default.string().min(2).max(50).required(),
    limit: joi_1.default.number().integer().min(1).max(50).default(10)
});
const paginationSchema = joi_1.default.object({
    page: joi_1.default.number().integer().min(1).default(1),
    limit: joi_1.default.number().integer().min(1).max(100).default(20),
    sortBy: joi_1.default.string().valid('createdAt', 'updatedAt', 'displayName', 'lastSeen').default('createdAt'),
    sortOrder: joi_1.default.string().valid('asc', 'desc').default('desc')
});
router.get('/profile', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const user = await models_1.User.findById(userId).select('-publicKey');
    if (!user) {
        throw new errorHandler_1.NotFoundError('User');
    }
    const isOnline = await getRedisServiceInstance().isUserOnline(userId);
    const Message = require('@/models/Message').Message;
    const unreadCount = await Message.countUnreadMessages(userId);
    const response = {
        success: true,
        message: 'Profile retrieved successfully',
        data: {
            user: {
                ...user.toObject(),
                isOnline,
                unreadMessages: unreadCount
            }
        }
    };
    res.status(200).json(response);
}));
router.put('/profile', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { displayName, status, profilePicture } = value;
    const user = await models_1.User.findById(userId);
    if (!user) {
        throw new errorHandler_1.NotFoundError('User');
    }
    if (displayName !== undefined) {
        user.displayName = displayName;
    }
    if (status !== undefined) {
        user.status = status;
    }
    if (profilePicture !== undefined) {
        user.profilePicture = profilePicture;
    }
    await user.save();
    const isOnline = await getRedisServiceInstance().isUserOnline(userId);
    if (isOnline) {
        await getRedisServiceInstance().setCache(`user:${userId}`, user.toSafeObject(), 3600);
    }
    const response = {
        success: true,
        message: 'Profile updated successfully',
        data: {
            user: user.toSafeObject()
        }
    };
    res.status(200).json(response);
}));
router.get('/contacts', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { error, value } = paginationSchema.validate(req.query);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { page, limit, sortBy, sortOrder } = value;
    const contactDoc = await models_1.Contact.findOne({ userId });
    if (!contactDoc || contactDoc.contacts.length === 0) {
        const response = {
            success: true,
            message: 'No contacts found',
            data: {
                contacts: [],
                pagination: {
                    page,
                    limit,
                    total: 0,
                    pages: 0
                }
            }
        };
        return res.status(200).json(response);
    }
    const phoneNumbers = contactDoc.contacts.map((contact) => contact.phoneNumber);
    const users = await models_1.User.find({
        phoneNumber: { $in: phoneNumbers }
    }).select('phoneNumber username displayName profilePicture isOnline lastSeen');
    const contacts = contactDoc.contacts.map((contact) => {
        const user = users.find((u) => u.phoneNumber === contact.phoneNumber);
        return {
            phoneNumber: contact.phoneNumber,
            displayName: contact.displayName,
            addedAt: contact.addedAt,
            user: user ? {
                username: user.username,
                profilePicture: user.profilePicture,
                isOnline: user.isOnline,
                lastSeen: user.lastSeen
            } : null
        };
    });
    const sortField = sortBy === 'createdAt' ? 'addedAt' :
        sortBy === 'displayName' ? 'displayName' :
            'addedAt';
    contacts.sort((a, b) => {
        const aValue = a[sortField];
        const bValue = b[sortField];
        if (aValue === null || aValue === undefined)
            return 1;
        if (bValue === null || bValue === undefined)
            return -1;
        if (sortOrder === 'asc') {
            return aValue > bValue ? 1 : -1;
        }
        else {
            return aValue < bValue ? 1 : -1;
        }
    });
    const total = contacts.length;
    const pages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedContacts = contacts.slice(startIndex, endIndex);
    const response = {
        success: true,
        message: 'Contacts retrieved successfully',
        data: {
            contacts: paginatedContacts,
            pagination: {
                page,
                limit,
                total,
                pages
            }
        }
    };
    res.status(200).json(response);
    return;
}));
router.post('/contacts', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { error, value } = addContactSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { phoneNumber, displayName } = value;
    const currentUser = await models_1.User.findById(userId);
    if (currentUser && currentUser.phoneNumber === phoneNumber) {
        throw new errorHandler_1.ValidationError('You cannot add yourself as a contact');
    }
    const existingContact = await models_1.Contact.findOne({
        userId,
        'contacts.phoneNumber': phoneNumber
    });
    if (existingContact) {
        throw new errorHandler_1.ConflictError('Contact already exists');
    }
    await models_1.Contact.addContact(userId, phoneNumber, displayName);
    const contactUser = await models_1.User.findOne({ phoneNumber })
        .select('username displayName profilePicture isOnline lastSeen');
    const response = {
        success: true,
        message: 'Contact added successfully',
        data: {
            contact: {
                phoneNumber,
                displayName,
                addedAt: new Date(),
                user: contactUser ? {
                    username: contactUser.username,
                    displayName: contactUser.displayName,
                    profilePicture: contactUser.profilePicture,
                    isOnline: contactUser.isOnline,
                    lastSeen: contactUser.lastSeen
                } : null
            }
        }
    };
    res.status(201).json(response);
}));
router.put('/contacts/:phoneNumber', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { phoneNumber } = req.params;
    const { error, value } = updateContactSchema.validate(req.body);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { displayName } = value;
    const contact = await models_1.Contact.findOne({
        userId,
        'contacts.phoneNumber': phoneNumber
    });
    if (!contact) {
        throw new errorHandler_1.NotFoundError('Contact');
    }
    await models_1.Contact.updateContact(userId, phoneNumber, displayName);
    const response = {
        success: true,
        message: 'Contact updated successfully',
        data: {
            phoneNumber,
            displayName
        }
    };
    res.status(200).json(response);
}));
router.delete('/contacts/:phoneNumber', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { phoneNumber } = req.params;
    const contact = await models_1.Contact.findOne({
        userId,
        'contacts.phoneNumber': phoneNumber
    });
    if (!contact) {
        throw new errorHandler_1.NotFoundError('Contact');
    }
    await models_1.Contact.removeContact(userId, phoneNumber);
    const response = {
        success: true,
        message: 'Contact removed successfully',
        data: {
            phoneNumber
        }
    };
    res.status(200).json(response);
}));
router.get('/search', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { error, value } = searchUsersSchema.validate(req.query);
    if (error) {
        throw new errorHandler_1.ValidationError(error.details[0].message);
    }
    const { query, limit } = value;
    const users = await models_1.User.find({
        $and: [
            { _id: { $ne: userId } },
            {
                $or: [
                    { username: { $regex: query, $options: 'i' } },
                    { displayName: { $regex: query, $options: 'i' } }
                ]
            }
        ]
    })
        .select('username displayName profilePicture isOnline lastSeen phoneNumber')
        .limit(limit);
    const contactDoc = await models_1.Contact.findOne({ userId });
    const contactPhoneNumbers = contactDoc ?
        contactDoc.contacts.map((c) => c.phoneNumber) : [];
    const results = users.map((user) => ({
        username: user.username,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        phoneNumber: user.phoneNumber,
        isContact: contactPhoneNumbers.includes(user.phoneNumber)
    }));
    const response = {
        success: true,
        message: 'Users found',
        data: {
            users: results,
            query,
            total: results.length
        }
    };
    res.status(200).json(response);
}));
router.get('/:userId', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const currentUserId = req.userId;
    const { userId } = req.params;
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new errorHandler_1.ValidationError('Invalid user ID format');
    }
    const user = await models_1.User.findById(userId)
        .select('username displayName profilePicture isOnline lastSeen');
    if (!user) {
        throw new errorHandler_1.NotFoundError('User');
    }
    const contactDoc = await models_1.Contact.findOne({ userId: currentUserId });
    const isContact = contactDoc ?
        contactDoc.contacts.some((c) => c.phoneNumber === user.phoneNumber) : false;
    const publicInfo = {
        username: user.username,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        isContact
    };
    const response = {
        success: true,
        message: 'User information retrieved successfully',
        data: {
            user: publicInfo
        }
    };
    res.status(200).json(response);
}));
router.get('/online', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const onlineUserIds = await getRedisServiceInstance().getOnlineUsers();
    const users = await models_1.User.find({
        _id: { $in: onlineUserIds, $ne: userId }
    }).select('username displayName profilePicture lastSeen');
    const response = {
        success: true,
        message: 'Online users retrieved successfully',
        data: {
            users,
            total: users.length
        }
    };
    res.status(200).json(response);
}));
exports.default = router;
//# sourceMappingURL=users.js.map