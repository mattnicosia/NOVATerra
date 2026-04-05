/**
 * Cloud Sync — Auth & scope helpers.
 * Extracted from cloudSync.js. Pure utility functions.
 */

import { supabase } from "./supabase";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useOrgStore } from "@/stores/orgStore";

export const getUserId = () => useAuthStore.getState().user?.id;

/** Returns { org_id } for org mode or null for solo mode. */
export const getScope = () => {
  const org = useOrgStore.getState().org;
  return org ? { org_id: org.id } : null;
};

/** Apply org scope to a Supabase query — noop in solo mode. */
export const applyScope = (query, scope) => {
  if (scope) return query.eq("org_id", scope.org_id);
  return query.is("org_id", null);
};

export const isReady = () => {
  if (!supabase) return false;
  if (!getUserId()) return false;
  return true;
};

export const markSynced = () => {
  useUiStore.getState().setCloudSyncStatus("synced");
  useUiStore
    .getState()
    .setCloudSyncLastAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
  useUiStore.setState({ cloudSyncLastFullAt: new Date().toISOString() });
};

export const markError = msg => {
  useUiStore.getState().setCloudSyncStatus("error");
  useUiStore.getState().setCloudSyncError(msg || "Connection failed");
};

export const markSyncing = () => {
  useUiStore.getState().setCloudSyncStatus("syncing");
};
