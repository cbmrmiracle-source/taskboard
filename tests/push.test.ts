import { describe, expect, it } from 'vitest';
import { b64urlToBytes, bytesToB64url, concat, encryptPayload, generateVapidKeys, hkdf, vapidHeader } from '../worker/push';

const enc = new TextEncoder();

// Decrypts as a browser would (RFC 8291), to check the sending side.
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, uaPublic: Uint8Array<ArrayBuffer>, authSecret: Uint8Array<ArrayBuffer>) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
  expect(plain[plain.length - 1]).toBe(2);
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe('web push', () => {
  it('encrypts a payload the subscriber can decrypt', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const uaPublic = new Uint8Array((await crypto.subtle.exportKey('raw', ua.publicKey)) as ArrayBuffer);
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const msg = JSON.stringify({ title: 'Pay invoice', body: 'Due today' });
    const body = await encryptPayload(enc.encode(msg), bytesToB64url(uaPublic), bytesToB64url(authSecret));
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    expect(await decrypt(body, ua, uaPublic, authSecret)).toBe(msg);
  });

  it('signs a VAPID token that verifies with the public key', async () => {
    const keys = await generateVapidKeys();
    const header = await vapidHeader('https://web.push.apple.com/abc', keys, 'mailto:a@b.co');
    const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(m[2])));
    expect(claims.aud).toBe('https://web.push.apple.com');
    const pub = await crypto.subtle.importKey('raw', b64urlToBytes(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlToBytes(m[3]), enc.encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });
});
