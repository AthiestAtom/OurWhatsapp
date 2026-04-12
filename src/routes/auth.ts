import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { User } from '@/models/User';
import { getRedisService } from '@/database/redis';
import { ApiResponse, JWTPayload } from '@/types';
import { generateTokens, verifyRefreshToken, validatePhoneNumber, generateVerificationCode } from '@/utils/auth';
import { asyncHandler, ValidationError, AuthenticationError } from '@/middleware/errorHandler';

let redisServiceInstance: any;

const router = Router();

function getRedisServiceInstance() {
  if (!redisServiceInstance) {
    redisServiceInstance = getRedisService();
  }
  return redisServiceInstance;
}

// Validation schemas
const registerSchema = Joi.object({
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  displayName: Joi.string().min(1).max(50).required(),
  verificationCode: Joi.string().length(6).required()
});

const loginSchema = Joi.object({
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  verificationCode: Joi.string().length(6).required()
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

const sendVerificationSchema = Joi.object({
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required()
});

// Generate and send verification code (mock implementation)
async function sendVerificationCode(phoneNumber: string): Promise<void> {
  // In production, integrate with SMS service like Twilio, AWS SNS, etc.
  const verificationCode = generateVerificationCode();
  
  // Store in Redis with 10 minutes expiry
  await getRedisServiceInstance().setCache(`verification:${phoneNumber}`, {
    code: verificationCode,
    attempts: 0,
    createdAt: new Date()
  }, 600); // 10 minutes
  
  console.log(`📱 Verification code for ${phoneNumber}: ${verificationCode}`);
  
  // TODO: Replace with actual SMS service
  // await twilioService.sendSMS(phoneNumber, `Your verification code is: ${verificationCode}`);
}

// Register new user
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = registerSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { phoneNumber, username, displayName, verificationCode } = value;

  // Verify phone number format
  if (!validatePhoneNumber(phoneNumber)) {
    throw new ValidationError('Invalid phone number format');
  }

  // Check verification code
  const verificationData = await getRedisServiceInstance().getCache(`verification:${phoneNumber}`);
  
  if (!verificationData) {
    throw new ValidationError('Verification code expired or not found');
  }

  if (verificationData.code !== verificationCode) {
    // Increment attempts
    verificationData.attempts++;
    await getRedisServiceInstance().setCache(`verification:${phoneNumber}`, verificationData, 600);
    
    if (verificationData.attempts >= 3) {
      await getRedisServiceInstance().deleteCache(`verification:${phoneNumber}`);
      throw new ValidationError('Too many failed attempts. Please request a new code.');
    }
    
    throw new ValidationError('Invalid verification code');
  }

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ phoneNumber }, { username }]
  });

  if (existingUser) {
    if (existingUser.phoneNumber === phoneNumber) {
      throw new ValidationError('Phone number already registered');
    }
    if (existingUser.username === username) {
      throw new ValidationError('Username already taken');
    }
  }

  // Create new user
  const user = new User({
    phoneNumber,
    username,
    displayName
  });

  await user.save();

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user._id.toString(), phoneNumber);

  // Store refresh token in Redis
  await getRedisServiceInstance().setSession(user._id.toString(), {
    refreshToken,
    loginTime: new Date(),
    lastActivity: new Date()
  }, 604800); // 7 days

  // Clear verification code
  await getRedisServiceInstance().deleteCache(`verification:${phoneNumber}`);

  const response: ApiResponse = {
    success: true,
    message: 'User registered successfully',
    data: {
      user: (user as any).toSafeObject(),
      accessToken,
      refreshToken
    }
  };

  res.status(201).json(response);
}));

// Login user
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = loginSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { phoneNumber, verificationCode } = value;

  // Verify phone number format
  if (!validatePhoneNumber(phoneNumber)) {
    throw new ValidationError('Invalid phone number format');
  }

  // Check verification code
  const verificationData = await getRedisServiceInstance().getCache(`verification:${phoneNumber}`);
  
  if (!verificationData) {
    throw new ValidationError('Verification code expired or not found');
  }

  if (verificationData.code !== verificationCode) {
    verificationData.attempts++;
    await getRedisServiceInstance().setCache(`verification:${phoneNumber}`, verificationData, 600);
    
    if (verificationData.attempts >= 3) {
      await getRedisServiceInstance().deleteCache(`verification:${phoneNumber}`);
      throw new ValidationError('Too many failed attempts. Please request a new code.');
    }
    
    throw new ValidationError('Invalid verification code');
  }

  // Find user
  const user = await User.findOne({ phoneNumber });
  
  if (!user) {
    throw new AuthenticationError('User not found. Please register first.');
  }

  // Update last seen and online status
  user.lastSeen = new Date();
  user.isOnline = true;
  await user.save();

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user._id.toString(), phoneNumber);

  // Store refresh token in Redis
  await getRedisServiceInstance().setSession(user._id.toString(), {
    refreshToken,
    loginTime: new Date(),
    lastActivity: new Date()
  }, 604800); // 7 days

  // Clear verification code
  await getRedisServiceInstance().deleteCache(`verification:${phoneNumber}`);

  const response: ApiResponse = {
    success: true,
    message: 'Login successful',
    data: {
      user: (user as any).toSafeObject(),
      accessToken,
      refreshToken
    }
  };

  res.status(200).json(response);
}));

// Refresh access token
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = refreshTokenSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { refreshToken } = value;

  // Verify refresh token
  const { userId, phoneNumber } = verifyRefreshToken(refreshToken);

  // Check if refresh token exists in Redis
  const session = await getRedisServiceInstance().getSession(userId);
  
  if (!session || session.refreshToken !== refreshToken) {
    throw new AuthenticationError('Invalid refresh token');
  }

  // Find user
  const user = await User.findById(userId);
  
  if (!user) {
    throw new AuthenticationError('User not found');
  }

  // Generate new tokens
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(userId, phoneNumber);

  // Update session with new refresh token
  await getRedisServiceInstance().setSession(userId, {
    ...session,
    refreshToken: newRefreshToken,
    lastActivity: new Date()
  }, 604800); // 7 days

  const response: ApiResponse = {
    success: true,
    message: 'Token refreshed successfully',
    data: {
      accessToken,
      refreshToken: newRefreshToken
    }
  };

  res.status(200).json(response);
}));

// Logout user
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    try {
      // Extract user ID from token (without full verification for logout)
      const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const userId = decoded.userId;
      
      // Remove session from Redis
      await getRedisServiceInstance().deleteSession(userId);
      
      // Update user online status
      await User.findByIdAndUpdate(userId, { 
        isOnline: false,
        lastSeen: new Date()
      });
      
    } catch (error) {
      // Continue even if token is invalid
      console.error('Logout error:', error);
    }
  }

  const response: ApiResponse = {
    success: true,
    message: 'Logout successful'
  };

  res.status(200).json(response);
}));

// Send verification code
router.post('/send-verification', asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = sendVerificationSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { phoneNumber } = value;

  // Verify phone number format
  if (!validatePhoneNumber(phoneNumber)) {
    throw new ValidationError('Invalid phone number format');
  }

  // Check rate limiting (max 3 codes per hour)
  const rateLimitKey = `verification_limit:${phoneNumber}`;
  const attempts = await getRedisServiceInstance().incrementRateLimit(rateLimitKey, 3600000); // 1 hour
  
  if (attempts > 3) {
    throw new ValidationError('Too many verification code requests. Please try again later.');
  }

  // Send verification code
  await sendVerificationCode(phoneNumber);

  const response: ApiResponse = {
    success: true,
    message: 'Verification code sent successfully'
  };

  res.status(200).json(response);
}));

// Verify phone number (for registration check)
router.post('/verify-phone', asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = sendVerificationSchema.validate(req.body);
  
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { phoneNumber } = value;

  // Verify phone number format
  if (!validatePhoneNumber(phoneNumber)) {
    throw new ValidationError('Invalid phone number format');
  }

  // Check if phone number is already registered
  const existingUser = await User.findOne({ phoneNumber });
  
  const response: ApiResponse = {
    success: true,
    message: 'Phone number check completed',
    data: {
      available: !existingUser,
      phoneNumber
    }
  };

  res.status(200).json(response);
}));

export default router;
