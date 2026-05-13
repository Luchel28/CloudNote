import crypto from 'crypto';

export function generateShareCode(): string {
  return crypto.randomBytes(12).toString('base64url');
}

export function normalizeShareCode(value: unknown): string {
  const code = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(code) ? code : '';
}
