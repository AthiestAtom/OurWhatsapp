"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTokens = generateTokens;
exports.verifyToken = verifyToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.hashPhone = hashPhone;
exports.verifyPhone = verifyPhone;
exports.encryptMessage = encryptMessage;
exports.decryptMessage = decryptMessage;
exports.generateVerificationCode = generateVerificationCode;
exports.generateSessionToken = generateSessionToken;
exports.generateApiKey = generateApiKey;
exports.validatePhoneNumber = validatePhoneNumber;
exports.formatPhoneNumber = formatPhoneNumber;
exports.generateRateLimitKey = generateRateLimitKey;
exports.extractTokenFromHeader = extractTokenFromHeader;
exports.extractTokenFromQuery = extractTokenFromQuery;
exports.createSessionData = createSessionData;
exports.sanitizeInput = sanitizeInput;
exports.isValidEmail = isValidEmail;
exports.generateSecurePassword = generateSecurePassword;
exports.validateApiKey = validateApiKey;
exports.isTokenExpired = isTokenExpired;
exports.getTokenExpirationTime = getTokenExpirationTime;
exports.generateDeviceFingerprint = generateDeviceFingerprint;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '24h';
const JWT_REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'fallback-encryption-key-32-chars';
function generateTokens(userId, phoneNumber) {
    const payload = {
        userId,
        phoneNumber,
        iat: Math.floor(Date.now() / 1000)
    };
    const signOptions = {
        expiresIn: JWT_EXPIRE,
        issuer: 'whatsapp-clone',
        audience: 'whatsapp-clone-users'
    };
    const accessToken = jsonwebtoken_1.default.sign(payload, JWT_SECRET, signOptions);
    const refreshPayload = { userId, phoneNumber };
    const refreshSignOptions = {
        expiresIn: JWT_REFRESH_EXPIRE,
        issuer: 'whatsapp-clone',
        audience: 'whatsapp-clone-users'
    };
    const refreshToken = jsonwebtoken_1.default.sign(refreshPayload, JWT_REFRESH_SECRET, refreshSignOptions);
    return { accessToken, refreshToken };
}
function verifyToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET, {
            issuer: 'whatsapp-clone',
            audience: 'whatsapp-clone-users'
        });
        return decoded;
    }
    catch (error) {
        throw new Error('Invalid access token');
    }
}
function verifyRefreshToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_REFRESH_SECRET, {
            issuer: 'whatsapp-clone',
            audience: 'whatsapp-clone-users'
        });
        return { userId: decoded.userId, phoneNumber: decoded.phoneNumber };
    }
    catch (error) {
        throw new Error('Invalid refresh token');
    }
}
async function hashPhone(phoneNumber) {
    const salt = crypto_1.default.randomBytes(16).toString('hex');
    const hash = crypto_1.default.createHash('sha256').update(phoneNumber + salt).digest('hex');
    return salt + ':' + hash;
}
async function verifyPhone(phoneNumber, hash) {
    const [salt, originalHash] = hash.split(':');
    const phoneHash = crypto_1.default.createHash('sha256').update(phoneNumber + salt).digest('hex');
    return phoneHash === originalHash;
}
function encryptMessage(content, publicKey) {
    try {
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32));
        const iv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(content, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }
    catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt message');
    }
}
function decryptMessage(encryptedContent, publicKey) {
    try {
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32));
        const parts = encryptedContent.split(':');
        if (parts.length !== 2) {
            throw new Error('Invalid encrypted content format');
        }
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt message');
    }
}
function generateVerificationCode(length = 6) {
    const chars = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
function generateSessionToken() {
    return crypto_1.default.randomBytes(32).toString('hex');
}
function generateApiKey() {
    return crypto_1.default.randomBytes(24).toString('hex');
}
function validatePhoneNumber(phoneNumber) {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
}
function formatPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length >= 10 && cleaned.length <= 15) {
        return '+' + cleaned;
    }
    return phoneNumber;
}
function generateRateLimitKey(identifier, action) {
    return `rate_limit:${action}:${identifier}`;
}
function extractTokenFromHeader(authHeader) {
    if (!authHeader)
        return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }
    return parts[1];
}
function extractTokenFromQuery(token) {
    return token || null;
}
function createSessionData(userId, phoneNumber, deviceInfo, ipAddress) {
    return {
        userId,
        phoneNumber,
        loginTime: new Date(),
        lastActivity: new Date(),
        deviceInfo,
        ipAddress
    };
}
function sanitizeInput(input) {
    return input
        .trim()
        .replace(/[<>]/g, '')
        .slice(0, 1000);
}
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
function generateSecurePassword(length = 12) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
}
function validateApiKey(apiKey) {
    const apiKeyRegex = /^[a-f0-9]{48}$/i;
    return apiKeyRegex.test(apiKey);
}
function isTokenExpired(exp) {
    return Date.now() >= exp * 1000;
}
function getTokenExpirationTime(token) {
    try {
        const decoded = jsonwebtoken_1.default.decode(token);
        return decoded?.exp || null;
    }
    catch (error) {
        return null;
    }
}
function generateDeviceFingerprint(userAgent, ip) {
    const data = `${userAgent}-${ip}-${Date.now()}`;
    return crypto_1.default.createHash('sha256').update(data).digest('hex');
}
//# sourceMappingURL=auth.js.map