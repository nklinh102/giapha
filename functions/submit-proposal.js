// netlify/functions/submit-proposal.js
const { Octokit } = require("@octokit/rest");

const GITHUB_USER = "nklinh102";
const GITHUB_REPO = "gia-pha-files";
const GIT_BRANCH = "main";
const PROPOSALS_FILE_PATH = "data/proposals.json";

exports.handler = async (event) => {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    return { statusCode: 500, body: "Lỗi cấu hình: Thiếu GITHUB_TOKEN." };
  }
  let newProposal;
  try {
    newProposal = JSON.parse(event.body);
    if (!newProposal || !newProposal.parentId || !newProposal.name) {
      throw new Error("Dữ liệu đề xuất không hợp lệ.");
    }
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ message: e.message }) };
  }
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  let proposals = [];
  let currentSha;
  try {
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: GITHUB_USER, repo: GITHUB_REPO, path: PROPOSALS_FILE_PATH, ref: GIT_BRANCH,
      });
      currentSha = fileData.sha;
      const content = Buffer.from(fileData.content, "base64").toString("utf8");
      proposals = JSON.parse(content);
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    proposals.push(newProposal);
    const contentBase64 = Buffer.from(JSON.stringify(proposals, null, 2)).toString("base64");
    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_USER, repo: GITHUB_REPO, path: PROPOSALS_FILE_PATH, branch: GIT_BRANCH,
      message: `Thêm đề xuất mới cho ${newProposal.parentId}`,
      content: contentBase64, sha: currentSha,
    });
    return { statusCode: 200, body: JSON.stringify({ message: "Gửi đề xuất thành công!" }) };
  } catch (error) {
    console.error("Lỗi khi lưu đề xuất vào GitHub:", error);
    return { statusCode: 500, body: JSON.stringify({ message: "Lỗi khi lưu đề xuất: " + error.message }) };
  }
};