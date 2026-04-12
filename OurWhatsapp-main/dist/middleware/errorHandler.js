"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalServiceError = exports.DatabaseError = exports.RateLimitError = exports.ConflictError = exports.NotFoundError = exports.AuthorizationError = exports.AuthenticationError = exports.ValidationError = exports.CustomError = void 0;
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
exports.asyncHandler = asyncHandler;
exports.logError = logError;
exports.isOperationalError = isOperationalError;
exports.shouldRetry = shouldRetry;
class CustomError extends Error {
    constructor(message, statusCode = 500, isOperational = true, code) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.code = code;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.CustomError = CustomError;
function errorHandler(err, req, res, next) {
    let error = { ...err };
    error.message = err.message;
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors || {}).map((val) => val.message).join(', ');
        error = new CustomError(message, 400, 'VALIDATION_ERROR');
    }
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const value = err.keyValue[field];
        const message = `${field} '${value}' already exists`;
        error = new CustomError(message, 400, 'DUPLICATE_FIELD');
    }
    if (err.name === 'CastError') {
        const message = 'Resource not found';
        error = new CustomError(message, 404, 'INVALID_ID');
    }
    if (err.name === 'JsonWebTokenError') {
        error = new CustomError('Invalid token', 401, 'INVALID_TOKEN');
    }
    if (err.name === 'TokenExpiredError') {
        error = new CustomError('Token expired', 401, 'TOKEN_EXPIRED');
    }
    if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
        error = new CustomError('Database connection error', 503, 'DB_CONNECTION_ERROR');
    }
    if (err.message?.includes('Redis')) {
        error = new CustomError('Cache service unavailable', 503, 'CACHE_ERROR');
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
        error = new CustomError('File too large', 413, 'FILE_TOO_LARGE');
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
        error = new CustomError('Too many files', 413, 'TOO_MANY_FILES');
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        error = new CustomError('Unexpected file field', 400, 'UNEXPECTED_FILE');
    }
    const statusCode = error.statusCode || 500;
    const isOperational = error.isOperational || false;
    const response = {
        success: false,
        message: error.message || 'Internal Server Error',
        error: error.code || 'INTERNAL_ERROR'
    };
    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
        response.details = {
            name: err.name,
            statusCode,
            isOperational,
            url: req.url,
            method: req.method
        };
    }
    res.status(statusCode).json(response);
}
function notFoundHandler(req, res, next) {
    const response = {
        success: false,
        message: `Route ${req.originalUrl} not found`,
        error: 'NOT_FOUND'
    };
    res.status(404).json(response);
}
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
class ValidationError extends CustomError {
    constructor(message, field) {
        super(message, 400, 'VALIDATION_ERROR');
        if (field) {
            this.field = field;
        }
    }
}
exports.ValidationError = ValidationError;
class AuthenticationError extends CustomError {
    constructor(message = 'Authentication failed') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends CustomError {
    constructor(message = 'Access denied') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}
exports.AuthorizationError = AuthorizationError;
class NotFoundError extends CustomError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends CustomError {
    constructor(message = 'Resource conflict') {
        super(message, 409, 'CONFLICT_ERROR');
    }
}
exports.ConflictError = ConflictError;
class RateLimitError extends CustomError {
    constructor(message = 'Rate limit exceeded') {
        super(message, 429, 'RATE_LIMIT_ERROR');
    }
}
exports.RateLimitError = RateLimitError;
class DatabaseError extends CustomError {
    constructor(message = 'Database operation failed') {
        super(message, 500, 'DATABASE_ERROR');
    }
}
exports.DatabaseError = DatabaseError;
class ExternalServiceError extends CustomError {
    constructor(service, message = 'External service error') {
        super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    }
}
exports.ExternalServiceError = ExternalServiceError;
function logError(error, context) {
    const logData = {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: error.message,
        stack: error.stack,
        context: context || {},
        name: error.name
    };
    if (process.env.NODE_ENV === 'production') {
        console.error(JSON.stringify(logData));
    }
    else {
        console.error('Development Error Log:', logData);
    }
}
function isOperationalError(error) {
    if (error instanceof CustomError) {
        return error.isOperational;
    }
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
function shouldRetry(error) {
    if (isOperationalError(error)) {
        return false;
    }
    const retryableErrors = [
        'MongoNetworkError',
        'MongoTimeoutError',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND'
    ];
    return retryableErrors.some(retryableError => error.name.includes(retryableError) ||
        error.message.includes(retryableError));
}
//# sourceMappingURL=errorHandler.js.map