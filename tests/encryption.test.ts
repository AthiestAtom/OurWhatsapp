import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import EncryptionServiceClass from '../src/services/encryptionService';

describe('Encryption Service', () => {
  let encryptionService: EncryptionServiceClass;

  beforeAll(() => {
    encryptionService = new EncryptionServiceClass();
  });

  describe('Key Generation', () => {
    it('should generate a random key', () => {
      const key1 = encryptionService.generateKey();
      const key2 = encryptionService.generateKey();
      
      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).toHaveLength(64); // 32 bytes * 2 (hex)
      expect(key2).toHaveLength(64);
      expect(key1).not.toBe(key2); // Should be different
    });

    it('should generate a random IV', () => {
      const iv1 = encryptionService.generateIV();
      const iv2 = encryptionService.generateIV();
      
      expect(iv1).toBeDefined();
      expect(iv2).toBeDefined();
      expect(iv1).toHaveLength(32); // 16 bytes * 2 (hex)
      expect(iv2).toHaveLength(32);
      expect(iv1).not.toBe(iv2); // Should be different
    });
  });

  describe('Message Encryption', () => {
    it('should encrypt and decrypt text messages', () => {
      const originalContent = 'Hello, this is a secret message!';
      
      // Encrypt
      const encryption = encryptionService.encryptMessage(originalContent);
      
      expect(encryption.encryptedContent).toBeDefined();
      expect(encryption.encryptionKey).toBeDefined();
      expect(encryption.iv).toBeDefined();
      expect(encryption.encryptedContent).not.toBe(originalContent);
      
      // Decrypt
      const decryptedContent = encryptionService.decryptMessage(
        encryption.encryptedContent,
        encryption.encryptionKey,
        encryption.iv
      );
      
      expect(decryptedContent).toBe(originalContent);
    });

    it('should handle different content types', () => {
      const textContent = 'Text message';
      const jsonContent = { type: 'test', data: 'example' };
      
      const textEncryption = encryptionService.encryptMessage(textContent);
      const jsonEncryption = encryptionService.encryptMessage(JSON.stringify(jsonContent));
      
      expect(textEncryption.encryptedContent).not.toBe(jsonEncryption.encryptedContent);
      
      const textDecrypted = encryptionService.decryptMessage(
        textEncryption.encryptedContent,
        textEncryption.encryptionKey,
        textEncryption.iv
      );
      
      const jsonDecrypted = encryptionService.decryptMessage(
        jsonEncryption.encryptedContent,
        jsonEncryption.encryptionKey,
        jsonEncryption.iv
      );
      
      expect(textDecrypted).toBe(textContent);
      expect(jsonDecrypted).toBe(JSON.stringify(jsonContent));
    });

    it('should fail decryption with wrong key', () => {
      const originalContent = 'Secret message';
      const encryption = encryptionService.encryptMessage(originalContent);
      
      expect(() => {
        encryptionService.decryptMessage(
          encryption.encryptedContent,
          'wrong-key-here',
          encryption.iv
        );
      }).toThrow();
    });

    it('should fail decryption with wrong IV', () => {
      const originalContent = 'Secret message';
      const encryption = encryptionService.encryptMessage(originalContent);
      
      expect(() => {
        encryptionService.decryptMessage(
          encryption.encryptedContent,
          encryption.encryptionKey,
          'wrong-iv-here'
        );
      }).toThrow();
    });
  });

  describe('HMAC Generation', () => {
    it('should generate and verify HMAC', () => {
      const content = 'Test message content';
      const key = 'test-key';
      
      const hmac = encryptionService.generateHMAC(content, key);
      
      expect(hmac).toBeDefined();
      expect(typeof hmac).toBe('string');
      expect(hmac.length).toBeGreaterThan(0);
      
      // Verify HMAC
      const isValid = encryptionService.verifyHMAC(content, hmac, key);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid HMAC', () => {
      const content = 'Test message content';
      const key = 'test-key';
      const wrongHmac = 'wrong-hmac-value';
      
      const isValid = encryptionService.verifyHMAC(content, wrongHmac, key);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Key Pair Generation', () => {
    it('should generate RSA key pair', () => {
      const keyPair = encryptionService.generateKeyPair();
      
      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair).toHaveProperty('privateKey');
      expect(keyPair.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(keyPair.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
      expect(keyPair.publicKey).toContain('RSA');
      expect(keyPair.privateKey).toContain('RSA');
    });
  });
});
