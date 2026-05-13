import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined): Promise<boolean> {
  const [scheme, salt, stored] = String(passwordHash || '').split('$');
  if (scheme !== 'scrypt' || !salt || !stored) return false;
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(stored, 'base64url');
  return storedBuffer.length === derived.length && timingSafeEqual(storedBuffer, derived);
}
