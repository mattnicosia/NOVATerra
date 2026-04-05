/**
 * Persistence — Manual cloud recovery.
 * Extracted from usePersistence.js. Explicit recovery function callable from UI.
 * Bypasses all automatic logic and does a direct, scope-blind Supabase query.
 */

import { storage } from "@/utils/storage";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useUiStore } from "@/stores/uiStore";
import * as cloudSync from "@/utils/cloudSync";
import { migrateIndexEntry } from "@/utils/costHistoryMigration";
import { idbKey } from "@/utils/idbKey";
import { useAuthStore } from "@/stores/authStore";

// ─── MANUAL CLOUD RECOVERY ─────────────────────────────────────────
// Explicit recovery function callable from UI. Bypasses all automatic
// logic and does a direct, scope-blind Supabase query for the user's data.
// Returns { recovered: number } or throws on error.
export async function recoverFromCloud() {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { supabase: sbClient } = await import("@/utils/supabase");
  if (!sbClient) throw new Error("Supabase not configured");

  console.log("[recoverFromCloud] Starting manual recovery for user:", userId.slice(0, 8));

  // 1. Pull index — scope-blind (no org_id filter)
  let indexData = null;
  let discoveredOrgId = null;
  try {
    const { data, error } = await sbClient
      .from("user_data")
      .select("data, org_id")
      .eq("user_id", userId)
      .eq("key", "index");
    if (error) throw error;
    if (data && data.length > 0) {
      // Find the row with the most entries
      for (const row of data) {
        const d = row.data;
        const size = Array.isArray(d) ? d.length : 0;
        const bestSize = Array.isArray(indexData) ? indexData.length : 0;
        if (size > bestSize) {
          indexData = d;
          discoveredOrgId = row.org_id;
        }
      }
    }
    console.log(
      `[recoverFromCloud] Index query: ${data?.length || 0} rows, best has ${Array.isArray(indexData) ? indexData.length : 0} entries, org=${discoveredOrgId}`,
    );
  } catch (err) {
    console.error("[recoverFromCloud] Index query failed:", err);
    throw new Error(`Cloud query failed: ${err.message}`);
  }

  // 2. Pull all estimates — scope-blind
  let estimates = [];
  try {
    const { data, error } = await sbClient
      .from("user_estimates")
      .select("estimate_id, data, org_id")
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (error) throw error;
    estimates = data || [];
    console.log(`[recoverFromCloud] Estimates query: ${estimates.length} rows`);
  } catch (err) {
    console.error("[recoverFromCloud] Estimates query failed:", err);
  }

  // 3. Build recovered index — prefer cloud index, fallback to rebuilding from estimates
  let recoveredIndex = [];
  if (Array.isArray(indexData) && indexData.length > 0) {
    recoveredIndex = indexData.map(migrateIndexEntry);
  } else if (estimates.length > 0) {
    // Rebuild from individual estimate rows
    for (const ce of estimates) {
      const proj = ce.data?.project || {};
      recoveredIndex.push({
        id: ce.estimate_id,
        name: proj.name || "Recovered Estimate",
        client: proj.client || "",
        status: proj.status || "Active",
        bidDue: proj.bidDue || "",
        grandTotal: 0,
        elementCount: (ce.data?.items || []).length,
        lastModified: new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        estimator: proj.estimator || "",
        jobType: proj.jobType || "",
        companyProfileId: proj.companyProfileId || "",
        buildingType: proj.buildingType || "",
        workType: proj.workType || "",
      });
    }
  }

  if (recoveredIndex.length === 0 && estimates.length === 0) {
    console.warn("[recoverFromCloud] No data found in cloud");
    throw new Error("No data found in cloud. Your account may not have any saved estimates.");
  }

  // 4. Filter out deleted estimates
  let deletedIds = [];
  try {
    const lsRaw = localStorage.getItem(`bldg-deleted-ids-${userId}`);
    if (lsRaw) deletedIds = JSON.parse(lsRaw);
  } catch {
    /* ignore */
  }
  const deletedSet = new Set(deletedIds);
  recoveredIndex = recoveredIndex.filter(e => !deletedSet.has(e.id));

  // 5. Save recovered org ID
  if (discoveredOrgId) {
    try {
      localStorage.setItem("bldg-last-org-id", discoveredOrgId);
    } catch {
      /* localStorage unavailable */
    }
  }

  // 6. Save index to IDB and update store
  const activeKey = idbKey("bldg-index");
  console.log(`[recoverFromCloud] Saving ${recoveredIndex.length} estimates to IDB key "${activeKey}"`);
  await storage.set(activeKey, JSON.stringify(recoveredIndex));
  useEstimatesStore.getState().setEstimatesIndex(recoveredIndex);

  // Also try the org-scoped key directly if we discovered the org
  if (discoveredOrgId) {
    const orgKey = `org-${discoveredOrgId}-bldg-index`;
    if (orgKey !== activeKey) {
      console.log(`[recoverFromCloud] Also saving to org key "${orgKey}"`);
      await storage.set(orgKey, JSON.stringify(recoveredIndex));
    }
  }

  // Mirror to localStorage
  try {
    localStorage.setItem(`bldg-index-mirror-${userId}`, JSON.stringify(recoveredIndex));
  } catch {
    /* ignore */
  }

  // 7. Cache estimate data blobs locally
  let cachedCount = 0;
  for (const ce of estimates) {
    if (deletedSet.has(ce.estimate_id)) continue;
    try {
      let estData = ce.data;
      try {
        estData = await cloudSync.hydrateBlobs(ce.data);
      } catch {
        /* proceed without hydration */
      }
      await storage.set(idbKey(`bldg-est-${ce.estimate_id}`), JSON.stringify(estData));
      // Also save under org key if different
      if (discoveredOrgId) {
        const orgEstKey = `org-${discoveredOrgId}-bldg-est-${ce.estimate_id}`;
        const currentEstKey = idbKey(`bldg-est-${ce.estimate_id}`);
        if (orgEstKey !== currentEstKey) {
          await storage.set(orgEstKey, JSON.stringify(estData));
        }
      }
      cachedCount++;
    } catch (err) {
      console.warn(`[recoverFromCloud] Failed to cache estimate ${ce.estimate_id}:`, err);
    }
  }

  // 8. Pull master data
  try {
    const { data, error } = await sbClient.from("user_data").select("data").eq("user_id", userId).eq("key", "master");
    if (!error && data && data.length > 0) {
      const masterData = data[0].data;
      if (masterData && typeof masterData === "object") {
        useMasterDataStore.getState().setMasterData({
          ...useMasterDataStore.getState().masterData,
          ...masterData,
        });
        await storage.set(idbKey("bldg-master"), JSON.stringify(masterData));
      }
    }
  } catch {
    /* master data recovery is nice-to-have */
  }

  // 9. Switch to "All" profile so recovered estimates aren't hidden
  const uiState = useUiStore.getState();
  if (uiState.appSettings.activeCompanyId !== "__all__") {
    uiState.setAppSettings({ ...uiState.appSettings, activeCompanyId: "__all__" });
  }

  console.log(
    `[recoverFromCloud] DONE — recovered ${recoveredIndex.length} index entries, cached ${cachedCount} estimates`,
  );
  return { recovered: recoveredIndex.length };
}
