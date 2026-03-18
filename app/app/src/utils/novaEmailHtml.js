// Shared NOVA-branded HTML email builder
// Extracted from send-bid-invite.js — reusable across all auto-response emails

export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build a NOVA-branded HTML email.
 * @param {Object} opts
 * @param {string} opts.heading  — Email heading (e.g. "Proposal Received")
 * @param {string} opts.body     — Plain text body (auto-wrapped in paragraphs)
 * @param {string} [opts.ctaUrl] — Optional CTA button URL
 * @param {string} [opts.ctaLabel] — CTA button text (default: "View Details")
 * @param {string} [opts.footerNote] — Optional footer note
 * @returns {string} Full HTML email string
 */
export function buildNovaEmailHtml({ heading, body, ctaUrl, ctaLabel, footerNote }) {
  // Convert plain text body into HTML paragraphs
  const bodyHtml = escapeHtml(body)
    .split(/\n\n+/)
    .map(
      p => `<p style="color:#CCCCCC;font-size:15px;margin:0 0 12px;line-height:1.6;">${p.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const ctaBlock = ctaUrl
    ? `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:linear-gradient(135deg,#7C5CFC,#BF5AF2);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;text-align:center;width:100%;box-sizing:border-box;margin-top:20px;">${escapeHtml(ctaLabel || "View Details")}</a>`
    : "";

  const footerBlock = footerNote
    ? `<p style="color:#666;font-size:12px;margin:16px 0 0;text-align:center;">${escapeHtml(footerNote)}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D0F14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <div style="background:linear-gradient(135deg,rgba(124,92,252,0.15),rgba(191,90,242,0.08));border:1px solid rgba(124,92,252,0.25);border-radius:16px;padding:32px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
        <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#7C5CFC,#BF5AF2);display:flex;align-items:center;justify-content:center;">
          <span style="color:white;font-weight:bold;font-size:16px;">A</span>
        </div>
        <div>
          <div style="color:#FFFFFF;font-weight:600;font-size:16px;">NOVA</div>
          <div style="color:#8E8E93;font-size:12px;">Construction Intelligence</div>
        </div>
      </div>

      <h1 style="color:#FFFFFF;font-size:22px;font-weight:600;margin:0 0 16px;">${escapeHtml(heading)}</h1>

      <div style="margin-bottom:20px;">
        ${bodyHtml}
      </div>

      ${ctaBlock}
      ${footerBlock}
    </div>
  </div>
</body>
</html>`;
}
