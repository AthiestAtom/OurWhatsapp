import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/types';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: number | string;
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;
  public code?: number | string;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true, code?: number | string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction): void {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values((err as any).errors || {}).map((val: any) => val.message).join(', ');
    error = new CustomError(message, 400, 'VALIDATION_ERROR' as any);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys((err as any).keyValue)[0];
    const value = (err as any).keyValue[field];
    const message = `${field} '${value}' already exists`;
    error = new CustomError(message, 400, 'DUPLICATE_FIELD' as any);
  }

  // Mongoose cast error
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new CustomError(message, 404, 'INVALID_ID' as any);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new CustomError('Invalid token', 401, 'INVALID_TOKEN' as any);
  }

  if (err.name === 'TokenExpiredError') {
    error = new CustomError('Token expired', 401, 'TOKEN_EXPIRED' as any);
  }

  // MongoDB connection errors
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    error = new CustomError('Database connection error', 503, 'DB_CONNECTION_ERROR' as any);
  }

  // Redis connection errors
  if (err.message?.includes('Redis')) {
    error = new CustomError('Cache service unavailable', 503, 'CACHE_ERROR' as any);
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    error = new CustomError('File too large', 413, 'FILE_TOO_LARGE' as any);
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    error = new CustomError('Too many files', 413, 'TOO_MANY_FILES' as any);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error = new CustomError('Unexpected file field', 400, 'UNEXPECTED_FILE' as any);
  }

  // Default error
  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational || false;

  const response: ApiResponse = {
    success: false,
    message: error.message || 'Internal Server Error',
    error: (error.code as string) || 'INTERNAL_ERROR'
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    (response as any).stack = err.stack;
    (response as any).details = {
      name: err.name,
      statusCode,
      isOperational,
      url: req.url,
      method: req.method
    };
  }

  res.status(statusCode).json(response);
}

export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const response: ApiResponse = {
    success: false,
    message: `Route ${req.originalUrl} not found`,
    error: 'NOT_FOUND'
  };
  res.status(404).json(response);
}

export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Specific error types
export class ValidationError extends CustomError {
  constructor(message: string, field?: string) {
    super(message, 400, 'VALIDATION_ERROR' as any);
    if (field) {
      (this as any).field = field;
    }
  }
}

export class AuthenticationError extends CustomError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR' as any);
  }
}

export class AuthorizationError extends CustomError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR' as any);
  }
}

export class NotFoundError extends CustomError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND' as any);
  }
}

export class ConflictError extends CustomError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR' as any);
  }
}

export class RateLimitError extends CustomError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR' as any);
  }
}

export class DatabaseError extends CustomError {
  constructor(message: string = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR' as any);
  }
}

export class ExternalServiceError extends CustomError {
  constructor(service: string, message: string = 'External service error') {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR' as any);
  }
}

// Error logging utility
export function logError(error: Error, context?: any): void {
  const logData = {
    timestamp: new Date().toISOString(),
    level: 'error',
    message: error.message,
    stack: error.stack,
    context: context || {},
    name: error.name
  };

  // In production, send to logging service
  if (process.env.NODE_ENV === 'production') {
    // Example: Send to Winston, Datadog, etc.
    console.error(JSON.stringify(logData));
  } else {
    console.error('Development Error Log:', logData);
  }
}

// Error recovery utilities
export function isOperationalError(error: Error): boolean {
  if (error instanceof CustomError) {
    return error.isOperational;
  }
  
  // List of operational error types
  const operationalErrors = [
    'ValidationError',
    'AuthenticationError',
    'AuthorizationError',
    'NotFoundError',
    'ConflictError',
    'RateLimitError'
  ];
  
  return operationalErrors.includes(error.name);
}

export function shouldRetry(error: Error): boolean {
  // Don't retry operational errors
  if (isOperationalError(error)) {
    return false;
  }
  
  // Retry on network and timeout errors
  const retryableErrors = [
    'MongoNetworkError',
    'MongoTimeoutError',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND'
  ];
  
  return retryableErrors.some(retryableError => 
    error.name.includes(retryableError) || 
    error.message.includes(retryableError)
  );
}
