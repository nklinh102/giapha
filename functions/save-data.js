// /functions/save-data.js
import { Octokit } from "@octokit/rest";
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

  let payload;
  try {
    payload = await request.json();
    if (!payload?.filePath || payload.data === undefined) {
      throw new Error("Dữ liệu gửi lên không hợp lệ.");
    }
  } catch (e) {
    return new Response(JSON.stringify({ message: e.message }), { status: 400 });
  }

  const { filePath, data } = payload;
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const contentBase64 = btoa(JSON.stringify(data, null, 2));

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
    console.error("Save error:", error);
    return new Response(JSON.stringify({ message: "Lỗi khi lưu: " + error.message }), { status: 500 });
  }
}
