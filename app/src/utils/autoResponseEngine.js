// Auto-Response Engine — fires triggers, generates AI drafts, manages the queue
import { useCollaborationStore, TRIGGER_TYPES } from "@/stores/collaborationStore";
import { callAnthropic } from "@/utils/ai";

/* ─── AI prompt templates per trigger type ─── */
const TRIGGER_PROMPTS = {
  portalOpened: {
    system:
      'You are NOVA, an AI assistant for a general contractor. Write a brief, professional welcome email to a subcontractor who just opened their bid invitation portal. Be warm but concise (3-5 sentences). Mention the project name, due date, and encourage them to review the scope and submit their proposal. Output JSON: { "subject": "...", "body": "..." } where body is plain text.',
    buildContext: ctx =>
      `Project: ${ctx.projectName}\nSubcontractor: ${ctx.subCompany}\nDue Date: ${ctx.dueDate}\nGC Company: ${ctx.gcCompany || "Our firm"}`,
  },
  proposalSubmitted: {
    system:
      'You are NOVA, an AI assistant for a general contractor. Write a brief acknowledgment email (3-5 sentences) to a sub who just submitted their bid proposal. Thank them, confirm receipt, mention the project name, and let them know the team will review and follow up. Output JSON: { "subject": "...", "body": "..." }.',
    buildContext: ctx =>
      `Project: ${ctx.projectName}\nSubcontractor: ${ctx.subCompany}\nBid Amount: ${ctx.bidAmount || "not disclosed"}\nGC Company: ${ctx.gcCompany || "Our firm"}`,
  },
  bidDue48h: {
    system:
      'You are NOVA, an AI assistant for a general contractor. Write a friendly deadline reminder email (3-4 sentences) for a sub who hasn\'t submitted yet — bids are due in about 48 hours. Mention the project, due date, and encourage submission. Professional and helpful, not pushy. Output JSON: { "subject": "...", "body": "..." }.',
    buildContext: ctx =>
      `Project: ${ctx.projectName}\nSubcontractor: ${ctx.subCompany}\nDue Date: ${ctx.dueDate}\nStatus: Has not yet submitted`,
  },
  bidDue24h: {
    system:
      'You are NOVA, an AI assistant for a general contractor. Write a final deadline reminder email (3-4 sentences) — bids are due in about 24 hours. Slightly more urgent than a general reminder but still professional. Mention the exact due date. Output JSON: { "subject": "...", "body": "..." }.',
    buildContext: ctx =>
      `Project: ${ctx.projectName}\nSubcontractor: ${ctx.subCompany}\nDue Date: ${ctx.dueDate}\nStatus: Final reminder — has not yet submitted`,
  },
  postAwardWinner: {
    system:
      'You are NOVA, an AI assistant for a general contractor. Write a congratulatory award email (4-6 sentences). The sub was selected for this project. Mention next steps: contract preparation, scheduling coordination, submittal requirements. Output JSON: { "subject": "...", "body": "..." }.',
    buildContext: ctx =>
      `Project: ${ctx.projectName}\nSubcontractor: ${ctx.subCompany}\nGC Company: ${ctx.gcCompany || "Our firm"}\nBid Amount: ${ctx.bidAmount || "N/A"}`,
  },
  postAwardLoser: {
    system:
      'You are NOVA, an AI assistant for a general contractor. Write a professional regret notification (4-5 sentences) with constructive tone. Thank them for their proposal, let them know they were not selected this time, express appreciation, and encourage future participation. Do NOT mention the winning sub or their price. Output JSON: { "subject": "...", "body": "..." }.',
    buildContext: ctx =>
      `Project: ${ctx.projectName}\nSubcontractor: ${ctx.subCompany}\nTheir Bid: ${ctx.bidAmount || "N/A"}`,
  },
  noResponse72h: {
    system:
      'You are NOVA, an AI assistant for a general contractor. Write a brief follow-up email (3-4 sentences) to a sub who received a bid invitation 72+ hours ago but hasn\'t opened it. Be professional and helpful — assume they may have missed the original email. Mention the project name, encourage them to review the scope, and note the due date. Output JSON: { "subject": "...", "body": "..." }.',
    buildContext: ctx =>
      `Project: ${ctx.projectName}\nSubcontractor: ${ctx.subCompany}\nDue Date: ${ctx.dueDate}\nSent: ${ctx.sentAt || "3+ days ago"}\nGC Company: ${ctx.gcCompany || "Our firm"}`,
  },
};

/* ─── Default subject fallbacks (used if AI fails) ─── */
const DEFAULT_SUBJECTS = {
  portalOpened: ctx => `Welcome — ${ctx.projectName} Bid Invitation`,
  proposalSubmitted: ctx => `Proposal Received — ${ctx.projectName}`,
  bidDue48h: ctx => `Reminder: ${ctx.projectName} — Bids Due in 48 Hours`,
  bidDue24h: ctx => `Final Reminder: ${ctx.projectName} — Bids Due Tomorrow`,
  postAwardWinner: ctx => `Award Notice: ${ctx.projectName}`,
  postAwardLoser: ctx => `Bid Result: ${ctx.projectName}`,
  noResponse72h: ctx => `Following Up — ${ctx.projectName} Bid Invitation`,
};

const DEFAULT_BODIES = {
  portalOpened: ctx =>
    `Thank you for reviewing the bid invitation for ${ctx.projectName}. Please take time to review the scope and drawings. Bids are due ${ctx.dueDate || "soon"}. We look forward to receiving your proposal.`,
  proposalSubmitted: ctx =>
    `Thank you for submitting your proposal for ${ctx.projectName}. We have received your bid and our team will review it shortly. We will follow up with next steps.`,
  bidDue48h: ctx =>
    `This is a friendly reminder that bids for ${ctx.projectName} are due ${ctx.dueDate || "in approximately 48 hours"}. If you haven't had a chance to submit yet, please do so at your earliest convenience.`,
  bidDue24h: ctx =>
    `Final reminder — bids for ${ctx.projectName} are due ${ctx.dueDate || "tomorrow"}. Please submit your proposal as soon as possible to ensure it is considered.`,
  postAwardWinner: ctx =>
    `Congratulations! We are pleased to inform you that ${ctx.subCompany} has been selected for ${ctx.projectName}. Our team will be in touch shortly regarding contract preparation and next steps.`,
  postAwardLoser: ctx =>
    `Thank you for submitting your proposal for ${ctx.projectName}. After careful review, we have decided to move forward with another firm for this project. We appreciate your time and effort, and we look forward to working with you on future opportunities.`,
  noResponse72h: ctx =>
    `We wanted to follow up on the bid invitation we sent for ${ctx.projectName}. We haven't seen activity on your portal yet and wanted to make sure it didn't get lost. Please take a moment to review the scope — bids are due ${ctx.dueDate || "soon"}.`,
};

/* ─── Main trigger function ─── */
export async function fireAutoResponse(triggerType, context) {
  const store = useCollaborationStore.getState();

  // 1. Check if trigger is enabled
  const config = store.triggerConfig[triggerType];
  if (!config?.enabled) return null;

  // 2. Duplicate guard
  if (context.invitationId && store.hasDraft(triggerType, context.invitationId)) {
    return null;
  }

  // 3. Try AI-powered draft generation
  let subject, body;
  try {
    const prompt = TRIGGER_PROMPTS[triggerType];
    if (prompt) {
      const result = await callAnthropic({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.buildContext(context) }],
        temperature: 0.7,
      });

      // Parse AI response
      const text = result?.content?.[0]?.text || "";
      try {
        // Try JSON parse first
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          subject = parsed.subject;
          body = parsed.body;
        }
      } catch {
        // If JSON parse fails, use the raw text as body
        body = text;
      }
    }
  } catch (err) {
    console.warn(`[AutoResponse] AI draft failed for ${triggerType}:`, err.message);
  }

  // 4. Fallback to defaults if AI failed
  if (!subject)
    subject = DEFAULT_SUBJECTS[triggerType]?.(context) || `Auto-Response: ${context.projectName || "Project"}`;
  if (!body) body = DEFAULT_BODIES[triggerType]?.(context) || "Thank you for your engagement with this project.";

  // 5. Add draft to queue
  const draft = {
    triggerType,
    packageId: context.packageId || "",
    invitationId: context.invitationId || "",
    recipientEmail: context.recipientEmail || "",
    recipientName: context.subCompany || context.recipientName || "",
    projectName: context.projectName || "",
    subject,
    body,
    context,
  };

  store.addDraft(draft);
  return draft;
}

/* ─── Send an approved draft via API ─── */
export async function sendAutoResponse(draft) {
  const { buildNovaEmailHtml } = await import("@/utils/novaEmailHtml");
  const htmlBody = buildNovaEmailHtml({
    heading: draft.subject,
    body: draft.body,
  });

  // Get auth token
  const { useAuthStore } = await import("@/stores/authStore");
  const authState = useAuthStore.getState();
  const token = authState.user?.access_token || (await authState.getSession())?.access_token;
  if (!token) throw new Error("Not authenticated");

  const resp = await fetch("/api/send-auto-response", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      invitationId: draft.invitationId,
      subject: draft.subject,
      htmlBody,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Send failed (${resp.status})`);
  }

  const result = await resp.json();

  // Mark as sent in store
  useCollaborationStore.getState().markSent(draft.id, result.emailId);
  return result;
}

/* ─── Generate 2 alternative drafts for a given draft ─── */
export async function generateAlternatives(draft) {
  const prompt = TRIGGER_PROMPTS[draft.triggerType];
  if (!prompt) return [];

  try {
    const result = await callAnthropic({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: prompt.system.replace(
        /Output JSON:.*$/,
        'Generate 2 alternative versions with distinctly different tones (e.g. formal vs friendly, concise vs detailed). Output JSON: { "alternatives": [{ "subject": "...", "body": "..." }, { "subject": "...", "body": "..." }] }',
      ),
      messages: [
        {
          role: "user",
          content:
            prompt.buildContext(draft.context) +
            `\n\nOriginal subject: "${draft.subject}"\nOriginal body: "${draft.body}"\n\nGenerate 2 distinctly different alternatives.`,
        },
      ],
      temperature: 0.9,
    });

    const text = result?.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.alternatives)) return parsed.alternatives;
    }
  } catch (err) {
    console.warn("[AutoResponse] Alternative generation failed:", err.message);
  }
  return [];
}

/* ─── Get trigger type metadata ─── */
export function getTriggerMeta(type) {
  return TRIGGER_TYPES[type] || { label: type, description: "", color: "#8E8E93" };
}
