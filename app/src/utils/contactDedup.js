/**
 * Contact Deduplication — Fuzzy matching + merge for imported contacts.
 *
 * When RFPs are imported, contacts extracted from email may already exist
 * in masterData. This utility detects duplicates and merges rather than
 * creating new entries.
 */

// Simple Levenshtein distance
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

// Normalize company name for comparison (strip common suffixes)
function normalizeCompany(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|company|group|associates|& associates|llp|pc|pllc|pa)\b\.?/gi, "")
    .replace(/[.,]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Find a duplicate contact in the existing contacts list.
 *
 * @param {Object} newContact - { company, contact, email, phone }
 * @param {Array} existingContacts - Array of existing contact objects
 * @returns {{ match: Object, confidence: number } | null}
 */
export function findDuplicateContact(newContact, existingContacts) {
  if (!newContact || !existingContacts?.length) return null;

  let bestMatch = null;
  let bestConfidence = 0;

  for (const existing of existingContacts) {
    let confidence = 0;

    // 1. Exact email match — strongest signal
    if (newContact.email && existing.email && newContact.email.toLowerCase() === existing.email.toLowerCase()) {
      confidence = 1.0;
    }

    // 2. Company name matching
    if (confidence < 1.0 && newContact.company && existing.company) {
      const normNew = normalizeCompany(newContact.company);
      const normExisting = normalizeCompany(existing.company);

      if (normNew && normExisting) {
        // Exact (normalized) match
        if (normNew === normExisting) {
          confidence = Math.max(confidence, 0.85);
        }
        // One contains the other
        else if (normNew.includes(normExisting) || normExisting.includes(normNew)) {
          confidence = Math.max(confidence, 0.75);
        }
        // Fuzzy match (Levenshtein)
        else {
          const maxLen = Math.max(normNew.length, normExisting.length);
          const dist = levenshtein(normNew, normExisting);
          const sim = 1 - dist / maxLen;
          if (sim >= 0.8) {
            confidence = Math.max(confidence, 0.65);
          }
        }
      }
    }

    // 3. Contact person name boost (adds to company match)
    if (confidence >= 0.5 && newContact.contact && existing.contact) {
      const normNewName = newContact.contact.toLowerCase().trim();
      const normExName = existing.contact.toLowerCase().trim();
      if (normNewName === normExName) {
        confidence = Math.min(confidence + 0.15, 1.0);
      }
    }

    // Track best match
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestMatch = existing;
    }
  }

  // Minimum threshold for considering a match
  if (bestConfidence >= 0.6 && bestMatch) {
    return { match: bestMatch, confidence: bestConfidence };
  }

  return null;
}

/**
 * Merge an incoming contact into an existing contact.
 * Fills in empty fields from the incoming contact without overwriting existing data.
 *
 * @param {Object} existing - The existing contact to update
 * @param {Object} incoming - The new contact data to merge from
 * @returns {Object} Merged contact
 */
export function mergeContact(existing, incoming) {
  return {
    ...existing,
    email: existing.email || incoming.email || "",
    phone: existing.phone || incoming.phone || "",
    contact: existing.contact || incoming.contact || "",
    // Don't overwrite company name — existing is canonical
  };
}

/**
 * Process a contact against a list — either merge into existing or return as new.
 *
 * @param {Object} contact - { company, contact, email, phone }
 * @param {Array} existingList - Array of existing contacts
 * @returns {{ action: 'merge'|'add', contact: Object, matchId?: string }}
 */
export function processContact(contact, existingList) {
  if (!contact?.company) return null;

  const dup = findDuplicateContact(contact, existingList);
  if (dup) {
    return {
      action: "merge",
      contact: mergeContact(dup.match, contact),
      matchId: dup.match.id,
    };
  }

  return {
    action: "add",
    contact,
  };
}
