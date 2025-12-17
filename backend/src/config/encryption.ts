import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Derives a key from a password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypts sensitive configuration data
 * @param data - The data to encrypt (as JSON string or object)
 * @param masterKey - The master encryption key/password
 * @returns Encrypted string in format: salt:iv:authTag:encryptedData
 */
export function encryptConfig(data: string | object, masterKey: string): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  
  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Derive key from master password
  const key = deriveKey(masterKey, salt);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt the data
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // Combine salt:iv:authTag:encrypted
  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted
  ].join(':');
}

/**
 * Decrypts configuration data
 * @param encryptedData - The encrypted string from encryptConfig
 * @param masterKey - The master encryption key/password
 * @returns Decrypted string
 */
export function decryptConfig(encryptedData: string, masterKey: string): string {
  // Split the encrypted data
  const parts = encryptedData.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }
  
  const salt = Buffer.from(parts[0], 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const encrypted = parts[3];
  
  // Derive key from master password
  const key = deriveKey(masterKey, salt);
  
  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt the data
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Decrypts and parses configuration as JSON
 */
export function decryptConfigJson<T = any>(encryptedData: string, masterKey: string): T {
  const decrypted = decryptConfig(encryptedData, masterKey);
  return JSON.parse(decrypted);
}
