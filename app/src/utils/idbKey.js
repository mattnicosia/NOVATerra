import { useOrgStore } from "@/stores/orgStore";
import { useAuthStore } from "@/stores/authStore";

// Key prefix for user+org scoped data in IndexedDB.
// Solo mode: 'u-{userId}-{key}'. Org mode: 'org-{orgId}-{key}'.
// Settings are user-scoped (same as solo mode) so different users on the
// same browser get isolated preferences, but org vs solo doesn't split them.
// This ensures different users on the same browser have isolated IndexedDB data.

let _lastNs = null; // track last namespace for diagnostic logging

export function idbKey(key) {
  const org = useOrgStore.getState().org;
  const userId = useAuthStore.getState().user?.id;

  // Settings are always user-scoped (not org-scoped) so they persist across org switches
  if (key === "bldg-settings") {
    return userId ? `u-${userId}-${key}` : key;
  }

  if (org?.id) {
    const ns = `org-${org.id}`;
    if (key === "bldg-index" && _lastNs !== ns) {
      console.log(`[idbKey] Namespace → "${ns}" (org mode)`);
      _lastNs = ns;
    }
    return `${ns}-${key}`;
  }

  // Solo mode: namespace by user_id to prevent cross-user data leakage
  if (userId) {
    const ns = `u-${userId}`;
    if (key === "bldg-index" && _lastNs !== ns) {
      console.log(`[idbKey] Namespace → "${ns}" (solo mode)`);
      _lastNs = ns;
    }
    return `${ns}-${key}`;
  }

  // Auth not ready — refuse to return a bare key for data operations
  // to prevent cross-user data leakage. Only allow non-critical sentinel keys.
  if (key === "bldg-last-user") return key; // global sentinel, intentionally unscoped
  console.warn(`[idbKey] Namespace → BARE (no auth, no org!) — returning prefixed key to prevent leakage`);
  return `_pending-auth-${key}`;
}
