// /functions/save-data.js
import { Octokit } from "@octokit/rest";
import { jwtVerify, createRemoteJWKSet } from "jose";

// Hàm xác thực token từ Auth0
async function isValidToken(request, env) {
  try {
    // DÒNG NÀY ĐÚNG: Nó sẽ tự động đọc biến AUTH0_DOMAIN của bạn
    const JWKS = createRemoteJWKSet(new URL(`https://\${env.AUTH0_DOMAIN}/.well-known/jwks.json`));
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return false;
    }
    const token = authHeader.substring(7);
    
    // Xác thực token
    await jwtVerify(token, JWKS, {
      // audience: env.AUTH0_AUDIENCE, // Tùy chọn nếu bạn set
      // DÒNG NÀY ĐÚNG: Nó sẽ tự động đọc biến AUTH0_DOMAIN của bạn
      issuer: `https://\${env.AUTH0_DOMAIN}/`,
      algorithms: ["RS256"],
    });
    
    return true; // Token hợp lệ
  } catch (e) {
    console.error("Lỗi xác thực token:", e.message);
    return false;
  }
}

// Handler chính của Worker
export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Xác thực Admin
  const isAuthed = await isValidToken(request, env);
  if (!isAuthed) {
    return new Response(JSON.stringify({ message: "Xác thực thất bại." }), { status: 401 });
  }

  // 2. Lấy dữ liệu (Giống code cũ)
  let payload;
  try {
    payload = await request.json();
    if (!payload.filePath || payload.data === undefined) {
      throw new Error("Dữ liệu gửi lên không hợp lệ.");
    }
  } catch (e) {
    return new Response(JSON.stringify({ message: e.message }), { status: 400 });
  }

  // 3. Logic lưu vào GitHub (Dùng các biến môi trường)
  const { filePath, data } = payload;
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const contentBase64 = btoa(JSON.stringify(data, null, 2)); // Dùng btoa thay vì Buffer

  try {
    let currentSha;
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: env.GITHUB_USER, repo: env.GITHUB_REPO, path: filePath, ref: env.GIT_BRANCH,
      });
      currentSha = fileData.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    await octokit.repos.createOrUpdateFileContents({
      owner: env.GITHUB_USER, repo: env.GITHUB_REPO, path: filePath, branch: env.GIT_BRANCH,
      message: `Cập nhật file ${filePath} lúc ${new Date().toISOString()}`,
      content: contentBase64, sha: currentSha,
    });
    return new Response(JSON.stringify({ message: `Đã lưu ${filePath} thành công!` }), { status: 200 });
  } catch (error) {
    console.error("Lỗi khi lưu vào GitHub:", error);
    return new Response(JSON.stringify({ message: "Lỗi khi lưu: " + error.message }), { status: 500 });
  }
}