import { useAuthStore } from "@/stores/authStore";
import { useOrgStore } from "@/stores/orgStore";

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const DRAFT_VERSION = 1;
let _draftMirrorSuppressionDepth = 0;

function getDraftKey(estimateId) {
  const userId = useAuthStore.getState().user?.id || "anon";
  const orgId = useOrgStore.getState().org?.id || "solo";
  return `bldg-est-items-draft-${userId}-${orgId}-${estimateId}`;
}

function safeRemove(key) {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    /* localStorage unavailable */
  }
}

export function readPendingEstimateItemsDraft(estimateId) {
  if (!estimateId || typeof localStorage === "undefined") return null;
  const key = getDraftKey(estimateId);

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      parsed.version !== DRAFT_VERSION ||
      parsed.estimateId !== estimateId ||
      !Array.isArray(parsed.items) ||
      typeof parsed.capturedAtMs !== "number"
    ) {
      safeRemove(key);
      return null;
    }

    if ((Date.now() - parsed.capturedAtMs) > DRAFT_TTL_MS) {
      safeRemove(key);
      return null;
    }

    return parsed;
  } catch {
    safeRemove(key);
    return null;
  }
}

export function persistPendingEstimateItemsDraft(estimateId, items) {
  if (!estimateId || typeof localStorage === "undefined" || !Array.isArray(items)) return null;

  const key = getDraftKey(estimateId);
  const snapshot = {
    version: DRAFT_VERSION,
    estimateId,
    capturedAtMs: Date.now(),
    items,
  };

  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
    return snapshot;
  } catch (err) {
    console.warn(`[estimateLocalDraft] Failed to persist items draft for ${estimateId}:`, err?.message || err);
    return null;
  }
}

export function clearPendingEstimateItemsDraft(estimateId, upToCapturedAtMs = Number.POSITIVE_INFINITY) {
  if (!estimateId || typeof localStorage === "undefined") return;

  const current = readPendingEstimateItemsDraft(estimateId);
  if (!current) return;
  if (current.capturedAtMs <= upToCapturedAtMs) {
    safeRemove(getDraftKey(estimateId));
  }
}

export function runWithItemsDraftMirrorSuppressed(fn) {
  _draftMirrorSuppressionDepth += 1;
  try {
    return fn();
  } finally {
    _draftMirrorSuppressionDepth = Math.max(0, _draftMirrorSuppressionDepth - 1);
  }
}

export function isItemsDraftMirrorSuppressed() {
  return _draftMirrorSuppressionDepth > 0;
}

export function hasPendingEstimateItemsNewerThan(estimateId, savedAt) {
  const draft = readPendingEstimateItemsDraft(estimateId);
  if (!draft) return false;

  const savedAtMs = savedAt ? (Date.parse(savedAt) || 0) : 0;
  return draft.capturedAtMs > savedAtMs;
}

export function applyPendingEstimateItemsDraft(estimateId, data) {
  const draft = readPendingEstimateItemsDraft(estimateId);
  if (!draft) return { data, recovered: false, capturedAtMs: 0 };

  const savedAtMs = data?._savedAt ? (Date.parse(data._savedAt) || 0) : 0;
  if (draft.capturedAtMs <= savedAtMs) {
    return { data, recovered: false, capturedAtMs: draft.capturedAtMs };
  }

  return {
    data: {
      ...(data || {}),
      items: draft.items,
    },
    recovered: true,
    capturedAtMs: draft.capturedAtMs,
  };
}
