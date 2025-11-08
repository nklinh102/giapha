// /functions/submit-proposal.js
import { Octokit } from "@octokit/rest";

export async function onRequestPost(context) {
  const { request, env } = context;

  // (Tuỳ chọn) Bạn có thể thêm xác thực Admin như save-data nếu muốn:
  // if (!(await isValidToken(request, env))) return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });

  let newProposal;
  try {
    newProposal = await request.json();
    if (!newProposal?.parentId || !newProposal?.name) {
      throw new Error("Dữ liệu đề xuất không hợp lệ.");
    }
  } catch (e) {
    return new Response(JSON.stringify({ message: e.message }), { status: 400 });
  }

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const PROPOSALS_FILE_PATH = "data/proposals.json";

  try {
    let proposals = [];
    let currentSha;

    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: env.GITHUB_USER, repo: env.GITHUB_REPO, path: PROPOSALS_FILE_PATH, ref: env.GIT_BRANCH,
      });
      currentSha = fileData.sha;
      const content = atob(fileData.content);
      proposals = JSON.parse(content);
    } catch (e) {
      if (e.status !== 404) throw e;
    }

    proposals.push(newProposal);
    const contentBase64 = btoa(JSON.stringify(proposals, null, 2));

    await octokit.repos.createOrUpdateFileContents({
      owner: env.GITHUB_USER, repo: env.GITHUB_REPO, path: PROPOSALS_FILE_PATH, branch: env.GIT_BRANCH,
      message: `Thêm đề xuất mới cho ${newProposal.parentId}`,
      content: contentBase64, sha: currentSha,
    });

    return new Response(JSON.stringify({ message: "Gửi đề xuất thành công!" }), { status: 200 });
  } catch (error) {
    console.error("Proposal save error:", error);
    return new Response(JSON.stringify({ message: "Lỗi khi lưu đề xuất: " + error.message }), { status: 500 });
  }
}
