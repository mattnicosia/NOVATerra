import { useOrgStore } from "@/stores/orgStore";
import { useAuthStore } from "@/stores/authStore";

// Key prefix for user+org scoped data in IndexedDB.
// Solo mode: 'u-{userId}-{key}'. Org mode: 'org-{orgId}-{key}'.
// Settings are always unprefixed (user-level, shared across modes).
// This ensures different users on the same browser have isolated IndexedDB data.

let _lastNs = null; // track last namespace for diagnostic logging

export function idbKey(key) {
  const org = useOrgStore.getState().org;
  if (key === "bldg-settings") return key;
  if (org?.id) {
    const ns = `org-${org.id}`;
    if (key === "bldg-index" && _lastNs !== ns) {
      console.log(`[idbKey] Namespace → "${ns}" (org mode)`);
      _lastNs = ns;
    }
    return `${ns}-${key}`;
  }

  // Solo mode: namespace by user_id to prevent cross-user data leakage
  const userId = useAuthStore.getState().user?.id;
  if (userId) {
    const ns = `u-${userId}`;
    if (key === "bldg-index" && _lastNs !== ns) {
      console.log(`[idbKey] Namespace → "${ns}" (solo mode)`);
      _lastNs = ns;
    }
    return `${ns}-${key}`;
  }

  if (key === "bldg-index" && _lastNs !== "bare") {
    console.warn(`[idbKey] Namespace → BARE (no auth, no org!) — data may land in wrong bucket`);
    _lastNs = "bare";
  }
  return key;
}
