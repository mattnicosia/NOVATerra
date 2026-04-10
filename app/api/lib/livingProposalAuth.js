import crypto from "crypto";

const HASH_PREFIX = "scrypt";
const KEY_LENGTH = 64;

export function hashProposalPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64");
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString("base64");
  return `${HASH_PREFIX}:${salt}:${hash}`;
}

export function verifyProposalPassword(password, storedHash) {
  if (!storedHash) return true;
  if (typeof password !== "string" || password.length === 0) return false;

  if (storedHash.startsWith(`${HASH_PREFIX}:`)) {
    const [, salt, expectedHash] = storedHash.split(":");
    if (!salt || !expectedHash) return false;
    const actual = crypto.scryptSync(password, salt, KEY_LENGTH);
    const expected = Buffer.from(expectedHash, "base64");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  const legacyHash = crypto.createHash("sha256").update(password).digest("base64");
  const expected = Buffer.from(String(storedHash));
  const actual = Buffer.from(legacyHash);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function isLegacyProposalPasswordHash(storedHash) {
  return Boolean(storedHash) && !String(storedHash).startsWith(`${HASH_PREFIX}:`);
}

export async function upgradeLegacyProposalPasswordHash({
  supabase,
  proposalId,
  storedHash,
  password,
  logLabel = "living-proposal",
}) {
  if (!supabase || !proposalId || !isLegacyProposalPasswordHash(storedHash)) return false;
  if (typeof password !== "string" || password.length === 0) return false;

  const { data, error } = await supabase
    .from("living_proposals")
    .update({ password_hash: hashProposalPassword(password) })
    .eq("id", proposalId)
    .eq("password_hash", storedHash)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn(`[${logLabel}] Legacy password upgrade failed for proposal ${proposalId}:`, error.message);
    return false;
  }

  if (data?.id) {
    console.info(`[${logLabel}] Upgraded deprecated SHA-256 password hash for proposal ${proposalId}`);
    return true;
  }

  return false;
}

export function readProposalPassword(req) {
  const value = req.headers["x-proposal-password"];
  return typeof value === "string" ? value : "";
}
