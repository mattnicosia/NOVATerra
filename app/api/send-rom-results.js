// Vercel Serverless Function — Send ROM estimate results via email + store lead
// No auth required — this is the lead-gen capture endpoint

import crypto from "crypto";
import { Resend } from "resend";
import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";
import { checkRateLimit } from "./lib/rateLimiter.js";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function buildProjectFingerprint({ buildingType, projectSF, source }) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      buildingType: String(buildingType || "").trim().toLowerCase(),
      projectSF: String(projectSF || "").trim(),
      source: String(source || "").trim().toLowerCase(),
    }))
    .digest("hex")
    .slice(0, 16);
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, buildingType, projectSF, totalLow, totalMid, totalHigh, perSFLow, perSFMid, perSFHigh, tradeCount, itemCount, source } = req.body || {};
  const normalizedEmail = String(email || "").toLowerCase().trim();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return res.status(400).json({ error: "Valid email required" });
  }

  const clientIp = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
  const projectFingerprint = buildProjectFingerprint({ buildingType, projectSF, source });
  const [ipRate, recipientRate, projectRate] = await Promise.all([
    checkRateLimit(`rom_ip_${clientIp}`),
    checkRateLimit(`rom_recipient_${normalizedEmail}`),
    checkRateLimit(`rom_project_${normalizedEmail}_${projectFingerprint}`),
  ]);
  if (!ipRate.allowed || !recipientRate.allowed || !projectRate.allowed) {
    return res.status(429).json({
      error: "Rate limited",
      retryAfter: Math.max(ipRate.retryAfter || 0, recipientRate.retryAfter || 0, projectRate.retryAfter || 0),
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://app-nova-42373ca7.vercel.app");
  const displayBuildingType = buildingType
    ? String(buildingType).replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Construction Project";
  const safeBuildingType = buildingType
    ? escapeHtml(displayBuildingType)
    : "Construction Project";

  // 1. Store lead in Supabase (no auth needed — service role)
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("rom_leads").upsert({
        email: normalizedEmail,
        building_type: buildingType || null,
        project_sf: projectSF || null,
        total_mid: totalMid || null,
        source: source || "unknown",
        created_at: new Date().toISOString(),
      }, { onConflict: "email" });
    } catch (err) {
      console.warn("[send-rom-results] Lead storage failed:", err.message);
      // Non-critical — continue to send email
    }
  }

  // 2. Send email with results
  if (!apiKey) {
    return res.status(200).json({ success: true, emailSent: false, reason: "Email service not configured" });
  }

  try {
    const resend = new Resend(apiKey);
    const fmt = n => n ? "$" + Math.round(n).toLocaleString("en-US") : "$0";
    const fmtSF = n => n ? "$" + Number(n).toFixed(2) : "$0";

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a1a; color: #e8e8f0; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 24px; font-weight: 300; color: #e8e8f0; margin: 0;">Your NOVATerra Estimate</h1>
          <p style="font-size: 13px; color: rgba(232,232,240,0.4); margin: 8px 0 0;">Powered by real contractor bid data</p>
        </div>

        <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 20px; margin-bottom: 16px;">
          <div style="font-size: 11px; color: rgba(232,232,240,0.4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">Project</div>
          <div style="font-size: 16px; font-weight: 600; color: #e8e8f0;">${safeBuildingType}</div>
          <div style="font-size: 13px; color: rgba(232,232,240,0.5); margin-top: 4px;">${projectSF ? Number(projectSF).toLocaleString() + " SF" : ""}</div>
        </div>

        <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 20px; margin-bottom: 16px;">
          <div style="font-size: 11px; color: rgba(232,232,240,0.4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px;">Estimated Range</div>
          <div style="display: flex; justify-content: space-between; gap: 12px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-size: 11px; color: rgba(232,232,240,0.4);">Low</div>
              <div style="font-size: 18px; font-weight: 600; color: rgba(232,232,240,0.6);">${fmt(totalLow)}</div>
              <div style="font-size: 10px; color: rgba(232,232,240,0.3);">${fmtSF(perSFLow)}/SF</div>
            </div>
            <div style="text-align: center; flex: 1;">
              <div style="font-size: 11px; color: #00D4AA;">Mid</div>
              <div style="font-size: 22px; font-weight: 700; color: #00D4AA;">${fmt(totalMid)}</div>
              <div style="font-size: 10px; color: #00D4AA;">${fmtSF(perSFMid)}/SF</div>
            </div>
            <div style="text-align: center; flex: 1;">
              <div style="font-size: 11px; color: rgba(232,232,240,0.4);">High</div>
              <div style="font-size: 18px; font-weight: 600; color: rgba(232,232,240,0.6);">${fmt(totalHigh)}</div>
              <div style="font-size: 10px; color: rgba(232,232,240,0.3);">${fmtSF(perSFHigh)}/SF</div>
            </div>
          </div>
        </div>

        <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 12px; color: rgba(232,232,240,0.5);">
            ${tradeCount ? `${tradeCount} trade scopes` : ""} ${itemCount ? ` · ${itemCount} line items` : ""} · Calibrated to NYC metro market data
          </div>
        </div>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${appUrl}/rom" style="display: inline-block; padding: 12px 32px; background: #00D4AA; color: #000; font-weight: 600; font-size: 14px; border-radius: 8px; text-decoration: none;">View Full Breakdown</a>
        </div>

        <div style="text-align: center; font-size: 10px; color: rgba(232,232,240,0.25); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px;">
          NOVATerra — Construction intelligence, not guesswork.<br>
          <a href="${appUrl}" style="color: rgba(232,232,240,0.35);">novaterra.app</a>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: `NOVATerra <${fromEmail}>`,
      to: normalizedEmail,
      subject: `Your ${displayBuildingType} Estimate — ${fmt(totalMid)}`,
      html,
    });

    return res.status(200).json({ success: true, emailSent: true });
  } catch (err) {
    console.error("[send-rom-results] Email send failed:", err);
    return res.status(200).json({ success: true, emailSent: false, reason: err.message });
  }
}
