// /functions/submit-proposal.js

// === SỬA LỖI: Thêm 'Node' vào 'self' ===
import { DOMParser, Node } from '@xmldom/xmldom'; // Import thêm Node
self.DOMParser = DOMParser;
self.Node = Node; // Thêm dòng này
// ======================================

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const PROPOSALS_FILE_PATH = "data/proposals.json";

// Helper đọc stream từ R2 body
async function streamToString(stream) {
  const reader = stream.getReader();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += new TextDecoder().decode(value);
  }
  return result;
}

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

  // 2. Khởi tạo S3/R2 Client
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  let proposals = [];

  try {
    // 3. ĐỌC file proposals.json hiện tại từ R2
    try {
      const getCmd = new GetObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: PROPOSALS_FILE_PATH,
      });
      const response = await s3.send(getCmd);
      const contentStr = await streamToString(response.Body);
      proposals = JSON.parse(contentStr);

    } catch (e) {
      if (e.name === 'NoSuchKey') {
        // File không tồn tại, sẽ tạo mới
        console.log("proposals.json không tìm thấy, sẽ tạo file mới.");
      } else {
        throw e; // Lỗi khác
      }
    }

    // 4. Thêm đề xuất mới
    proposals.push(newProposal);
    const dataStr = JSON.stringify(proposals, null, 2);

    // 5. GHI ĐÈ file proposals.json lên R2
    await s3.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: PROPOSALS_FILE_PATH,
      Body: dataStr,
      ContentType: "application/json; charset=utf-8",
      ACL: "public-read"
    }));

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
