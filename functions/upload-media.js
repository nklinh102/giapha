// /functions/upload-media.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { jwtVerify, createRemoteJWKSet } from "jose";

// Hàm xác thực token từ Auth0 (copy y hệt file save-data.js)
async function isValidToken(request, env) {
  try {
    const JWKS = createRemoteJWKSet(new URL(`https://_YOUR_AUTH0_DOMAIN_/.well-known/jwks.json`.replace("_YOUR_AUTH0_DOMAIN_", env.AUTH0_DOMAIN)));
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
    const token = authHeader.substring(7);
    await jwtVerify(token, JWKS, {
      issuer: `https://_YOUR_AUTH0_DOMAIN_/`.replace("_YOUR_AUTH0_DOMAIN_", env.AUTH0_DOMAIN),
      algorithms: ["RS256"],
    });
    return true;
  } catch (e) {
    console.error("Lỗi xác thực token:", e.message);
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Xác thực Admin
  const isAuthed = await isValidToken(request, env);
  if (!isAuthed) {
    return new Response(JSON.stringify({ message: "Xác thực thất bại." }), { status: 401 });
  }

  // 2. Khởi tạo S3 Client cho R2
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://_YOUR_R2_ACCOUNT_ID_.r2.cloudflarestorage.com`.replace("_YOUR_R2_ACCOUNT_ID_", env.R2_ACCOUNT_ID),
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  // 3. Xử lý FormData
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const fileName = `media/avatars/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

    // 4. Tải file lên R2
    await s3.send(
      new PutObjectCommand({
        Bucket: env.MEDIA_BUCKET.binding, // Tên bucket
        Key: fileName, // Đường dẫn file
        Body: file,
        ContentType: file.type,
      })
    );

    // 5. Lấy URL public của R2 (lấy từ trang cài đặt bucket)
    const publicUrl = `${env.MEDIA_BUCKET.publicUrl}/${fileName}`;

    return new Response(JSON.stringify({ message: "Tải lên thành công!", url: publicUrl }), { status: 200 });

  } catch (error) {
    console.error("Lỗi khi tải file lên R2:", error);
    return new Response(JSON.stringify({ message: "Lỗi khi tải file: " + error.message }), { status: 500 });
  }
}