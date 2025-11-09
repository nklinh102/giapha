// /functions/upload-media.js

// === SỬA LỖI: Polyfill cho các hằng số của Node ===
import { DOMParser, Node } from 'xmldom'; // Import thêm Node
self.DOMParser = DOMParser;
self.Node = Node;

// Thư viện AWS SDK cần các hằng số này, nhưng 'xmldom' không cung cấp
// Chúng ta phải tự định nghĩa chúng
if (!self.Node.TEXT_NODE) {
  self.Node.TEXT_NODE = 3;
}
if (!self.Node.ELEMENT_NODE) {
  self.Node.ELEMENT_NODE = 1;
}
if (!self.Node.COMMENT_NODE) {
  self.Node.COMMENT_NODE = 8;
}
// ===========================================

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ... (phần còn lại của file y hệt như trước, bao gồm cả code xác thực Auth0) ...

// ------------- Base64 helpers (cho JWT) -------------
function base64UrlToUint8Array(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ------------- JWT verification (Auth0) -------------
let _jwksCache = null;
let _jwksCacheAt = 0;

async function fetchJWKS(issuer) {
  const now = Date.now();
  if (_jwksCache && now - _jwksCacheAt < 5 * 60 * 1000) return _jwksCache;
  const url = `${issuer}.well-known/jwks.json`;
  const res = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  _jwksCache = await res.json();
  _jwksCacheAt = now;
  return _jwksCache;
}

async function verifyAuth0JWT(token, env) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('Malformed JWT');
  const header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(h)));
  const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(p)));
  
  if (header.alg !== 'RS256') throw new Error('Unsupported alg');

  const ISSUER = `https://${env.AUTH0_DOMAIN}/`;
  if (payload.iss !== ISSUER) throw new Error('Bad issuer');
  
  // Kiểm tra Audience (Quan trọng)
  const aud = payload.aud;
  const wantAud = env.AUTH0_AUDIENCE;
  const okAud = Array.isArray(aud) ? aud.includes(wantAud) : aud === wantAud;
  if (!okAud) throw new Error('Bad audience');

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && nowSec > payload.exp + 60) {
    throw new Error('Token expired');
  }
  if (typeof payload.nbf === 'number' && nowSec + 60 < payload.nbf) {
    throw new Error('Token not yet valid');
  }
  const { keys } = await fetchJWKS(ISSUER);
  const jwk = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && k.use !== 'enc');
  if (!jwk) throw new Error('No matching JWK');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const data = new TextEncoder().encode(`${h}.${p}`);
  const sig = base64UrlToUint8Array(s);
  const valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig, data);
  if (!valid) throw new Error('Bad signature');
  return payload;
}

async function isValidToken(request, env) {
  try {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return false;
    const token = auth.slice(7);
    await verifyAuth0JWT(token, env); // Dùng hàm xác thực đầy đủ
    return true;
  } catch (e) {
    console.error('Auth error:', e.message);
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await isValidToken(request, env))) {
    return new Response(JSON.stringify({ message: "Xác thực thất bại." }), { status: 401 });
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !file.name) {
      return new Response(JSON.stringify({ message: "Thiếu file tải lên." }), { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const key = `media/avatars/${Date.now()}-${safeName}`;

    await s3.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: file,
      ContentType: file.type || "application/octet-stream",
      ACL: "public-read" // Nếu bucket là Public
    }));

    const url = `${env.R2_PUBLIC_BASE_URL}/${key}`;
    return new Response(JSON.stringify({ message: "Tải lên thành công!", url }), { status: 200 });
  } catch (error) {
    console.error("R2 upload error:", error);
    return new Response(JSON.stringify({ message: "Lỗi khi tải file: " + error.message }), { status: 500 });
  }
}
