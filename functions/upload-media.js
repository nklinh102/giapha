// /functions/upload-media.js
import { DOMParser } from '@xmldom/xmldom';
global.DOMParser = DOMParser;
// ======================================
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { jwtVerify, createRemoteJWKSet } from "jose";

async function isValidToken(request, env) {
  try {
    const JWKS = createRemoteJWKSet(new URL(`https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`));
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return false;
    const token = authHeader.slice(7);
    await jwtVerify(token, JWKS, { issuer: `https://${env.AUTH0_DOMAIN}/`, algorithms: ["RS256"] });
    return true;
  } catch (e) {
    console.error("Auth error:", e.message);
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await isValidToken(request, env))) {
    return new Response(JSON.stringify({ message: "Xác thực thất bại." }), { status: 401 });
  }

  // ENV cần có:
  // R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL
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
