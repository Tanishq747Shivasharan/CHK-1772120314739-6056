const crypto = require('crypto');

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_LOCATION_AGE_MS = 2 * 60 * 1000;

function getOtpSecret() {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret || secret.length < 32) {
    const error = new Error('OTP_HASH_SECRET must contain at least 32 characters');
    error.code = 'OTP_CONFIGURATION_MISSING';
    throw error;
  }
  return secret;
}

function getOtpEncryptionKey() {
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(getOtpSecret(), 'utf8'),
    Buffer.from('extra-to-essential-otp-v1', 'utf8'),
    Buffer.from('delivery-collection-code', 'utf8'),
    32
  ));
}

function encryptCollectionOtp(code) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getOtpEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return {
    otpCiphertext: ciphertext.toString('hex'),
    otpIv: iv.toString('hex'),
    otpTag: cipher.getAuthTag().toString('hex')
  };
}

function decryptCollectionOtp(secret) {
  if (!secret?.otp_ciphertext || !secret?.otp_iv || !secret?.otp_tag) return null;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getOtpEncryptionKey(),
    Buffer.from(secret.otp_iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(secret.otp_tag, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.otp_ciphertext, 'hex')),
    decipher.final()
  ]).toString('utf8');
  return /^\d{6}$/.test(plaintext) ? plaintext : null;
}

function createCollectionOtp() {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(`${code}:${getOtpSecret()}`, salt, 64);
  return {
    code,
    hash: `${salt.toString('hex')}:${hash.toString('hex')}`,
    ...encryptCollectionOtp(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString()
  };
}

function hashOtpCandidate(code, storedHash) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  if (typeof storedHash !== 'string') return null;

  const [saltHex, expectedHex] = storedHash.split(':');
  if (!saltHex || !expectedHex || !/^[\da-f]+$/i.test(saltHex) || !/^[\da-f]+$/i.test(expectedHex)) return null;

  const actual = crypto.scryptSync(`${code}:${getOtpSecret()}`, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  return storedHash;
}

function validateCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { latitude: lat, longitude: lon };
}

function isFreshLocation(updatedAt) {
  const timestamp = new Date(updatedAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= MAX_LOCATION_AGE_MS;
}

module.exports = {
  createCollectionOtp,
  hashOtpCandidate,
  decryptCollectionOtp,
  validateCoordinates,
  isFreshLocation,
  OTP_TTL_MS,
  MAX_LOCATION_AGE_MS
};
