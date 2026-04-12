import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { JWTPayload } from '@/types';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '24h';
const JWT_REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'fallback-encryption-key-32-chars';

// JWT Token Management
export function generateTokens(userId: string, phoneNumber: string): { accessToken: string; refreshToken: string } {
  const payload: JWTPayload = {
    userId,
    phoneNumber,
    iat: Math.floor(Date.now() / 1000)
  };

  const signOptions: SignOptions = {
    expiresIn: JWT_EXPIRE as any,
    issuer: 'whatsapp-clone',
    audience: 'whatsapp-clone-users'
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, signOptions);

  const refreshPayload = { userId, phoneNumber };
  const refreshSignOptions: SignOptions = {
    expiresIn: JWT_REFRESH_EXPIRE as any,
    issuer: 'whatsapp-clone',
    audience: 'whatsapp-clone-users'
  };

  const refreshToken = jwt.sign(refreshPayload, JWT_REFRESH_SECRET, refreshSignOptions);

  return { accessToken, refreshToken };
}

export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'whatsapp-clone',
      audience: 'whatsapp-clone-users'
    }) as JWTPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid access token');
  }
}

export function verifyRefreshToken(token: string): { userId: string; phoneNumber: string } {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'whatsapp-clone',
      audience: 'whatsapp-clone-users'
    }) as any;
    return { userId: decoded.userId, phoneNumber: decoded.phoneNumber };
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}

// Password/Phone Hashing
export async function hashPhone(phoneNumber: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(phoneNumber + salt).digest('hex');
  return salt + ':' + hash;
}

export async function verifyPhone(phoneNumber: string, hash: string): Promise<boolean> {
  const [salt, originalHash] = hash.split(':');
  const phoneHash = crypto.createHash('sha256').update(phoneNumber + salt).digest('hex');
  return phoneHash === originalHash;
}

// Encryption/Decryption for messages
export function encryptMessage(content: string, publicKey: string): string {
  try {
    // Simple XOR encryption for demonstration
    // In production, use proper AES encryption
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32));
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt message');
  }
}

export function decryptMessage(encryptedContent: string, publicKey: string): string {
  try {
    // Simple XOR decryption for demonstration
    // In production, use proper AES decryption
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32));
    const parts = encryptedContent.split(':');
    
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted content format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt message');
  }
}

// Generate random tokens
export function generateVerificationCode(length: number = 6): string {
  const chars = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateApiKey(): string {
  return crypto.randomBytes(24).toString('hex');
}

// Phone number validation
export function validatePhoneNumber(phoneNumber: string): boolean {
  // E.164 format validation
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
}

export function formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Add + if it doesn't exist and the number seems valid
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return '+' + cleaned;
  }
  
  return phoneNumber;
}

// Rate limiting helpers
export function generateRateLimitKey(identifier: string, action: string): string {
  return `rate_limit:${action}:${identifier}`;
}

// Token extraction utilities
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}

export function extractTokenFromQuery(token: string | undefined): string | null {
  return token || null;
}

// Session management
export interface SessionData {
  userId: string;
  phoneNumber: string;
  loginTime: Date;
  lastActivity: Date;
  deviceInfo?: string;
  ipAddress?: string;
}

export function createSessionData(userId: string, phoneNumber: string, deviceInfo?: string, ipAddress?: string): SessionData {
  return {
    userId,
    phoneNumber,
    loginTime: new Date(),
    lastActivity: new Date(),
    deviceInfo,
    ipAddress
  };
}

// Security utilities
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .slice(0, 1000); // Limit length
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function generateSecurePassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// API Key validation
export function validateApiKey(apiKey: string): boolean {
  // Basic validation - should be 48 hex characters
  const apiKeyRegex = /^[a-f0-9]{48}$/i;
  return apiKeyRegex.test(apiKey);
}

// Time-based utilities
export function isTokenExpired(exp: number): boolean {
  return Date.now() >= exp * 1000;
}

export function getTokenExpirationTime(token: string): number | null {
  try {
    const decoded = jwt.decode(token) as any;
    return decoded?.exp || null;
  } catch (error) {
    return null;
  }
}

// Device fingerprinting
export function generateDeviceFingerprint(userAgent: string, ip: string): string {
  const data = `${userAgent}-${ip}-${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}
