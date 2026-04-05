/**
 * Persistence — Cleanup, reset, PDF storage, upload queue.
 * Extracted from usePersistence.js. Isolated operations.
 */

import { storage } from "@/utils/storage";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useAlternatesStore } from "@/stores/alternatesStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { useModuleStore } from "@/stores/moduleStore";
import { useUiStore } from "@/stores/uiStore";
import { useDiscoveryStore } from "@/stores/discoveryStore";
import { useGroupsStore, DEFAULT_GROUPS } from "@/stores/groupsStore";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import { useInboxStore } from "@/stores/inboxStore";
import { useNovaStore } from "@/stores/novaStore";
import { useActivityTimerStore } from "@/stores/activityTimerStore";
import { useCorrectionStore } from "@/nova/learning/correctionStore";
import { useFirmMemoryStore } from "@/nova/learning/firmMemory";
import { useSnapshotsStore } from "@/stores/snapshotsStore";
import { useUndoStore } from "@/stores/undoStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { idbKey } from "@/utils/idbKey";

/** Reset all Zustand stores to defaults. Called on sign-out. */
export function resetAllStores() {
  useEstimatesStore.getState().setEstimatesIndex([]);
  useEstimatesStore.setState({ activeEstimateId: null, draftId: null });
  useMasterDataStore.getState().setMasterData({
    clients: [],
    architects: [],
    engineers: [],
    estimators: [],
    subcontractors: [],
    historicalProposals: [],
    companyProfiles: [],
    jobTypes: useMasterDataStore.getState().masterData.jobTypes,
    bidDeliveryTypes: useMasterDataStore.getState().masterData.bidDeliveryTypes,
    bidTypes: useMasterDataStore.getState().masterData.bidTypes,
    companyInfo: {
      name: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      email: "",
      website: "",
      licenseNo: "",
      logo: null,
      brandColors: [],
      palettes: [],
      boilerplateExclusions: [],
      boilerplateNotes: [],
    },
  });
  useMasterDataStore.setState({ pdfUploadQueue: [] });
  useCalendarStore.getState().setTasks([]);
  useDatabaseStore.getState().setAssemblies([]);
  useDatabaseStore.getState().resetToMaster();
  useUiStore.getState().setPersistenceLoaded(false);
  useUiStore.setState({ aiChatMessages: [], aiChatInput: "" });

  useProjectStore.setState({ project: { name: "New Estimate" } });
  useItemsStore.setState({ items: [], customMarkups: [], changeOrders: [], projectAssemblies: [] });
  useDrawingPipelineStore.setState({
    takeoffs: [],
    tkCalibrations: {},
    tkPredictions: null,
    tkPredAccepted: [],
    tkPredRejected: [],
    tkPredContext: null,
    tkPredRefining: false,
    tkNovaPanelOpen: false,
  });
  useDrawingPipelineStore.setState({ drawings: [], drawingScales: {}, drawingDpi: {} });
  useBidManagementStore.setState({
    subBidSubs: {},
    bidTotals: {},
    bidCells: {},
    bidSelections: {},
    linkedSubs: [],
    subKeyLabels: {},
  });
  useAlternatesStore.setState({ alternates: [] });
  useDocumentManagementStore.setState({ specs: [], specPdf: null, exclusions: [], clarifications: [] });
  useCollaborationStore.setState({ correspondences: [] });
  useDocumentManagementStore.setState({ documents: [], tagPalette: [], transmittals: [] });
  useCorrectionStore.setState({ corrections: [], globalPatterns: [] });
  useFirmMemoryStore.setState({ firms: {} });
  useModuleStore.setState({ moduleInstances: {}, activeModule: null });
  useDrawingPipelineStore.getState().clearScan?.();
  useDiscoveryStore.getState().reset();
  useBidManagementStore.setState({ bidPackages: [], invitations: {}, proposals: {}, scopeGapResults: {} });
  useGroupsStore.setState({ groups: [...DEFAULT_GROUPS] });
  useSubdivisionStore.getState().clearSubdivisionData?.();
  useDrawingPipelineStore.getState().reset();

  useCollaborationStore.getState().cleanup?.();
  useCollaborationStore.setState({ currentLock: null, isLockHolder: false, lockError: null, presenceUsers: [] });
  useInboxStore.setState({ rfps: [], unreadCount: 0 });
  useNovaStore.setState({ notifications: [], history: [], activity: null, alert: null });
  useActivityTimerStore.setState({ currentSession: null, isRunning: false });
  useActivityTimerStore._pendingSessions = [];
  useSnapshotsStore.setState({ snapshots: [] });
  useUndoStore.setState({ past: [], future: [] });

  localStorage.removeItem("blob_migration_v2");
  localStorage.removeItem("nova_cmd_recents");
  localStorage.removeItem("READ_IDS_KEY");
  localStorage.removeItem("intelligence_cache");
}

// ── PDF upload queue ──

export async function saveUploadQueue() {
  const queue = useMasterDataStore.getState().pdfUploadQueue;
  const slim = queue
    .filter(q => q.status !== "saved")
    .map(q => {
      if (q.status === "extracted") return q;
      const { extractedData: _extractedData, ...rest } = q;
      return rest;
    });
  await storage.set(idbKey("bldg-upload-queue"), JSON.stringify(slim));
}

export async function loadUploadQueue() {
  const raw = await storage.get(idbKey("bldg-upload-queue"));
  if (raw?.value) {
    try {
      const queue = JSON.parse(raw.value);
      const fixed = queue.map(q => (q.status === "extracting" ? { ...q, status: "queued" } : q));
      useMasterDataStore.setState({ pdfUploadQueue: fixed });
    } catch {
      console.warn("[usePersistence] Failed to parse upload queue");
    }
  }
}

// ── Per-item PDF base64 persistence ──

const PDF_BASE64_PREFIX = "bldg-pdf-b64-";

export async function savePdfBase64(queueId, base64) {
  if (!queueId || !base64) return;
  await storage.set(idbKey(PDF_BASE64_PREFIX + queueId), base64);
}

export async function loadPdfBase64(queueId) {
  if (!queueId) return null;
  const raw = await storage.get(idbKey(PDF_BASE64_PREFIX + queueId));
  return raw?.value || null;
}

export async function deletePdfBase64(queueId) {
  if (!queueId) return;
  await storage.delete(idbKey(PDF_BASE64_PREFIX + queueId));
}

export async function deletePdfBase64Batch(queueIds) {
  await Promise.all(queueIds.map(id => deletePdfBase64(id)));
}

// ── Dirty-flag system for failed cloud pushes ──

const DIRTY_KEY = "bldg-dirty-estimates";

export function markDirtyEstimate(estimateId) {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    if (!ids.includes(estimateId)) {
      ids.push(estimateId);
      localStorage.setItem(DIRTY_KEY, JSON.stringify(ids));
    }
  } catch {
    /* ignore */
  }
}

export function clearDirtyEstimate(estimateId) {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    if (!raw) return;
    const ids = JSON.parse(raw).filter(id => id !== estimateId);
    localStorage.setItem(DIRTY_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function getDirtyEstimates() {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearAllDirtyEstimates() {
  try {
    localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* ignore */
  }
}
