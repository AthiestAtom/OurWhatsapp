import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../utils/auth';
import { User } from '../models';
import { ApiResponse } from '../types';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
      userId?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      const response: ApiResponse = {
        success: false,
        message: 'Access token required',
        error: 'UNAUTHORIZED'
      };
      res.status(401).json(response);
      return;
    }

    const decoded = verifyToken(token);
    
    // Fetch user from database
    const user = await User.findById(decoded.userId).select('-publicKey');
    
    if (!user) {
      const response: ApiResponse = {
        success: false,
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      };
      res.status(401).json(response);
      return;
    }

    // Attach user to request
    req.user = user;
    req.userId = decoded.userId;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'Invalid or expired token',
      error: 'INVALID_TOKEN'
    };
    res.status(401).json(response);
  }
}

export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (token) {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).select('-publicKey');
      
      if (user) {
        req.user = user;
        req.userId = decoded.userId;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication for optional middleware
    next();
  }
}

export function requireOwnership(resourceUserIdField: string = 'userId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          message: 'Authentication required',
          error: 'AUTH_REQUIRED'
        };
        res.status(401).json(response);
        return;
      }

      const resourceUserId = req.body[resourceUserIdField] || req.params[resourceUserIdField];
      
      if (resourceUserId !== req.userId) {
        const response: ApiResponse = {
          success: false,
          message: 'Access denied',
          error: 'ACCESS_DENIED'
        };
        res.status(403).json(response);
        return;
      }

      next();
    } catch (error) {
      console.error('Ownership middleware error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Access verification failed',
        error: 'VERIFICATION_FAILED'
      };
      res.status(500).json(response);
    }
  };
}

export function requireParticipant(conversationIdParam: string = 'conversationId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          message: 'Authentication required',
          error: 'AUTH_REQUIRED'
        };
        res.status(401).json(response);
        return;
      }

      const conversationId = req.params[conversationIdParam] || req.body[conversationIdParam];
      
      if (!conversationId) {
        const response: ApiResponse = {
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
        const response: ApiResponse = {
          success: false,
          message: 'Conversation not found',
          error: 'CONVERSATION_NOT_FOUND'
        };
        res.status(404).json(response);
        return;
      }

      if (!conversation.isParticipant(req.userId)) {
        const response: ApiResponse = {
          success: false,
          message: 'Not a participant in this conversation',
          error: 'NOT_PARTICIPANT'
        };
        res.status(403).json(response);
        return;
      }

      next();
    } catch (error) {
      console.error('Participant middleware error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Access verification failed',
        error: 'VERIFICATION_FAILED'
      };
      res.status(500).json(response);
    }
  };
}

export function requireAdmin(conversationIdParam: string = 'conversationId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          message: 'Authentication required',
          error: 'AUTH_REQUIRED'
        };
        res.status(401).json(response);
        return;
      }

      const conversationId = req.params[conversationIdParam] || req.body[conversationIdParam];
      
      if (!conversationId) {
        const response: ApiResponse = {
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
        const response: ApiResponse = {
          success: false,
          message: 'Conversation not found',
          error: 'CONVERSATION_NOT_FOUND'
        };
        res.status(404).json(response);
        return;
      }

      if (!conversation.isAdmin(req.userId) && !conversation.isCreator(req.userId)) {
        const response: ApiResponse = {
          success: false,
          message: 'Admin privileges required',
          error: 'ADMIN_REQUIRED'
        };
        res.status(403).json(response);
        return;
      }

      next();
    } catch (error) {
      console.error('Admin middleware error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Access verification failed',
        error: 'VERIFICATION_FAILED'
      };
      res.status(500).json(response);
    }
  };
}

export function validateApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    const response: ApiResponse = {
      success: false,
      message: 'API key required',
      error: 'API_KEY_REQUIRED'
    };
    res.status(401).json(response);
    return;
  }

  // In production, validate against database or environment
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  
  if (!validApiKeys.includes(apiKey)) {
    const response: ApiResponse = {
      success: false,
      message: 'Invalid API key',
      error: 'INVALID_API_KEY'
    };
    res.status(401).json(response);
    return;
  }

  next();
}

export function rateLimitMiddleware(maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const identifier = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
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
      const response: ApiResponse = {
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
