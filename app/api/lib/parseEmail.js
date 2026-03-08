/**
 * Parse an RFP email using Claude to extract structured bid information.
 * Uses direct fetch to Anthropic API (more reliable in serverless environments).
 * Returns a JSON object matching the project schema fields.
 */
export async function parseRfpEmail({ subject, senderEmail, senderName, text, html }) {
  const emailBody =
    text ||
    (html
      ? html
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "");

  if (!emailBody || emailBody.length < 20) {
    return { error: "Email body too short to parse", confidence: 0 };
  }

  const systemPrompt = `You are a construction bid parsing assistant for a general contractor's estimating software. You will receive the text content of a forwarded RFP (Request for Proposal) email or bid invitation. Extract structured project information from the email chain.

IMPORTANT RULES:
- Extract only information that is explicitly stated in the email. Do not infer or guess.
- For fields where information is not available, use null.
- Dates should be in YYYY-MM-DD format. Times in HH:MM (24-hour).
- If the email chain contains multiple messages, prioritize the most recent/original RFP details.
- Look for: project name, client/owner, architect, engineer, address, bid due date and time, walkthrough date, RFI deadline, job type, bid type, bid delivery method, project square footage, scope description, and any special bid requirements.
- Also extract contact information for any parties mentioned (company, person name, email, phone).
- For architect: Look carefully in email signatures, letterheads, CC lists, plan references, drawing title blocks mentioned in text, and any "Architect:", "A/E:", "Design Team:", or "Prepared by:" fields. Architects are often mentioned in the body or signature blocks of forwarded emails.
- For client/owner: Look for "Owner:", "Client:", "For:", project owner references, and the party issuing the bid invitation.
- All person names (first and last) should use Title Case capitalization (e.g. "John Smith", not "john smith" or "JOHN SMITH").
- All company names should use their proper capitalization.
- For jobType use one of: "New Construction", "Renovation", "Gut Renovation", "Tenant Fit-Out", "Interior Fit-Out", "Addition", "Adaptive Reuse", "Historic Restoration", "Shell & Core", "Capital Improvement", "Demolition", "Commercial", "Retail", "Industrial / Warehouse", "Healthcare / Medical", "Education", "Hospitality", "Multi-Family Residential", "Residential", "Mixed-Use", "Government / Municipal", "Religious / House of Worship", "Restaurant / Food Service", "Parking Structure" — pick the best match.
- For bidType use one of: "Hard Bid", "Negotiated", "Design-Build", "CM at Risk", "GMP" — or null if unclear.
- For bidDelivery use one of: "Email", "Sealed & Delivered", "Both", "Online Portal" — or null if unclear.
- Extract all cloud storage or file sharing links (Dropbox, Google Drive, Box, OneDrive, SharePoint, WeTransfer, etc.) found in the email body. For "label", use any descriptive text near the link (e.g. "Construction Plans", "Bid Documents"). If no label is discernible, use null. For "provider", identify the service from the URL domain.
- Look for "Bid List", "Plan Holders", "Invited Bidders", "Distribution List", "Bidder's List" sections in the email. If found, extract the company names and any associated contact info as bidList entries.
- Detect if this email is an addendum or revision to a previous bid invitation. Look for "Addendum", "Addendum #N", "Add.", "Revised", "Updated Plans", "Supplement", "Bulletin", "Amended" in the subject line or body. Set isAddendum to true if detected, and extract the addendum number if present. If the email references a parent project name (e.g. "Addendum #2 for Acme Office Tower"), extract that as parentProjectName.

Respond with ONLY a valid JSON object (no markdown fences, no explanation):

{
  "projectName": string | null,
  "client": { "company": string|null, "contact": string|null, "email": string|null, "phone": string|null } | null,
  "architect": { "company": string|null, "contact": string|null, "email": string|null, "phone": string|null } | null,
  "engineer": { "company": string|null, "contact": string|null, "email": string|null, "phone": string|null } | null,
  "address": string | null,
  "bidDue": "YYYY-MM-DD" | null,
  "bidDueTime": "HH:MM" | null,
  "walkthroughDate": "YYYY-MM-DD" | null,
  "rfiDueDate": "YYYY-MM-DD" | null,
  "jobType": string | null,
  "bidType": string | null,
  "bidDelivery": string | null,
  "description": string | null,
  "projectSF": number | null,
  "bidRequirements": {
    "schedule": boolean,
    "marketing": boolean,
    "financials": boolean,
    "bonds": boolean,
    "insurance": boolean,
    "references": boolean,
    "safetyPlan": boolean,
    "other": string | null
  },
  "scopeNotes": [string],
  "additionalDates": [{ "label": string, "date": "YYYY-MM-DD" }],
  "planLinks": [{ "url": string, "provider": "dropbox"|"google_drive"|"box"|"onedrive"|"sharepoint"|"wetransfer"|"other", "label": string|null }],
  "bidList": [{ "company": string, "contact": string|null, "email": string|null, "phone": string|null }],
  "isAddendum": boolean,
  "addendumNumber": number | null,
  "parentProjectName": string | null,
  "confidence": number
}`;

  const userMessage = `Email Subject: ${subject || "(no subject)"}
From: ${senderName || "Unknown"} <${senderEmail || "unknown"}>

--- Email Body ---
${emailBody.slice(0, 8000)}
---`;

  try {
    const apiKey = (process.env.ANTHROPIC_API_KEY || "")
      .replace(/\\n/g, "")
      .replace(/\n/g, "")
      .replace(/\r/g, "")
      .replace(/"/g, "")
      .trim();
    if (!apiKey) {
      return { error: "ANTHROPIC_API_KEY not configured", confidence: 0 };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Anthropic API error:", response.status, errBody);
      const hint = response.status === 401 ? " (API key invalid or expired — update ANTHROPIC_API_KEY in Vercel)" : "";
      return { error: `API error: ${response.status}${hint}`, confidence: 0 };
    }

    const data = await response.json();
    const responseText = data.content
      .filter(c => c.type === "text")
      .map(c => c.text)
      .join("")
      .trim();

    // Parse the JSON response
    const parsed = JSON.parse(responseText);
    return parsed;
  } catch (err) {
    console.error("AI parse error:", err.message);
    return { error: err.message, confidence: 0 };
  }
}
