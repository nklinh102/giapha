// /functions/submit-proposal.js
// KHÔNG CẦN IMPORT AWS-SDK HAY XMLDOM NỮA

const PROPOSALS_FILE_PATH = "data/proposals.json";

// Hàm này sẽ chạy trên Cloudflare
export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Lấy dữ liệu đề xuất từ body
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

  let proposals = [];

  try {
    // 3. ĐỌC file proposals.json hiện tại từ R2 (Dùng binding `env.GIAPHA_BUCKET`)
    const currentProposalsObj = await env.GIAPHA_BUCKET.get(PROPOSALS_FILE_PATH);

    if (currentProposalsObj !== null) {
      // File tồn tại, đọc nội dung
      const contentStr = await currentProposalsObj.text();
      proposals = JSON.parse(contentStr);
    } else {
      // File không tồn tại
      console.log("proposals.json không tìm thấy, sẽ tạo file mới.");
    }

    // 4. Thêm đề xuất mới
    proposals.push(newProposal);
    const dataStr = JSON.stringify(proposals, null, 2);

    // 5. GHI ĐÈ file proposals.json lên R2 (Dùng binding `env.GIAPHA_BUCKET`)
    await env.GIAPHA_BUCKET.put(PROPOSALS_FILE_PATH, dataStr, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });

    // 6. Trả về thành công
    return new Response(JSON.stringify({ message: "Gửi đề xuất thành công!" }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error("Lỗi khi lưu đề xuất lên R2:", error);
    return new Response(JSON.stringify({ message: "Lỗi khi lưu đề xuất: " + error.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
