/**
 * Integration Test: Soft-Delete + Resurrection Guard
 *
 * Tests the critical data integrity path:
 * 1. Create estimate → save to IDB → confirm persisted
 * 2. Delete estimate → verify soft-delete (deleted_at, not hard delete)
 * 3. Simulate stale cloud sync → verify deleted estimate is NOT resurrected
 * 4. Verify deleted ID survives across IDB clear (localStorage backup)
 * 5. Verify in-memory zombie guard (_deletedIds Set) blocks store injection
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock: IndexedDB storage ─────────────────────────────────────────────
// In-memory KV store that mimics storage.js API
const _idb = new Map();
vi.mock("@/utils/storage", () => ({
  storage: {
    get: vi.fn(async key => {
      const val = _idb.get(key);
      return val !== undefined ? { value: val } : undefined;
    }),
    set: vi.fn(async (key, value) => {
      _idb.set(key, typeof value === "string" ? value : JSON.stringify(value));
      return true;
    }),
    delete: vi.fn(async key => {
      _idb.delete(key);
      return true;
    }),
    clearAll: vi.fn(async () => {
      _idb.clear();
      return true;
    }),
    keys: vi.fn(async () => [..._idb.keys()]),
  },
}));

// ── Mock: Cloud sync ────────────────────────────────────────────────────
const _cloudDeleteCalls = [];
vi.mock("@/utils/cloudSync", () => ({
  pushEstimate: vi.fn().mockResolvedValue(undefined),
  pushData: vi.fn().mockResolvedValue(undefined),
  deleteEstimate: vi.fn(async id => {
    _cloudDeleteCalls.push(id);
  }),
}));

// ── Mock: idbKey — pass through key unchanged (no auth dependency) ──────
vi.mock("@/utils/idbKey", () => ({
  idbKey: key => key,
}));

// ── Mock: seedTemplates ─────────────────────────────────────────────────
vi.mock("@/constants/seedTemplates", () => ({
  TEMPLATE_MAP: new Map(),
  resolveTemplateItems: () => [],
}));

vi.mock("@/utils/directives", () => ({
  autoDirective: () => "",
}));

vi.mock("@/constants/tradeGroupings", () => ({
  autoTradeFromCode: () => "",
  TRADE_GROUPINGS: [],
}));

// ── Mock: Zustand stores ────────────────────────────────────────────────

vi.mock("@/stores/uiStore", () => {
  const state = {
    appSettings: { defaultLaborType: "open_shop" },
    cloudSyncInProgress: false,
    setAiChatMessages: vi.fn(),
    showToast: vi.fn(),
  };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useUiStore: store };
});

vi.mock("@/stores/projectStore", () => {
  const state = { setProject: vi.fn(), setCodeSystem: vi.fn(), setCustomCodes: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useProjectStore: store };
});

vi.mock("@/stores/itemsStore", () => {
  const state = { setItems: vi.fn(), setMarkup: vi.fn(), setMarkupOrder: vi.fn(), setCustomMarkups: vi.fn(), setChangeOrders: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useItemsStore: store };
});

vi.mock("@/stores/drawingPipelineStore", () => {
  const state = { setDrawings: vi.fn(), setDrawingScales: vi.fn(), setDrawingDpi: vi.fn(), setTakeoffs: vi.fn(), setTkCalibrations: vi.fn(), clearScan: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useDrawingPipelineStore: store };
});

vi.mock("@/stores/bidManagementStore", () => {
  const state = { setSubBidSubs: vi.fn(), setBidTotals: vi.fn(), setBidCells: vi.fn(), setBidSelections: vi.fn(), setLinkedSubs: vi.fn(), setSubKeyLabels: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useBidManagementStore: store };
});

vi.mock("@/stores/documentManagementStore", () => {
  const state = { setSpecs: vi.fn(), setSpecPdf: vi.fn(), setExclusions: vi.fn(), setClarifications: vi.fn(), setDocuments: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useDocumentManagementStore: store };
});

vi.mock("@/stores/alternatesStore", () => {
  const state = { setAlternates: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useAlternatesStore: store };
});

vi.mock("@/stores/moduleStore", () => {
  const state = { setModuleInstances: vi.fn(), setActiveModule: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useModuleStore: store };
});

vi.mock("@/stores/masterDataStore", () => {
  const state = { getCompanyInfo: () => ({ boilerplateExclusions: [], boilerplateNotes: [] }) };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useMasterDataStore: store };
});

vi.mock("@/stores/authStore", () => {
  const state = { user: { id: "test-user-123" } };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useAuthStore: store };
});

vi.mock("@/stores/orgStore", () => {
  const state = { org: { id: "test-org-456" } };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useOrgStore: store };
});

// ── Import module under test ────────────────────────────────────────────

import { useEstimatesStore, markDeleted, hydrateDeletedIds } from "@/stores/estimatesStore";
import { storage } from "@/utils/storage";
import * as cloudSync from "@/utils/cloudSync";

const getState = () => useEstimatesStore.getState();
const setState = s => useEstimatesStore.setState(s);

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Persistence Integration: Soft-Delete + Resurrection Guard", () => {
  beforeEach(() => {
    _idb.clear();
    _cloudDeleteCalls.length = 0;
    localStorage.clear();
    setState({ estimatesIndex: [], activeEstimateId: null, draftId: null });
    vi.clearAllMocks();
  });

  // ── Scenario 1A: Full lifecycle — create → persist → verify IDB ──

  it("create estimate persists to IDB with correct key and data shape", async () => {
    const id = await getState().createEstimate("cp-1", "E-001", null);

    // Index entry exists in store
    expect(getState().estimatesIndex).toHaveLength(1);
    expect(getState().estimatesIndex[0].id).toBe(id);

    // Index persisted to IDB
    const indexRaw = _idb.get("bldg-index");
    expect(indexRaw).toBeTruthy();
    const indexData = JSON.parse(indexRaw);
    expect(indexData).toHaveLength(1);
    expect(indexData[0].id).toBe(id);

    // Estimate data blob persisted to IDB
    const blobRaw = _idb.get(`bldg-est-${id}`);
    expect(blobRaw).toBeTruthy();
    const blobData = JSON.parse(blobRaw);
    expect(blobData.project).toBeDefined();
    expect(blobData.project.name).toBe("New Estimate");
  });

  // ── Scenario 1B: Delete uses soft-delete, not hard delete ──

  it("delete estimate removes from index but records deleted ID in IDB + localStorage", async () => {
    const id = await getState().createEstimate("cp-1", "E-002", null);
    vi.clearAllMocks();

    await getState().deleteEstimate(id);

    // Removed from Zustand index
    expect(getState().estimatesIndex).toHaveLength(0);

    // Estimate data blob removed from IDB
    expect(_idb.has(`bldg-est-${id}`)).toBe(false);

    // Deleted ID persisted to IDB
    const deletedRaw = _idb.get("bldg-deleted-ids");
    expect(deletedRaw).toBeTruthy();
    const deletedIds = JSON.parse(deletedRaw);
    expect(deletedIds).toContain(id);

    // Deleted ID backed up to localStorage
    const lsRaw = localStorage.getItem("bldg-deleted-ids-test-user-123");
    expect(lsRaw).toBeTruthy();
    const lsIds = JSON.parse(lsRaw);
    expect(lsIds).toContain(id);

    // Cloud sync called with soft-delete
    expect(_cloudDeleteCalls).toContain(id);
  });

  // ── Scenario 1C: Zombie guard blocks resurrection via setState ──

  it("markDeleted prevents resurrection via direct store injection", () => {
    markDeleted("zombie-est-1");

    // Attempt to inject the deleted estimate back into the store
    setState({
      estimatesIndex: [
        { id: "zombie-est-1", name: "I should be dead" },
        { id: "safe-est-1", name: "I should survive" },
      ],
    });

    const ids = getState().estimatesIndex.map(e => e.id);
    expect(ids).not.toContain("zombie-est-1");
    expect(ids).toContain("safe-est-1");
  });

  // ── Scenario 1D: hydrateDeletedIds blocks multiple zombies ──

  it("hydrateDeletedIds blocks batch resurrection attempts", () => {
    hydrateDeletedIds(["zombie-a", "zombie-b", "zombie-c"]);

    setState({
      estimatesIndex: [
        { id: "zombie-a", name: "Dead A" },
        { id: "zombie-b", name: "Dead B" },
        { id: "zombie-c", name: "Dead C" },
        { id: "alive-1", name: "Alive" },
      ],
    });

    const ids = getState().estimatesIndex.map(e => e.id);
    expect(ids).toEqual(["alive-1"]);
  });

  // ── Scenario 1E: Full delete → simulated cloud pull → no resurrection ──

  it("deleted estimate is not resurrected when cloud data is re-injected", async () => {
    // Step 1: Create and delete
    const id = await getState().createEstimate("cp-1", "E-003", null);
    await getState().deleteEstimate(id);

    // Step 2: Verify store is empty
    expect(getState().estimatesIndex).toHaveLength(0);

    // Step 3: Simulate a stale cloud sync that tries to add the deleted estimate
    // back (this is what Phase 5 merge would do)
    setState({
      estimatesIndex: [
        { id, name: "Ghost from cloud" },
        { id: "new-est", name: "Legit new estimate" },
      ],
    });

    // The zombie guard should strip the deleted ID
    const ids = getState().estimatesIndex.map(e => e.id);
    expect(ids).not.toContain(id);
    expect(ids).toContain("new-est");
  });

  // ── Scenario 1F: Deleted IDs survive IDB eviction (localStorage fallback) ──

  it("deleted IDs survive IDB clear via localStorage backup", async () => {
    // Step 1: Create and delete
    const id = await getState().createEstimate("cp-1", "E-004", null);
    await getState().deleteEstimate(id);

    // Step 2: Verify localStorage has the deleted ID
    const lsRaw = localStorage.getItem("bldg-deleted-ids-test-user-123");
    const lsIds = JSON.parse(lsRaw);
    expect(lsIds).toContain(id);

    // Step 3: Simulate IDB eviction (clear all IDB data)
    _idb.clear();

    // Step 4: The deleted ID should still be retrievable from localStorage
    // (This is what readDeletedIds() does — merges IDB + localStorage)
    const afterClear = localStorage.getItem("bldg-deleted-ids-test-user-123");
    expect(afterClear).toBeTruthy();
    expect(JSON.parse(afterClear)).toContain(id);
  });

  // ── Scenario 1G: Multiple deletes accumulate correctly ──

  it("multiple deletes accumulate in the deleted IDs list without duplicates", async () => {
    const id1 = await getState().createEstimate("cp-1", "E-010", null);
    const id2 = await getState().createEstimate("cp-1", "E-011", null);
    const id3 = await getState().createEstimate("cp-1", "E-012", null);

    await getState().deleteEstimate(id1);
    await getState().deleteEstimate(id2);

    // Only id3 should remain in the index
    expect(getState().estimatesIndex).toHaveLength(1);
    expect(getState().estimatesIndex[0].id).toBe(id3);

    // Deleted IDs list should contain both
    const deletedRaw = _idb.get("bldg-deleted-ids");
    const deletedIds = JSON.parse(deletedRaw);
    expect(deletedIds).toContain(id1);
    expect(deletedIds).toContain(id2);
    expect(deletedIds).not.toContain(id3);

    // No duplicates
    expect(new Set(deletedIds).size).toBe(deletedIds.length);
  });

  // ── Scenario 1H: Delete non-active estimate preserves active ──

  it("deleting a non-active estimate preserves the active estimate", async () => {
    const id1 = await getState().createEstimate("cp-1", "E-020", null);
    const id2 = await getState().createEstimate("cp-1", "E-021", null);

    // id2 is active (last created)
    expect(getState().activeEstimateId).toBe(id2);

    await getState().deleteEstimate(id1);

    // Active should still be id2
    expect(getState().activeEstimateId).toBe(id2);
    expect(getState().estimatesIndex).toHaveLength(1);
    expect(getState().estimatesIndex[0].id).toBe(id2);
  });

  // ── Scenario 1I: UUID collision resistance ──

  it("generates collision-free UUIDs across 1000 estimates", async () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      const id = await getState().createEstimate("", `E-${i}`, null);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });
});
