import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY_PATTERN = /^[a-f0-9]{64}$/i;
const IV_LENGTH_BYTES = 12;

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY env var is required');
    }

    if (!ENCRYPTION_KEY_PATTERN.test(encryptionKey)) {
      throw new Error('ENCRYPTION_KEY must be a 64-character hex string');
    }

    this.key = Buffer.from(encryptionKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    const [ivPart, authTagPart, encryptedPart] = payload.split('.');
    if (!ivPart || !authTagPart || !encryptedPart) {
      throw new Error('Invalid encrypted payload format');
    }

    try {
      const iv = Buffer.from(ivPart, 'base64url');
      const authTag = Buffer.from(authTagPart, 'base64url');
      const encrypted = Buffer.from(encryptedPart, 'base64url');

      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Unable to decrypt encrypted payload');
    }
  }
}
