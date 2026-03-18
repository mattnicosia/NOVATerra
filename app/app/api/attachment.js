import { supabaseAdmin, verifyUser } from './lib/supabaseAdmin.js';
import { cors } from './lib/cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: "path required" });

  // Security: ensure the file path belongs to the authenticated user
  if (!filePath.startsWith(`${user.id}/`)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const { data, error } = await supabaseAdmin.storage
      .from("rfp-attachments")
      .download(filePath);

    if (error || !data) {
      return res.status(404).json({ error: "File not found" });
    }

    // Determine content type from file extension
    const ext = filePath.split(".").pop().toLowerCase();
    const contentTypes = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv",
      dwg: "application/acad",
    };
    const contentType = contentTypes[ext] || "application/octet-stream";
    const filename = filePath.split("/").pop();

    const buffer = Buffer.from(await data.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("Attachment download error:", err.message);
    return res.status(500).json({ error: "Failed to download file" });
  }
}
