/**
 * Persistence — Global data save functions.
 * Extracted from usePersistence.js. Each follows: read store -> IDB write -> cloud push.
 */

import { storage } from "@/utils/storage";
import { useUiStore } from "@/stores/uiStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { useTaskStore } from "@/stores/taskStore";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import { useAutoResponseStore } from "@/stores/autoResponseStore";
import * as cloudSync from "@/utils/cloudSync";
import { idbKey } from "@/utils/idbKey";

// Save master data (company profiles, clients, proposals, etc.)
export async function saveMasterData() {
  const master = useMasterDataStore.getState().masterData;

  const hasContent =
    master.companyProfiles?.length > 0 ||
    master.companyInfo?.name ||
    master.clients?.length > 0 ||
    master.subcontractors?.length > 0 ||
    master.historicalProposals?.length > 0;

  const ok = await storage.set(idbKey("bldg-master"), JSON.stringify(master));
  if (!ok) {
    useUiStore.getState().showToast("Failed to save company data", "error");
  }

  if (!hasContent) {
    console.warn("[saveMasterData] Skipping cloud push — master data appears empty/reset");
    return;
  }
  await cloudSync.pushData("master", master).catch(err => {
    console.warn("[usePersistence] Cloud push failed for master:", err?.message);
  });
}

// Save app settings
export async function saveSettings() {
  const settings = useUiStore.getState().appSettings;
  const ok = await storage.set(idbKey("bldg-settings"), JSON.stringify(settings));
  if (!ok) {
    console.error("[usePersistence] Failed to save settings");
  }

  if (!useUiStore.getState().cloudSettingsLoaded) return;

  cloudSync.pushData("settings", settings).catch(err => {
    console.warn("[usePersistence] Cloud push failed for settings:", err?.message);
  });
}

// Save assemblies (global library)
export async function saveAssemblies() {
  const assemblies = useDatabaseStore.getState().assemblies;
  const ok = await storage.set(idbKey("bldg-assemblies"), JSON.stringify(assemblies));
  if (!ok) {
    console.error("[usePersistence] Failed to save assemblies");
  }

  cloudSync.pushData("assemblies", assemblies).catch(err => {
    console.warn("[usePersistence] Cloud push failed for assemblies:", err?.message);
  });
}

// Save user cost library (global, independent of estimates)
export async function saveUserLibrary() {
  const lib = useDatabaseStore.getState().getUserElements();
  const ok = await storage.set(idbKey("bldg-user-elements"), JSON.stringify(lib));
  if (!ok) {
    console.error("[usePersistence] Failed to save user cost library");
  }

  cloudSync.pushData("user-elements", lib).catch(err => {
    console.warn("[usePersistence] Cloud push failed for cost library:", err?.message);
  });
}

// Save calendar tasks
export async function saveCalendar() {
  const tasks = useCalendarStore.getState().tasks;
  const ok = await storage.set(idbKey("bldg-calendar"), JSON.stringify(tasks));
  if (!ok) {
    console.error("[usePersistence] Failed to save calendar");
  }

  cloudSync.pushData("calendar", tasks).catch(err => {
    console.warn("[usePersistence] Cloud push failed for calendar:", err?.message);
  });
}

// Save tasks
export async function saveTasks() {
  const tasks = useTaskStore.getState().tasks;
  const ok = await storage.set(idbKey("bldg-tasks"), JSON.stringify(tasks));
  if (!ok) {
    console.error("[usePersistence] Failed to save tasks");
  }

  cloudSync.pushData("tasks", tasks).catch(err => {
    console.warn("[usePersistence] Cloud push failed for tasks:", err?.message);
  });
}

// Save bid package presets
export async function saveBidPackagePresets() {
  const presets = useBidPackagesStore.getState().bidPackagePresets;
  const ok = await storage.set(idbKey("bldg-bid-package-presets"), JSON.stringify(presets));
  if (!ok) {
    console.error("[usePersistence] Failed to save bid package presets");
  }
}

// Save subdivision engine config (global — persists across estimates)
export async function saveSubdivisionConfig() {
  const { engineConfig, calibrationFactors } = useSubdivisionStore.getState();
  const data = { engineConfig, calibrationFactors };
  const ok = await storage.set(idbKey("bldg-subdivision-config"), JSON.stringify(data));
  if (!ok) {
    console.error("[usePersistence] Failed to save subdivision config");
  }
  cloudSync.pushData("subdivisionConfig", data).catch(() => {});
}

// Save auto-response trigger config
export async function saveAutoResponseConfig() {
  const config = useAutoResponseStore.getState().triggerConfig;
  const ok = await storage.set(idbKey("bldg-auto-response-config"), JSON.stringify(config));
  if (!ok) {
    console.error("[usePersistence] Failed to save auto-response config");
  }
}

// Save auto-response drafts queue
export async function saveAutoResponseDrafts() {
  const drafts = useAutoResponseStore.getState().drafts;
  const keep = drafts.filter(d => d.status !== "dismissed");
  const ok = await storage.set(idbKey("bldg-auto-response-drafts"), JSON.stringify(keep));
  if (!ok) {
    console.error("[usePersistence] Failed to save auto-response drafts");
  }
}
