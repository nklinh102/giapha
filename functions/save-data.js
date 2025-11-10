// /functions/save-data.js
// KHÔNG CẦN IMPORT AWS-SDK HAY XMLDOM NỮA

// (Code xác thực Auth0 và các hàm helpers giữ nguyên)
// ------------- Utilities -------------
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8'
};
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type'
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...extra }
  });
}

export async function onRequestOptions() {
  // Preflight
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

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
    await verifyAuth0JWT(token, env);
    return true;
  } catch (e) {
    console.error('Auth error:', e.message);
    return false;
  }
}

// ------------- Handler (ĐÃ SỬA DÙNG R2 BINDING) -------------
export async function onRequestPost({ request, env }) {
  // 1. Auth
  if (!(await isValidToken(request, env))) {
    return json({ message: 'Xác thực thất bại.' }, 401);
  }

  // 2. Parse body
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ message: 'Body không phải JSON.' }, 400);
  }
  if (!payload?.filePath || payload.data === undefined) {
    return json({ message: 'Dữ liệu gửi lên không hợp lệ.' }, 400);
  }

  // 3. Chuẩn bị file JSON
  const filePath = String(payload.filePath);
  const dataStr = JSON.stringify(payload.data, null, 2);

  // 4. Lưu file lên R2 (Dùng binding `env.GIAPHA_BUCKET`)
  try {
    await env.GIAPHA_BUCKET.put(filePath, dataStr, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });

    return json({ message: `Đã lưu ${filePath} thành công!` }, 200);
  } catch (error) {
    console.error('R2 Save error:', error);
    return json({ message: 'Lỗi khi lưu: ' + error.message }, 500);
  }
}
