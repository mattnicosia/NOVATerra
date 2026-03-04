import { useOrgStore } from "@/stores/orgStore";
import { useAuthStore } from "@/stores/authStore";

// Key prefix for user+org scoped data in IndexedDB.
// Solo mode: 'u-{userId}-{key}'. Org mode: 'org-{orgId}-{key}'.
// Settings are always unprefixed (user-level, shared across modes).
// This ensures different users on the same browser have isolated IndexedDB data.
export function idbKey(key) {
  const org = useOrgStore.getState().org;
  if (key === "bldg-settings") return key;
  if (org?.id) return `org-${org.id}-${key}`;

  // Solo mode: namespace by user_id to prevent cross-user data leakage
  const userId = useAuthStore.getState().user?.id;
  return userId ? `u-${userId}-${key}` : key;
}
