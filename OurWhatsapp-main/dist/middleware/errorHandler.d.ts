import { Request, Response, NextFunction } from 'express';
export interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
    code?: number | string;
}
export declare class CustomError extends Error implements AppError {
    statusCode: number;
    isOperational: boolean;
    code?: number | string;
    constructor(message: string, statusCode?: number, isOperational?: boolean, code?: number | string);
}
export declare function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction): void;
export declare function notFoundHandler(req: Request, res: Response, next: NextFunction): void;
export declare function asyncHandler(fn: Function): (req: Request, res: Response, next: NextFunction) => void;
export declare class ValidationError extends CustomError {
    constructor(message: string, field?: string);
}
export declare class AuthenticationError extends CustomError {
    constructor(message?: string);
}
export declare class AuthorizationError extends CustomError {
    constructor(message?: string);
}
export declare class NotFoundError extends CustomError {
    constructor(resource?: string);
}
export declare class ConflictError extends CustomError {
    constructor(message?: string);
}
export declare class RateLimitError extends CustomError {
    constructor(message?: string);
}
export declare class DatabaseError extends CustomError {
    constructor(message?: string);
}
export declare class ExternalServiceError extends CustomError {
    constructor(service: string, message?: string);
}
export declare function logError(error: Error, context?: any): void;
export declare function isOperationalError(error: Error): boolean;
export declare function shouldRetry(error: Error): boolean;
//# sourceMappingURL=errorHandler.d.ts.map