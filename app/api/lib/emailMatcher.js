/**
 * Email Matcher — Server-side detection of related emails for existing projects.
 *
 * Upgraded from addendumMatcher.js. Now detects ALL related emails, not just addenda:
 * addenda, date changes, scope clarifications, substitutions, pre-bid notes, etc.
 *
 * Matching signals (in priority order):
 * 1. Email thread headers (In-Reply-To / References — most reliable)
 * 2. Sender domain + subject similarity
 * 3. Project name similarity (fuzzy)
 * 4. Architect match
 * 5. AI classification signals
 *
 * Returns match metadata or null if no match found.
 */

// Regex for addendum keywords in subject
const ADDENDUM_SIGNALS =
  /addend|revised|updated\s*plans|rev\s*\d|bulletin|supplement|amended|modification|change\s*order/i;

// Extract addendum number from subject: "Addendum #3", "Add. 2", "Addendum No. 4"
function extractAddendumNumber(subject) {
  if (!subject) return null;
  const match = subject.match(/addend(?:um|a)?\s*(?:#|no\.?\s*)?(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// Strip Re:/Fwd:/Addendum prefixes for base subject comparison
function cleanSubject(s) {
  if (!s) return "";
  return s
    .replace(/^(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/^addend(?:um|a)?\s*(?:#|no\.?\s*)?\d*\s*[-:–—]?\s*/gi, "")
    .replace(/^(revised|updated|amended)\s*[-:–—]?\s*/gi, "")
    .trim()
    .toLowerCase();
}

// Simple Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
  if (!a || !b) return Math.max((a || "").length, (b || "").length);
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Normalized similarity (0–1) between two strings
function similarity(a, b) {
  if (!a || !b) return 0;
  const la = a.toLowerCase(),
    lb = b.toLowerCase();
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.85;
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(la, lb);
  return Math.max(0, 1 - dist / maxLen);
}

// Extract domain from email address
function domainOf(email) {
  if (!email) return "";
  return email.split("@")[1]?.toLowerCase() || "";
}

// Score a candidate RFP against the incoming email
function scoreMatch(candidate, { parsedData, subject, senderDomain }) {
  let score = 0;

  // 1. Subject similarity (strongest heuristic signal)
  const cleanedIncoming = cleanSubject(subject);
  const cleanedCandidate = cleanSubject(candidate.subject);
  if (cleanedIncoming && cleanedCandidate) {
    const subjectSim = similarity(cleanedIncoming, cleanedCandidate);
    if (subjectSim >= 0.9) score += 0.5;
    else if (subjectSim >= 0.7) score += 0.35;
    else if (subjectSim >= 0.5) score += 0.2;
  }

  // 2. Project name match (from AI-parsed data)
  const pName = parsedData?.projectName?.toLowerCase() || parsedData?.parentProjectName?.toLowerCase();
  const cName = candidate.parsed_data?.projectName?.toLowerCase();
  if (pName && cName) {
    const nameSim = similarity(pName, cName);
    if (nameSim >= 0.8) score += 0.3;
    else if (nameSim >= 0.6) score += 0.2;
  }

  // 3. Same sender domain (emails from different people at the same firm)
  const candidateDomain = candidate.sender_domain || domainOf(candidate.sender_email);
  if (senderDomain && candidateDomain && senderDomain === candidateDomain) {
    score += 0.15;
  }

  // 4. Same architect (confirms same project)
  const incomingArch = parsedData?.architect?.company?.toLowerCase();
  const candidateArch = candidate.parsed_data?.architect?.company?.toLowerCase();
  if (incomingArch && candidateArch && similarity(incomingArch, candidateArch) >= 0.8) {
    score += 0.1;
  }

  return Math.min(score, 1);
}

// Look up estimate ID linked to a given RFP
async function lookupEstimateByRfpId(rfpId, userId, supabase) {
  const { data } = await supabase
    .from("pending_rfps")
    .select("linked_estimate_id, parent_estimate_id")
    .eq("id", rfpId)
    .single();

  if (data?.linked_estimate_id) return data.linked_estimate_id;
  if (data?.parent_estimate_id) return data.parent_estimate_id;

  // Fallback: check user_estimates for rfpId reference
  const { data: est } = await supabase
    .from("user_estimates")
    .select("id")
    .eq("user_id", userId)
    .eq("rfp_id", rfpId)
    .is("deleted_at", null)
    .single();

  return est?.id || null;
}

// Get the next addendum number for a parent RFP
async function getNextAddendumNumber(parentRfpId, supabase) {
  const { data } = await supabase
    .from("pending_rfps")
    .select("addendum_number")
    .eq("parent_rfp_id", parentRfpId)
    .order("addendum_number", { ascending: false })
    .limit(1);

  return (data?.[0]?.addendum_number || 0) + 1;
}

/**
 * Match an incoming email to an existing project/estimate.
 *
 * Three-phase matching:
 * Phase 1: Thread headers (In-Reply-To / References) — highest confidence
 * Phase 2: Sender + subject + project name heuristics
 * Phase 3: AI classification boost
 *
 * @param {Object} params
 * @param {Object} params.parsedData - AI-parsed email data
 * @param {string} params.senderEmail - Sender's email address
 * @param {string} params.subject - Email subject
 * @param {string} params.userId - User ID
 * @param {string} [params.inReplyTo] - In-Reply-To header
 * @param {string} [params.referencesHeader] - References header (space-separated message IDs)
 * @param {Object} supabase - Supabase admin client
 * @returns {Object|null} Match result with classification
 */
export async function matchEmail({ parsedData, senderEmail, subject, userId, inReplyTo, referencesHeader }, supabase) {
  const senderDomain = domainOf(senderEmail);
  const aiClassification = parsedData?.classification || "initial_rfp";
  const isNonInitial = aiClassification !== "initial_rfp";

  // ── Phase 1: Thread header matching (most reliable) ──────────────────
  if (inReplyTo || referencesHeader) {
    const messageIds = [];
    if (inReplyTo) messageIds.push(inReplyTo.trim());
    if (referencesHeader) {
      referencesHeader
        .split(/\s+/)
        .filter(Boolean)
        .forEach(id => {
          if (!messageIds.includes(id)) messageIds.push(id);
        });
    }

    if (messageIds.length > 0) {
      // Look for any existing RFP whose message_id matches our In-Reply-To or References
      const { data: threadMatches } = await supabase
        .from("pending_rfps")
        .select(
          "id, parsed_data, subject, sender_email, sender_domain, status, linked_estimate_id, parent_estimate_id, parent_rfp_id",
        )
        .eq("user_id", userId)
        .in("message_id", messageIds)
        .order("created_at", { ascending: false })
        .limit(5);

      if (threadMatches?.length > 0) {
        // Thread header match — highest confidence
        const threadParent = threadMatches[0];
        const estimateId =
          threadParent.linked_estimate_id ||
          threadParent.parent_estimate_id ||
          (await lookupEstimateByRfpId(threadParent.id, userId, supabase));

        // Resolve the root parent RFP (follow parent_rfp_id chain)
        const parentRfpId = threadParent.parent_rfp_id || threadParent.id;

        const result = {
          parentRfpId,
          estimateId,
          confidence: 0.95, // Thread headers are very reliable
          classification: aiClassification,
          parentProjectName: threadParent.parsed_data?.projectName || null,
        };

        // Add addendum-specific fields if applicable
        if (aiClassification === "addendum" || ADDENDUM_SIGNALS.test(subject || "")) {
          result.addendumNumber =
            extractAddendumNumber(subject) ||
            parsedData?.addendumNumber ||
            (await getNextAddendumNumber(parentRfpId, supabase));
          result.isAddendum = true;
        }

        return result;
      }
    }
  }

  // ── Phase 2: Heuristic matching (sender + subject + project name) ────
  // Search imported RFPs AND other parsed RFPs with linked estimates
  // Expand beyond just same sender — also match by sender domain
  const { data: candidates } = await supabase
    .from("pending_rfps")
    .select(
      "id, parsed_data, subject, sender_email, sender_domain, status, linked_estimate_id, parent_estimate_id, parent_rfp_id",
    )
    .eq("user_id", userId)
    .in("status", ["imported", "parsed"])
    .order("created_at", { ascending: false })
    .limit(30);

  if (!candidates?.length) return null;

  // Filter to candidates that share sender email OR sender domain
  const relevantCandidates = candidates.filter(c => {
    if (c.sender_email === senderEmail) return true;
    const cDomain = c.sender_domain || domainOf(c.sender_email);
    return senderDomain && cDomain && senderDomain === cDomain;
  });

  if (!relevantCandidates.length) {
    // No sender match — try project name match only (weaker signal)
    const pName = parsedData?.projectName?.toLowerCase() || parsedData?.parentProjectName?.toLowerCase();
    if (!pName) return null;

    let bestMatch = null;
    let bestScore = 0;
    for (const c of candidates) {
      const cName = c.parsed_data?.projectName?.toLowerCase();
      if (!cName) continue;
      const nameSim = similarity(pName, cName);
      if (nameSim >= 0.8 && nameSim > bestScore) {
        bestScore = nameSim;
        bestMatch = c;
      }
    }
    // Name-only match requires very high similarity + AI classification as non-initial
    if (!bestMatch || bestScore < 0.8 || !isNonInitial) return null;

    const estimateId =
      bestMatch.linked_estimate_id ||
      bestMatch.parent_estimate_id ||
      (await lookupEstimateByRfpId(bestMatch.id, userId, supabase));

    const parentRfpId = bestMatch.parent_rfp_id || bestMatch.id;

    return {
      parentRfpId,
      estimateId,
      confidence: bestScore * 0.6, // Discount: name-only match
      classification: aiClassification,
      parentProjectName: bestMatch.parsed_data?.projectName || null,
    };
  }

  // Score each relevant candidate
  let bestMatch = null;
  let bestScore = 0;
  for (const candidate of relevantCandidates) {
    const score = scoreMatch(candidate, { parsedData, subject, senderDomain });
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  // ── Phase 3: AI classification boost ─────────────────────────────────
  // If AI says this is NOT an initial RFP, lower the confidence threshold
  const hasAddendumKeyword = ADDENDUM_SIGNALS.test(subject || "");
  const aiDetectedAddendum = parsedData?.isAddendum === true;
  let threshold = 0.5; // Base threshold
  if (isNonInitial) threshold = 0.35; // AI says it's a follow-up — lower bar
  if (hasAddendumKeyword) bestScore += 0.15; // Subject has addendum keywords
  if (aiDetectedAddendum) threshold = 0.3; // AI explicitly detected addendum

  if (!bestMatch || bestScore < threshold) return null;

  const estimateId =
    bestMatch.linked_estimate_id ||
    bestMatch.parent_estimate_id ||
    (await lookupEstimateByRfpId(bestMatch.id, userId, supabase));

  const parentRfpId = bestMatch.parent_rfp_id || bestMatch.id;

  const result = {
    parentRfpId,
    estimateId,
    confidence: bestScore,
    classification: aiClassification,
    parentProjectName: bestMatch.parsed_data?.projectName || null,
  };

  // Add addendum-specific fields
  if (aiClassification === "addendum" || hasAddendumKeyword || aiDetectedAddendum) {
    result.addendumNumber =
      extractAddendumNumber(subject) ||
      parsedData?.addendumNumber ||
      (await getNextAddendumNumber(parentRfpId, supabase));
    result.isAddendum = true;
  }

  return result;
}

// ── Backward compatibility: export detectAddendum as alias ──
export async function detectAddendum(params, supabase) {
  return matchEmail(params, supabase);
}
