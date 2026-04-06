const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SALT = 'fintech-digital-v1';
const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Derive a 256-bit key from machine fingerprint + salt using SHA-256.
 */
function deriveKey() {
  const fingerprint = [os.hostname(), os.platform(), os.arch(), os.cpus()[0]?.model || ''].join('|');
  return crypto.createHash('sha256').update(fingerprint).update(SALT).digest();
}

/**
 * Get the encrypted storage directory (lazy — avoids calling app.getPath before ready).
 */
function storageDir() {
  const { app } = require('electron');
  const dir = path.join(app.getPath('userData'), 'encrypted');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Encrypt data and save to local filesystem.
 * @param {string} name - Filename (e.g. "doc-front.enc")
 * @param {string} data - Base64-encoded file content
 * @returns {string} Saved file path
 */
function encryptAndSave(name, data) {
  const raw = Buffer.from(data, 'base64');
  const key = deriveKey();
  const nonce = crypto.randomBytes(NONCE_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
  const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: [12-byte nonce][16-byte auth tag][encrypted data]
  const output = Buffer.concat([nonce, tag, encrypted]);
  const filePath = path.join(storageDir(), name);
  fs.writeFileSync(filePath, output);
  return filePath;
}

/**
 * Load and decrypt a file from local storage.
 * @param {string} name - Filename
 * @returns {string} Base64-encoded decrypted content
 */
function loadAndDecrypt(name) {
  const filePath = path.join(storageDir(), name);
  const data = fs.readFileSync(filePath);

  if (data.length < NONCE_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Arquivo muito pequeno para conter dados criptografados');
  }

  const key = deriveKey();
  const nonce = data.subarray(0, NONCE_LENGTH);
  const tag = data.subarray(NONCE_LENGTH, NONCE_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(NONCE_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('base64');
}

/**
 * Delete an encrypted file.
 * @param {string} name - Filename
 */
function deleteEncrypted(name) {
  const filePath = path.join(storageDir(), name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = { encryptAndSave, loadAndDecrypt, deleteEncrypted };
