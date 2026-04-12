import crypto from 'crypto';
import { IMessage } from '@/types';

export interface EncryptedMessage {
  id: string;
  conversationId: string;
  sender: string;
  content: string;
  type: string;
  encryptedContent: string;
  encryptionKey: string;
  iv: string;
  timestamp: Date;
  metadata?: any;
}

export interface EncryptionResult {
  encryptedContent: string;
  encryptionKey: string;
  iv: string;
}

export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits = 32 bytes
  private readonly ivLength = 16; // 96 bits = 12 bytes for GCM
  private readonly tagLength = 16; // 128 bits =16 bytes for GCM

  /**
   * Generate a random encryption key for each message
   */
  generateKey(): string {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  /**
   * Generate a random initialization vector
   */
  generateIV(): string {
    return crypto.randomBytes(this.ivLength).toString('hex');
  }

  /**
   * Encrypt message content
   */
  encryptMessage(content: string, key?: string): EncryptionResult {
    const encryptionKey = key || this.generateKey();
    const iv = this.generateIV();

    const cipher = crypto.createCipher(this.algorithm, encryptionKey);
    cipher.setAAD(Buffer.from('additional-data', 'utf8'));
    
    let encryptedContent = cipher.update(content, 'utf8', 'hex');
    encryptedContent += cipher.final('hex');

    return {
      encryptedContent,
      encryptionKey,
      iv
    };
  }

  /**
   * Decrypt message content
   */
  decryptMessage(encryptedContent: string, key: string, iv: string): string {
    try {
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(Buffer.from('additional-data', 'utf8'));
      
      let decryptedContent = decipher.update(encryptedContent, 'hex', 'utf8');
      decryptedContent += decipher.final('utf8');

      return decryptedContent;
    } catch (error: any) {
      throw new Error(`Failed to decrypt message: ${error.message}`);
    }
  }

  /**
   * Encrypt a complete message object
   */
  encryptMessageForStorage(message: Partial<IMessage>): any {
    const { content, ...messageData } = message;
    
    const encryption = this.encryptMessage(content || '');
    
    return {
      ...messageData,
      content: '', // Clear original content for storage
      encryptedContent: encryption.encryptedContent,
      encryptionKey: encryption.encryptionKey,
      iv: encryption.iv
    };
  }

  /**
   * Decrypt message for display
   */
  decryptMessageForDisplay(encryptedMessage: any): IMessage {
    try {
      const decryptedContent = this.decryptMessage(
        encryptedMessage.encryptedContent,
        encryptedMessage.encryptionKey,
        encryptedMessage.iv
      );
      
      return {
        ...encryptedMessage,
        content: decryptedContent
      };
    } catch (error: any) {
      throw new Error(`Failed to decrypt message: ${error.message}`);
    }
  }

  /**
   * Decrypt message for storage
   */
  decryptMessageForStorage(encryptedMessage: any): IMessage {
    try {
      const decryptedContent = this.decryptMessage(
        encryptedMessage.encryptedContent,
        encryptedMessage.encryptionKey,
        encryptedMessage.iv
      );
      
      return {
        ...encryptedMessage,
        content: decryptedContent,
        encryptedContent: undefined,
        encryptionKey: undefined,
        iv: undefined
      };
    } catch (error: any) {
      throw new Error(`Failed to decrypt message: ${error.message}`);
    }
  }

  /**
   * Generate key pair for asymmetric encryption (future enhancement)
   */
  generateKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    return {
      publicKey: publicKey.toString(),
      privateKey: privateKey.toString()
    };
  }

  /**
   * Verify message integrity (HMAC)
   */
  generateHMAC(content: string, key: string): string {
    return crypto.createHmac('sha256', key).update(content).digest('hex');
  }

  /**
   * Verify HMAC
   */
  verifyHMAC(content: string, hmac: string, key: string): boolean {
    const expectedHMAC = this.generateHMAC(content, key);
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHMAC));
  }
}
