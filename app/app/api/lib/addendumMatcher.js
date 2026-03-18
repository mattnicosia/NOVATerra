/**
 * Addendum Matcher — Server-side detection of addendum emails.
 *
 * When a new email arrives at the webhook, this module checks if it's
 * an addendum to an already-imported project. Matching uses:
 * 1. Subject line addendum keywords
 * 2. Same sender as imported RFP
 * 3. Project name similarity (fuzzy)
 * 4. Architect match
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
  // Check if one contains the other
  if (la.includes(lb) || lb.includes(la)) return 0.85;
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(la, lb);
  return Math.max(0, 1 - dist / maxLen);
}

// Score a candidate imported RFP against the incoming email
function scoreMatch(candidate, { parsedData, subject, hasAddendumKeyword }) {
  let score = 0;

  // 1. Subject similarity (strongest signal when subjects match after stripping prefixes)
  const cleanedIncoming = cleanSubject(subject);
  const cleanedCandidate = cleanSubject(candidate.subject);
  if (cleanedIncoming && cleanedCandidate) {
    const subjectSim = similarity(cleanedIncoming, cleanedCandidate);
    if (subjectSim >= 0.9) score += 0.5;
    else if (subjectSim >= 0.7) score += 0.35;
    else if (subjectSim >= 0.5) score += 0.2;
  }

  // 2. Project name match
  const pName = parsedData?.projectName?.toLowerCase();
  const cName = candidate.parsed_data?.projectName?.toLowerCase();
  if (pName && cName) {
    const nameSim = similarity(pName, cName);
    if (nameSim >= 0.8) score += 0.3;
    else if (nameSim >= 0.6) score += 0.2;
  }

  // 3. Addendum keyword in subject (if present, boosts score)
  if (hasAddendumKeyword) score += 0.2;

  // 4. Same architect (confirms same project)
  const incomingArch = parsedData?.architect?.company?.toLowerCase();
  const candidateArch = candidate.parsed_data?.architect?.company?.toLowerCase();
  if (incomingArch && candidateArch && similarity(incomingArch, candidateArch) >= 0.8) {
    score += 0.1;
  }

  return Math.min(score, 1);
}

// Look up estimate ID created from a given RFP
async function lookupEstimateByRfpId(rfpId, userId, supabase) {
  // Check if we stored estimate_id on the RFP row itself
  const { data } = await supabase.from("pending_rfps").select("parent_estimate_id").eq("id", rfpId).single();

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

  const lastNum = data?.[0]?.addendum_number || 0;
  return lastNum + 1;
}

/**
 * Detect if an incoming email is an addendum to an existing imported project.
 *
 * @param {Object} params
 * @param {Object} params.parsedData - AI-parsed email data
 * @param {string} params.senderEmail - Sender's email address
 * @param {string} params.subject - Email subject
 * @param {string} params.userId - User ID
 * @param {Object} supabase - Supabase admin client
 * @returns {Object|null} Match result or null
 */
export async function detectAddendum({ parsedData, senderEmail, subject, userId }, supabase) {
  const hasAddendumKeyword = ADDENDUM_SIGNALS.test(subject || "");

  // Also check if AI parser detected it as addendum
  const aiDetectedAddendum = parsedData?.isAddendum === true;

  // Find imported RFPs from same sender (most likely addendum source)
  const { data: candidates } = await supabase
    .from("pending_rfps")
    .select("id, parsed_data, subject, sender_email, status, parent_estimate_id")
    .eq("user_id", userId)
    .eq("sender_email", senderEmail)
    .eq("status", "imported")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!candidates?.length) return null;

  // Score each candidate and find best match
  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scoreMatch(candidate, { parsedData, subject, hasAddendumKeyword });
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  // Require minimum confidence threshold
  // Lower threshold if AI parser also flagged it as addendum
  const threshold = aiDetectedAddendum ? 0.4 : 0.6;
  if (!bestMatch || bestScore < threshold) return null;

  // Look up the estimate that was created from the matched RFP
  const estimateId = await lookupEstimateByRfpId(bestMatch.id, userId, supabase);

  // Determine addendum number
  const addendumNumber =
    extractAddendumNumber(subject) ||
    parsedData?.addendumNumber ||
    (await getNextAddendumNumber(bestMatch.id, supabase));

  return {
    parentRfpId: bestMatch.id,
    estimateId,
    addendumNumber,
    confidence: bestScore,
    parentProjectName: bestMatch.parsed_data?.projectName || null,
  };
}
