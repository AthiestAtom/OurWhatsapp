import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            user?: any;
            userId?: string;
        }
    }
}
export declare function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function requireOwnership(resourceUserIdField?: string): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare function requireParticipant(conversationIdParam?: string): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare function requireAdmin(conversationIdParam?: string): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare function validateApiKey(req: Request, res: Response, next: NextFunction): void;
export declare function rateLimitMiddleware(maxRequests?: number, windowMs?: number): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map