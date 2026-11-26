// SPDX-License-Identifier: Apache-2.0
//
// Sealed reports: hybrid encryption to the admin's X25519 key, with WebCrypto
// only (Node >= 22 and current browsers), so nothing extra is shipped.
//
//   ephemeral X25519 key pair (fresh per report)
//   shared = X25519(ephemeral private, admin public)
//   key    = HKDF-SHA256(shared, salt = ephemeralPub || adminPub, info = "murmur:sealed:v1")
//   box    = AES-256-GCM(key, iv = 12 random bytes, aad = "murmur:sealed:v1")
//
// The sealed string is "msv1:" + base64url(ephemeralPub || iv || box). A fresh
// ephemeral key per report means two sealed reports by the same member share
// nothing, so the ciphertexts cannot be linked to each other either.

const PREFIX = 'msv1:';
const INFO = new TextEncoder().encode('murmur:sealed:v1');
const subtle = globalThis.crypto.subtle;
// WebCrypto typings want ArrayBuffer-backed views; our byte arrays always are.
const bytes = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;

export type BoxKeyPair = {
  /** 32-byte X25519 public key: publish it on the ledger with setBoxKey. */
  readonly publicKey: Uint8Array;
  /** Private half as a JWK. Keep it on the admin's device only. */
  readonly privateJwk: JsonWebKey;
};

const b64u = (u: Uint8Array): string => {
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

export async function generateBoxKeyPair(): Promise<BoxKeyPair> {
  const kp = (await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
  const privateJwk = await subtle.exportKey('jwk', kp.privateKey);
  return { publicKey, privateJwk };
}

async function aesKey(shared: ArrayBuffer, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const ikm = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: bytes(salt), info: INFO }, ikm, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

/** Encrypt `text` so that only the holder of the admin's private key can read it. */
export async function seal(text: string, adminPublicKey: Uint8Array): Promise<string> {
  if (adminPublicKey.length !== 32 || adminPublicKey.every((b) => b === 0)) throw new Error('No admin encryption key published');
  const adminPub = await subtle.importKey('raw', bytes(adminPublicKey), { name: 'X25519' }, false, []);
  const eph = (await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair;
  const ephPub = new Uint8Array(await subtle.exportKey('raw', eph.publicKey));
  const shared = await subtle.deriveBits({ name: 'X25519', public: adminPub }, eph.privateKey, 256);
  const key = await aesKey(shared, concat(ephPub, adminPublicKey), 'encrypt');
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const box = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: INFO }, key, new TextEncoder().encode(text)));
  return PREFIX + b64u(concat(ephPub, iv, box));
}

export const isSealed = (s: string): boolean => s.startsWith(PREFIX);

/** Decrypt a sealed report with the admin's private key. Throws if the key is wrong or the text was altered. */
export async function open(sealed: string, keys: BoxKeyPair): Promise<string> {
  if (!isSealed(sealed)) throw new Error('Not a sealed report');
  const raw = unb64u(sealed.slice(PREFIX.length));
  if (raw.length < 32 + 12 + 16) throw new Error('Sealed report is truncated');
  const ephPub = raw.slice(0, 32);
  const iv = raw.slice(32, 44);
  const box = raw.slice(44);
  const priv = await subtle.importKey('jwk', keys.privateJwk, { name: 'X25519' }, false, ['deriveBits']);
  const eph = await subtle.importKey('raw', ephPub, { name: 'X25519' }, false, []);
  const shared = await subtle.deriveBits({ name: 'X25519', public: eph }, priv, 256);
  const key = await aesKey(shared, concat(ephPub, keys.publicKey), 'decrypt');
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: INFO }, key, box);
  return new TextDecoder().decode(plain);
}
