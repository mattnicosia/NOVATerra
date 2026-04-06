import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { parseRfpEmail } from "../lib/parseEmail.js";
import { matchEmail } from "../lib/emailMatcher.js";
import { buildEstimateFromRfp } from "../import-rfp.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RFP Queue Processor — Vercel Cron
//
// Picks the oldest queued RFP and processes it:
//   1. AI parsing (Claude)
//   2. Email matching (addendum/thread detection)
//   3. Auto-draft estimate creation
//
// Progress updates via pending_rfps columns → Supabase Realtime → InboxPage
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_RETRIES = 3;
const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function updateProgress(rfpId, step, progress) {
  await supabaseAdmin
    .from("pending_rfps")
    .update({ processing_step: step, processing_progress: progress })
    .eq("id", rfpId);
}

export default async function handler(req, res) {
  // Verify cron secret (Vercel sets CRON_SECRET for cron jobs)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  try {
    // ── Unstick stale processing jobs ──
    const staleThreshold = new Date(Date.now() - STALE_TIMEOUT_MS).toISOString();
    await supabaseAdmin
      .from("pending_rfps")
      .update({ status: "queued", processing_step: null, processing_progress: 0 })
      .eq("status", "processing")
      .lt("processing_started_at", staleThreshold);

    // ── Re-queue retryable errors ──
    await supabaseAdmin
      .from("pending_rfps")
      .update({ status: "queued" })
      .eq("status", "error")
      .lt("retry_count", MAX_RETRIES);

    // ── Pick oldest queued RFP ──
    const { data: rfp, error: fetchErr } = await supabaseAdmin
      .from("pending_rfps")
      .select("*")
      .eq("status", "queued")
      .order("queue_priority", { ascending: false })
      .order("received_at", { ascending: true })
      .limit(1)
      .single();

    if (fetchErr || !rfp) {
      return res.status(200).json({ status: "idle", message: "No queued RFPs" });
    }

    // ── Claim the job ──
    const { error: claimErr } = await supabaseAdmin
      .from("pending_rfps")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
        processing_step: "starting",
        processing_progress: 0,
      })
      .eq("id", rfp.id)
      .eq("status", "queued"); // optimistic lock

    if (claimErr) {
      return res.status(200).json({ status: "conflict", message: "Job claimed by another worker" });
    }

    console.log(`[process-rfps] Processing rfpId=${rfp.id} subject="${rfp.subject}"`);

    try {
      // ── Step 1: AI Parsing ──
      await updateProgress(rfp.id, "parsing", 10);

      const parsedData = await parseRfpEmail({
        subject: rfp.subject,
        senderEmail: rfp.sender_email,
        senderName: rfp.sender_name,
        text: rfp.raw_text || "",
        html: "",
      });

      const hasError = !!parsedData.error;
      if (hasError) {
        console.error(`[process-rfps] Parse error for ${rfp.id}:`, parsedData.error);
        await supabaseAdmin.from("pending_rfps").update({
          status: "error",
          parse_error: parsedData.error,
          last_error: parsedData.error,
          retry_count: (rfp.retry_count || 0) + 1,
          processing_step: null,
          processing_progress: 0,
        }).eq("id", rfp.id);
        return res.status(200).json({ status: "error", rfpId: rfp.id, error: parsedData.error });
      }

      await updateProgress(rfp.id, "matching", 50);

      // ── Step 2: Email Matching ──
      let emailMatch = null;
      try {
        emailMatch = await matchEmail(
          {
            parsedData,
            senderEmail: rfp.sender_email,
            subject: rfp.subject,
            userId: rfp.user_id,
            inReplyTo: rfp.in_reply_to,
            referencesHeader: rfp.references_header,
          },
          supabaseAdmin,
        );
        if (emailMatch) {
          console.log(
            `[process-rfps] Matched: classification=${emailMatch.classification} parent=${emailMatch.parentRfpId} confidence=${emailMatch.confidence}`,
          );
        }
      } catch (matchErr) {
        console.error(`[process-rfps] Match error (non-critical):`, matchErr.message);
      }

      const classification = parsedData?.classification || emailMatch?.classification || "initial_rfp";
      const isAddendum = emailMatch?.isAddendum || classification === "addendum";

      await updateProgress(rfp.id, "creating_draft", 75);

      // ── Step 3: Auto-draft estimate ──
      let draftEstimateId = null;
      if (!isAddendum && !emailMatch?.estimateId) {
        // Only auto-create for new RFPs (not addenda or matched emails)
        try {
          const estimateData = buildEstimateFromRfp(parsedData);
          draftEstimateId = crypto.randomUUID();

          // Insert draft estimate directly into user_estimates
          const { error: draftErr } = await supabaseAdmin
            .from("user_estimates")
            .insert({
              user_id: rfp.user_id,
              estimate_id: draftEstimateId,
              draft: true,
              project_name: parsedData.projectName || rfp.subject || "Imported RFP",
              status: "Bidding",
              client: parsedData.client?.company || "",
              bid_due: parsedData.bidDue || null,
              building_type: parsedData.jobType || "",
              data: {
                ...estimateData,
                id: draftEstimateId,
                name: parsedData.projectName || rfp.subject || "Imported RFP",
                draft: true,
                sourceRfpId: rfp.id,
                emailCount: 1,
                lastEmailAt: rfp.received_at || new Date().toISOString(),
                createdAt: new Date().toISOString(),
              },
            });

          if (draftErr) {
            console.error(`[process-rfps] Draft creation error:`, draftErr.message);
            draftEstimateId = null;
          } else {
            console.log(`[process-rfps] Auto-draft created: estimateId=${draftEstimateId}`);
          }
        } catch (draftErr) {
          console.error(`[process-rfps] Draft creation error:`, draftErr.message);
        }
      }

      // ── Step 4: Update RFP with results ──
      await supabaseAdmin
        .from("pending_rfps")
        .update({
          parsed_data: parsedData,
          parse_error: null,
          status: "parsed",
          classification,
          type: isAddendum ? "addendum" : emailMatch ? "related" : "original",
          parent_rfp_id: emailMatch?.parentRfpId || null,
          parent_estimate_id: emailMatch?.estimateId || null,
          linked_estimate_id: draftEstimateId || emailMatch?.estimateId || null,
          addendum_number: emailMatch?.addendumNumber || null,
          match_confidence: emailMatch?.confidence || null,
          processing_step: null,
          processing_progress: 100,
          last_error: null,
        })
        .eq("id", rfp.id);

      console.log(
        `[process-rfps] Done rfpId=${rfp.id} classification=${classification} draft=${draftEstimateId || "none"}`,
      );

      return res.status(200).json({
        status: "processed",
        rfpId: rfp.id,
        classification,
        draftEstimateId,
      });
    } catch (processErr) {
      // Job-level error — mark for retry
      console.error(`[process-rfps] Processing failed for ${rfp.id}:`, processErr.message);
      await supabaseAdmin.from("pending_rfps").update({
        status: "error",
        last_error: processErr.message,
        retry_count: (rfp.retry_count || 0) + 1,
        processing_step: null,
        processing_progress: 0,
      }).eq("id", rfp.id);

      return res.status(200).json({ status: "error", rfpId: rfp.id, error: processErr.message });
    }
  } catch (err) {
    console.error("[process-rfps] Cron error:", err.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
