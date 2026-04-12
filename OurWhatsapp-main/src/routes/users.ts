import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { User, Contact } from '@/models';
import { getRedisService } from '@/database/redis';
import { ApiResponse, UpdateUserRequest, PaginationQuery, PaginationResult } from '@/types';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '@/middleware/errorHandler';

let redisServiceInstance: any;

const router = Router();

function getRedisServiceInstance() {
  if (!redisServiceInstance) {
    redisServiceInstance = getRedisService();
  }
  return redisServiceInstance;
}

// Validation schemas
const updateProfileSchema = Joi.object({
  displayName: Joi.string().min(1).max(50).optional(),
  status: Joi.string().max(150).allow('').optional(),
  profilePicture: Joi.string().uri().optional()
});

const addContactSchema = Joi.object({
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  displayName: Joi.string().min(1).max(50).required()
});

const updateContactSchema = Joi.object({
  displayName: Joi.string().min(1).max(50).required()
});

const searchUsersSchema = Joi.object({
  query: Joi.string().min(2).max(50).required(),
  limit: Joi.number().integer().min(1).max(50).default(10)
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'displayName', 'lastSeen').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// GET /api/users/profile - Get current user profile
router.get('/profile', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  
  // Get user from database
  const user = await User.findById(userId).select('-publicKey');
  
  if (!user) {
    throw new NotFoundError('User');
  }

  // Get user's online status from Redis
  const isOnline = await getRedisServiceInstance().isUserOnline(userId);
  
  // Get unread message count
  const Message = require('@/models/Message').Message;
  const unreadCount = await Message.countUnreadMessages(userId);

  const response: ApiResponse = {
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

// PUT /api/users/profile - Update current user profile
router.put('/profile', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  
  const { error, value } = updateProfileSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { displayName, status, profilePicture } = value;

  // Get current user
  const user = await User.findById(userId);
  
  if (!user) {
    throw new NotFoundError('User');
  }

  // Update fields if provided
  if (displayName !== undefined) {
    user.displayName = displayName;
  }
  
  if (status !== undefined) {
    user.status = status;
  }
  
  if (profilePicture !== undefined) {
    user.profilePicture = profilePicture;
  }

  // Save updated user
  await user.save();

  // Update cache if user is online
  const isOnline = await getRedisServiceInstance().isUserOnline(userId);
  if (isOnline) {
    await getRedisServiceInstance().setCache(`user:${userId}`, (user as any).toSafeObject(), 3600);
  }

  const response: ApiResponse = {
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: (user as any).toSafeObject()
    }
  };

  res.status(200).json(response);
}));

// GET /api/users/contacts - Get user's contacts
router.get('/contacts', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  
  const { error, value } = paginationSchema.validate(req.query);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { page, limit, sortBy, sortOrder } = value;

  // Get user's contacts from database
  const contactDoc = await Contact.findOne({ userId });
  
  if (!contactDoc || contactDoc.contacts.length === 0) {
    const response: ApiResponse = {
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

  // Find actual users for each contact phone number
  const phoneNumbers = contactDoc.contacts.map((contact: any) => contact.phoneNumber);
  const users = await User.find({ 
    phoneNumber: { $in: phoneNumbers } 
  }).select('phoneNumber username displayName profilePicture isOnline lastSeen');

  // Merge contact display names with user data
  const contacts = contactDoc.contacts.map((contact: any) => {
    const user = users.find((u: any) => u.phoneNumber === contact.phoneNumber);
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

  // Sort contacts
  const sortField = sortBy === 'createdAt' ? 'addedAt' : 
                   sortBy === 'displayName' ? 'displayName' : 
                   'addedAt';
  
  contacts.sort((a: any, b: any) => {
    const aValue = a[sortField as keyof typeof a];
    const bValue = b[sortField as keyof typeof b];
    
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;
    
    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  // Paginate
  const total = contacts.length;
  const pages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedContacts = contacts.slice(startIndex, endIndex);

  const response: ApiResponse = {
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

// POST /api/users/contacts - Add new contact
router.post('/contacts', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  
  const { error, value } = addContactSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { phoneNumber, displayName } = value;

  // Check if trying to add self
  const currentUser = await User.findById(userId);
  if (currentUser && currentUser.phoneNumber === phoneNumber) {
    throw new ValidationError('You cannot add yourself as a contact');
  }

  // Check if contact already exists
  const existingContact = await Contact.findOne({
    userId,
    'contacts.phoneNumber': phoneNumber
  });

  if (existingContact) {
    throw new ConflictError('Contact already exists');
  }

  // Add contact to user's contact list
  await (Contact as any).addContact(userId, phoneNumber, displayName);

  // Try to find if this contact is a registered user
  const contactUser = await User.findOne({ phoneNumber })
    .select('username displayName profilePicture isOnline lastSeen');

  const response: ApiResponse = {
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

// PUT /api/users/contacts/:phoneNumber - Update contact display name
router.put('/contacts/:phoneNumber', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { phoneNumber } = req.params;
  
  const { error, value } = updateContactSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { displayName } = value;

  // Check if contact exists
  const contact = await Contact.findOne({
    userId,
    'contacts.phoneNumber': phoneNumber
  });

  if (!contact) {
    throw new NotFoundError('Contact');
  }

  // Update contact display name
  await (Contact as any).updateContact(userId, phoneNumber, displayName);

  const response: ApiResponse = {
    success: true,
    message: 'Contact updated successfully',
    data: {
      phoneNumber,
      displayName
    }
  };

  res.status(200).json(response);
}));

// DELETE /api/users/contacts/:phoneNumber - Remove contact
router.delete('/contacts/:phoneNumber', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { phoneNumber } = req.params;

  // Check if contact exists
  const contact = await Contact.findOne({
    userId,
    'contacts.phoneNumber': phoneNumber
  });

  if (!contact) {
    throw new NotFoundError('Contact');
  }

  // Remove contact
  await (Contact as any).removeContact(userId, phoneNumber);

  const response: ApiResponse = {
    success: true,
    message: 'Contact removed successfully',
    data: {
      phoneNumber
    }
  };

  res.status(200).json(response);
}));

// GET /api/users/search - Search for users by username or display name
router.get('/search', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  
  const { error, value } = searchUsersSchema.validate(req.query);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { query, limit } = value;

  // Search users (exclude current user)
  const users = await User.find({
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

  // Check which users are already in contacts
  const contactDoc = await Contact.findOne({ userId });
  const contactPhoneNumbers = contactDoc ? 
    contactDoc.contacts.map((c: any) => c.phoneNumber) : [];

  const results = users.map((user: any) => ({
    username: user.username,
    displayName: user.displayName,
    profilePicture: user.profilePicture,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen,
    phoneNumber: user.phoneNumber,
    isContact: contactPhoneNumbers.includes(user.phoneNumber)
  }));

  const response: ApiResponse = {
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

// GET /api/users/:userId - Get public user information
router.get('/:userId', asyncHandler(async (req: Request, res: Response) => {
  const currentUserId = req.userId!;
  const { userId } = req.params;

  // Validate userId format
  if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new ValidationError('Invalid user ID format');
  }

  // Get user information
  const user = await User.findById(userId)
    .select('username displayName profilePicture isOnline lastSeen');

  if (!user) {
    throw new NotFoundError('User');
  }

  // Check if this user is in current user's contacts
  const contactDoc = await Contact.findOne({ userId: currentUserId });
  const isContact = contactDoc ? 
    contactDoc.contacts.some((c: any) => c.phoneNumber === user.phoneNumber) : false;

  // Return limited public information
  const publicInfo = {
    username: user.username,
    displayName: user.displayName,
    profilePicture: user.profilePicture,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen,
    isContact
  };

  const response: ApiResponse = {
    success: true,
    message: 'User information retrieved successfully',
    data: {
      user: publicInfo
    }
  };

  res.status(200).json(response);
}));

// GET /api/users/online - Get list of online users (for testing/debugging)
router.get('/online', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  
  // Get online users from Redis
  const onlineUserIds = await getRedisServiceInstance().getOnlineUsers();
  
  // Get user details for online users
  const users = await User.find({
    _id: { $in: onlineUserIds, $ne: userId }
  }).select('username displayName profilePicture lastSeen');

  const response: ApiResponse = {
    success: true,
    message: 'Online users retrieved successfully',
    data: {
      users,
      total: users.length
    }
  };

  res.status(200).json(response);
}));

export default router;
