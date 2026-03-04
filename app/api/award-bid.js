// Vercel Serverless Function — Award Bid
// POST { packageId, winnerInvitationId, notes }
// Awards the winner, notifies all subs, closes package

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { supabaseAdmin, verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: "Database not configured" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { packageId, winnerInvitationId, notes } = req.body || {};
  if (!packageId || !winnerInvitationId) {
    return res.status(400).json({ error: "Missing packageId or winnerInvitationId" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  try {
    // Verify package ownership
    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from("bid_packages")
      .select("*")
      .eq("id", packageId)
      .eq("user_id", user.id)
      .single();

    if (pkgErr || !pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    // Prevent double-award
    if (pkg.status === "awarded") {
      return res.status(409).json({ error: "Package already awarded" });
    }

    // Get all invitations for this package
    const { data: invitations, error: invErr } = await supabaseAdmin
      .from("bid_invitations")
      .select("*")
      .eq("package_id", packageId);

    if (invErr) throw invErr;

    const winner = invitations.find(i => i.id === winnerInvitationId);
    if (!winner) {
      return res.status(404).json({ error: "Winner invitation not found" });
    }

    const gcCompany = user.user_metadata?.company || user.email;
    const now = new Date().toISOString();

    // Update winner status
    const { error: winErr } = await supabaseAdmin
      .from("bid_invitations")
      .update({ status: "awarded", awarded_at: now })
      .eq("id", winnerInvitationId);
    if (winErr) throw winErr;

    // Update non-winners
    const losers = invitations.filter(i => i.id !== winnerInvitationId);
    if (losers.length > 0) {
      const { error: loseErr } = await supabaseAdmin
        .from("bid_invitations")
        .update({ status: "not_awarded" })
        .eq("package_id", packageId)
        .neq("id", winnerInvitationId);
      if (loseErr) throw loseErr;
    }

    // Update package
    const { error: pkgUpdateErr } = await supabaseAdmin
      .from("bid_packages")
      .update({
        awarded_invitation_id: winnerInvitationId,
        closed_at: now,
        status: "awarded",
      })
      .eq("id", packageId);
    if (pkgUpdateErr) throw pkgUpdateErr;

    // Send emails (non-blocking)
    if (apiKey) {
      const resend = new Resend(apiKey);

      // Award email to winner
      resend.emails
        .send({
          from: `NOVA Bids <${fromEmail}>`,
          to: [winner.sub_email],
          subject: `Award Notice: ${pkg.name}`,
          html: awardEmailHtml(gcCompany, pkg.name, winner.sub_company || winner.sub_contact),
        })
        .catch(err => console.warn("[award-bid] Winner email failed:", err));

      // Generate feedback for all losers in parallel, then send emails
      const feedbackPromises = losers
        .filter(l => l.sub_email)
        .map(async loser => {
          let feedback = "";
          if (anthropicKey) {
            try {
              const { data: proposal } = await supabaseAdmin
                .from("bid_proposals")
                .select("parsed_data")
                .eq("invitation_id", loser.id)
                .single();

              if (proposal?.parsed_data) {
                const client = new Anthropic({ apiKey: anthropicKey });
                const resp = await client.messages.create({
                  model: "claude-sonnet-4-20250514",
                  max_tokens: 200,
                  system:
                    "Write 2-3 sentences of constructive, professional feedback for a subcontractor who was not awarded a bid. Be specific but kind. Do not mention the winning sub or their price.",
                  messages: [
                    {
                      role: "user",
                      content: `Project: ${pkg.name}\nSub: ${loser.sub_company}\nTheir bid total: $${proposal.parsed_data.totalBid || "N/A"}\nExclusions: ${(proposal.parsed_data.exclusions || []).join(", ") || "None noted"}\nQualifications: ${(proposal.parsed_data.qualifications || []).join(", ") || "None noted"}`,
                    },
                  ],
                });
                feedback = resp.content?.[0]?.text || "";
              }
            } catch (aiErr) {
              console.warn("[award-bid] AI feedback failed for", loser.sub_email, aiErr.message);
            }
          }

          // Save feedback
          if (feedback) {
            supabaseAdmin
              .from("bid_invitations")
              .update({ feedback_notes: feedback })
              .eq("id", loser.id)
              .then(({ error }) => {
                if (error) console.warn("[award-bid] Save feedback failed:", error);
              });
          }

          // Send regret email
          resend.emails
            .send({
              from: `NOVA Bids <${fromEmail}>`,
              to: [loser.sub_email],
              subject: `Bid Result: ${pkg.name}`,
              html: regretEmailHtml(gcCompany, pkg.name, loser.sub_company || loser.sub_contact, feedback),
            })
            .catch(err => console.warn("[award-bid] Regret email failed:", err));
        });

      // Run all feedback generation in parallel
      await Promise.allSettled(feedbackPromises);
    }

    console.log(`[award-bid] Package=${packageId} awarded to ${winner.sub_company}`);
    return res.status(200).json({ status: "awarded", winnerId: winnerInvitationId });
  } catch (err) {
    console.error("[award-bid] Error:", err);
    return res.status(500).json({ error: err.message || "Failed to award bid" });
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function awardEmailHtml(gcCompany, packageName, subCompany) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0D0F14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <div style="background:linear-gradient(135deg,rgba(48,209,88,0.15),rgba(48,209,88,0.05));border:1px solid rgba(48,209,88,0.25);border-radius:16px;padding:32px;">
      <h1 style="color:#30D158;font-size:22px;margin:0 0 12px;">Congratulations!</h1>
      <p style="color:#E5E5EA;font-size:15px;line-height:1.6;margin:0 0 16px;">
        ${escapeHtml(gcCompany)} is pleased to inform you that <strong>${escapeHtml(subCompany)}</strong> has been selected for <strong>${escapeHtml(packageName)}</strong>.
      </p>
      <p style="color:#AEAEB2;font-size:14px;line-height:1.6;margin:0;">
        We'll be in touch shortly with next steps regarding contract and scheduling.
      </p>
    </div>
    <p style="color:#48484A;font-size:11px;text-align:center;margin-top:20px;">Sent via NOVA Estimating</p>
  </div>
</body></html>`;
}

function regretEmailHtml(gcCompany, packageName, subCompany, feedback) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0D0F14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;">
      <h1 style="color:#E5E5EA;font-size:18px;margin:0 0 12px;">Thank you for your proposal</h1>
      <p style="color:#AEAEB2;font-size:14px;line-height:1.6;margin:0 0 16px;">
        ${escapeHtml(gcCompany)} appreciates ${escapeHtml(subCompany)}'s proposal for <strong style="color:#E5E5EA;">${escapeHtml(packageName)}</strong>. After careful review, we've selected another subcontractor for this package.
      </p>
      ${
        feedback
          ? `<div style="background:rgba(124,92,252,0.06);border-left:3px solid rgba(124,92,252,0.4);padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:16px;">
        <div style="color:#7C5CFC;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Feedback</div>
        <p style="color:#E5E5EA;font-size:13px;line-height:1.6;margin:0;">${escapeHtml(feedback)}</p>
      </div>`
          : ""
      }
      <p style="color:#8E8E93;font-size:13px;line-height:1.6;margin:0;">
        We value the relationship and look forward to future opportunities to work together.
      </p>
    </div>
    <p style="color:#48484A;font-size:11px;text-align:center;margin-top:20px;">Sent via NOVA Estimating</p>
  </div>
</body></html>`;
}
