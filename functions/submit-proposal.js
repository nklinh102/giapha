// /functions/submit-proposal.js
import { Octokit } from "@octokit/rest";

// ------------- Helpers (Sửa lỗi Unicode UTF-8) -------------

/**
 * Mã hóa một chuỗi JavaScript (UTF-8) sang Base64
 * để an toàn khi dùng với btoa() và API của GitHub.
 */
function toBase64Utf8(str) {
  try {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) {
      bin += String.fromCharCode(b);
    }
    return btoa(bin);
  } catch (e) {
    console.error("Lỗi toBase64Utf8:", e);
    return null; 
  }
}

/**
 * Giải mã một chuỗi Base64 (từ GitHub) sang chuỗi UTF-8.
 */
function fromBase64Utf8(b64) {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error("Lỗi fromBase64Utf8:", e);
    return null;
  }
}
// --------------------------------------------------


// Hàm này sẽ chạy trên Cloudflare
export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Lấy GITHUB_TOKEN từ biến môi trường
  const GITHUB_TOKEN = env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    return new Response(JSON.stringify({ message: "Lỗi cấu hình: Thiếu GITHUB_TOKEN." }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  // 2. Lấy dữ liệu đề xuất từ body
  let newProposal;
  try {
    newProposal = await request.json();
    if (!newProposal || !newProposal.parentId || !newProposal.name) {
      throw new Error("Dữ liệu đề xuất không hợp lệ.");
    }
  } catch (e) {
    return new Response(JSON.stringify({ message: e.message }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  // 3. Lấy các biến GitHub từ môi trường
  const GITHUB_USER = env.GITHUB_USER;
  const GITHUB_REPO = env.GITHUB_REPO;
  const GIT_BRANCH = env.GIT_BRANCH;
  const PROPOSALS_FILE_PATH = "data/proposals.json";

  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  let proposals = [];
  let currentSha;

  try {
    // 4. Lấy file proposals.json hiện tại
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: GITHUB_USER, repo: GITHUB_REPO, path: PROPOSALS_FILE_PATH, ref: GIT_BRANCH,
      });
      currentSha = fileData.sha;
      
      // SỬA LỖI ĐỌC: Dùng fromBase64Utf8 để đảm bảo đọc đúng Tiếng Việt
      const content = fromBase64Utf8(fileData.content); 
      if (content) {
        proposals = JSON.parse(content);
      } else {
        throw new Error("Không thể đọc nội dung file proposals.json");
      }
      
    } catch (e) {
      if (e.status !== 404) throw e;
      // File không tồn tại, sẽ tạo mới
      console.log("proposals.json không tìm thấy, sẽ tạo file mới.");
    }

    // 5. Thêm đề xuất mới và ghi đè
    proposals.push(newProposal);
    
    // SỬA LỖI GHI: Dùng toBase64Utf8 để mã hóa đúng Tiếng Việt
    const dataStr = JSON.stringify(proposals, null, 2);
    const contentBase64 = toBase64Utf8(dataStr);

    if (!contentBase64) {
      throw new Error("Không thể mã hóa nội dung đề xuất.");
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_USER, repo: GITHUB_REPO, path: PROPOSALS_FILE_PATH, branch: GIT_BRANCH,
      message: `Thêm đề xuất mới cho ${newProposal.parentId}`,
      content: contentBase64, sha: currentSha,
    });

    // 6. Trả về thành công VỚI HEADER ĐÚNG
    return new Response(JSON.stringify({ message: "Gửi đề xuất thành công!" }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error("Lỗi khi lưu đề xuất vào GitHub:", error);
    return new Response(JSON.stringify({ message: "Lỗi khi lưu đề xuất: " + error.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
