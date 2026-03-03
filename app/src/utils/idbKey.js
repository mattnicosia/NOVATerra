import { useOrgStore } from '@/stores/orgStore';

// Key prefix for org-scoped data in IndexedDB.
// Solo mode: '' (no prefix). Org mode: 'org-{orgId}-'.
// Settings are always unprefixed (user-level).
export function idbKey(key) {
  const org = useOrgStore.getState().org;
  if (key === 'bldg-settings') return key;
  return org?.id ? `org-${org.id}-${key}` : key;
}
