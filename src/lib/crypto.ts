import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from './env';

// Cifrado AES-256-GCM para los tokens de Microsoft y Slack guardados en la base.
function key(): Buffer {
  const k = Buffer.from(env.tokenKey(), 'base64');
  if (k.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY debe ser de 32 bytes en base64.');
  return k;
}
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
export function decrypt(enc: string): string {
  const [iv, tag, data] = enc.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}
