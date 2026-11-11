/** 账号体系：PBKDF2 口令散列 + HMAC 签名令牌（无状态，Workers 原生 WebCrypto） */

export interface TokenPayload {
  uid: string;
  name: string;
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ?? b64url(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64urlDecode(salt), iterations: 100_000, hash: 'SHA-256' },
    key,
    256,
  );
  return { hash: b64url(bits), salt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const { hash: computed } = await hashPassword(password, salt);
  // 常量时间比较
  if (computed.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signToken(payload: TokenPayload, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as TokenPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function uid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}
