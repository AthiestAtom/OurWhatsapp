import { JWTPayload } from '@/types';
export declare function generateTokens(userId: string, phoneNumber: string): {
    accessToken: string;
    refreshToken: string;
};
export declare function verifyToken(token: string): JWTPayload;
export declare function verifyRefreshToken(token: string): {
    userId: string;
    phoneNumber: string;
};
export declare function hashPhone(phoneNumber: string): Promise<string>;
export declare function verifyPhone(phoneNumber: string, hash: string): Promise<boolean>;
export declare function encryptMessage(content: string, publicKey: string): string;
export declare function decryptMessage(encryptedContent: string, publicKey: string): string;
export declare function generateVerificationCode(length?: number): string;
export declare function generateSessionToken(): string;
export declare function generateApiKey(): string;
export declare function validatePhoneNumber(phoneNumber: string): boolean;
export declare function formatPhoneNumber(phoneNumber: string): string;
export declare function generateRateLimitKey(identifier: string, action: string): string;
export declare function extractTokenFromHeader(authHeader: string | undefined): string | null;
export declare function extractTokenFromQuery(token: string | undefined): string | null;
export interface SessionData {
    userId: string;
    phoneNumber: string;
    loginTime: Date;
    lastActivity: Date;
    deviceInfo?: string;
    ipAddress?: string;
}
export declare function createSessionData(userId: string, phoneNumber: string, deviceInfo?: string, ipAddress?: string): SessionData;
export declare function sanitizeInput(input: string): string;
export declare function isValidEmail(email: string): boolean;
export declare function generateSecurePassword(length?: number): string;
export declare function validateApiKey(apiKey: string): boolean;
export declare function isTokenExpired(exp: number): boolean;
export declare function getTokenExpirationTime(token: string): number | null;
export declare function generateDeviceFingerprint(userAgent: string, ip: string): string;
//# sourceMappingURL=auth.d.ts.map