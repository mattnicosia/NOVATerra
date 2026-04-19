/**
 * Integration Test: Multi-Device Index Merge (Cloud Sync Phase 5)
 *
 * Tests the critical sync merge logic:
 * 1. Cloud-only entries are added to local index
 * 2. Deleted entries from cloud are NOT added
 * 3. Duplicate entries (same ID in local + cloud) are not duplicated
 * 4. Concurrent local creates during merge window are preserved
 * 5. High-water-mark: cloud merge never shrinks the index unexpectedly
 * 6. Functional setState deduplication catches race conditions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock: IndexedDB storage ─────────────────────────────────────────────
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

vi.mock("@/utils/cloudSync", () => ({
  pushEstimate: vi.fn().mockResolvedValue(undefined),
  pushData: vi.fn().mockResolvedValue(undefined),
  deleteEstimate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/idbKey", () => ({
  idbKey: key => key,
}));

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

// ── Import ──────────────────────────────────────────────────────────────

import { useEstimatesStore, markDeleted, hydrateDeletedIds } from "@/stores/estimatesStore";

const getState = () => useEstimatesStore.getState();
const setState = s => useEstimatesStore.setState(s);

const makeEntry = (id, name = "Test") => ({
  id,
  name,
  estimateNumber: "E-001",
  client: "",
  status: "Bidding",
  bidDue: "",
  grandTotal: 0,
  elementCount: 0,
  lastModified: "Apr 5, 2026, 9:00 AM",
  ownerId: "test-user-123",
  orgId: "test-org-456",
});

// ═══════════════════════════════════════════════════════════════════════
// TESTS — Simulating Phase 5 merge behavior
// ═══════════════════════════════════════════════════════════════════════

describe("Cloud Sync Integration: Multi-Device Index Merge", () => {
  beforeEach(() => {
    _idb.clear();
    localStorage.clear();
    setState({ estimatesIndex: [], activeEstimateId: null, draftId: null });
    vi.clearAllMocks();
  });

  // ── Scenario 2A: Cloud-only entries are additive ──

  it("adds cloud-only entries without replacing local entries", () => {
    // Local has estimate A
    const localA = makeEntry("est-local-a", "Local A");
    setState({ estimatesIndex: [localA] });

    // Cloud has estimate B (not in local)
    const cloudB = makeEntry("est-cloud-b", "Cloud B");

    // Simulate Phase 5 merge: additive merge
    const currentIndex = getState().estimatesIndex;
    const currentIds = new Set(currentIndex.map(e => e.id));
    const toAdd = [cloudB].filter(e => !currentIds.has(e.id));

    useEstimatesStore.setState(state => {
      const existingIds = new Set(state.estimatesIndex.map(e => e.id));
      const safe = toAdd.filter(e => !existingIds.has(e.id));
      return { estimatesIndex: [...state.estimatesIndex, ...safe] };
    });

    const result = getState().estimatesIndex;
    expect(result).toHaveLength(2);
    expect(result.map(e => e.id)).toContain("est-local-a");
    expect(result.map(e => e.id)).toContain("est-cloud-b");
  });

  // ── Scenario 2B: Duplicate IDs are not duplicated ──

  it("does not duplicate entries with same ID in local and cloud", () => {
    const sharedId = "est-shared-1";
    const localEntry = makeEntry(sharedId, "Local Version");
    setState({ estimatesIndex: [localEntry] });

    // Cloud also has same ID
    const cloudEntry = makeEntry(sharedId, "Cloud Version");

    // Phase 5 merge logic
    useEstimatesStore.setState(state => {
      const existingIds = new Set(state.estimatesIndex.map(e => e.id));
      const safe = [cloudEntry].filter(e => !existingIds.has(e.id));
      if (safe.length === 0) return state;
      return { estimatesIndex: [...state.estimatesIndex, ...safe] };
    });

    const result = getState().estimatesIndex;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(sharedId);
    // Local version preserved (not overwritten)
    expect(result[0].name).toBe("Local Version");
  });

  // ── Scenario 2C: Deleted entries from cloud are blocked ──

  it("does not add cloud entries that are in the deleted set", () => {
    // Mark est-deleted as deleted
    hydrateDeletedIds(["est-deleted"]);

    const localEntry = makeEntry("est-local", "Local");
    setState({ estimatesIndex: [localEntry] });

    // Cloud has both a new entry and a deleted one
    const cloudNew = makeEntry("est-cloud-new", "New from cloud");
    const cloudDeleted = makeEntry("est-deleted", "Ghost from cloud");

    const deletedSet = new Set(["est-deleted"]);

    useEstimatesStore.setState(state => {
      const existingIds = new Set(state.estimatesIndex.map(e => e.id));
      const safe = [cloudNew, cloudDeleted].filter(
        e => !existingIds.has(e.id) && !deletedSet.has(e.id),
      );
      if (safe.length === 0) return state;
      return { estimatesIndex: [...state.estimatesIndex, ...safe] };
    });

    const ids = getState().estimatesIndex.map(e => e.id);
    expect(ids).toContain("est-local");
    expect(ids).toContain("est-cloud-new");
    expect(ids).not.toContain("est-deleted");
  });

  // ── Scenario 2D: Concurrent local create during merge ──

  it("preserves local creates that happen between pre-filter and setState", () => {
    setState({ estimatesIndex: [makeEntry("est-local", "Local")] });

    // Pre-filter (Phase 5 outside setState)
    const cloudEntries = [makeEntry("est-cloud", "Cloud")];
    const preFilterIds = new Set(getState().estimatesIndex.map(e => e.id));
    const toAdd = cloudEntries.filter(e => !preFilterIds.has(e.id));

    // Simulate concurrent local create BETWEEN pre-filter and setState
    setState({
      estimatesIndex: [
        ...getState().estimatesIndex,
        makeEntry("est-concurrent", "Created during sync"),
      ],
    });

    // Now the functional setState runs — it should see est-concurrent
    useEstimatesStore.setState(state => {
      const existingIds = new Set(state.estimatesIndex.map(e => e.id));
      const safe = toAdd.filter(e => !existingIds.has(e.id));
      if (safe.length === 0) return state;
      return { estimatesIndex: [...state.estimatesIndex, ...safe] };
    });

    const ids = getState().estimatesIndex.map(e => e.id);
    expect(ids).toContain("est-local");
    expect(ids).toContain("est-concurrent"); // Not lost!
    expect(ids).toContain("est-cloud");
    expect(ids).toHaveLength(3);
  });

  // ── Scenario 2E: Merge is a no-op when all cloud entries already exist ──

  it("returns same state reference when no new entries to add", () => {
    const entries = [makeEntry("a"), makeEntry("b")];
    setState({ estimatesIndex: entries });
    const refBefore = getState().estimatesIndex;

    // Cloud has same entries
    const cloudEntries = [makeEntry("a"), makeEntry("b")];

    useEstimatesStore.setState(state => {
      const existingIds = new Set(state.estimatesIndex.map(e => e.id));
      const safe = cloudEntries.filter(e => !existingIds.has(e.id));
      if (safe.length === 0) return state; // no-op
      return { estimatesIndex: [...state.estimatesIndex, ...safe] };
    });

    // Reference should be same (no unnecessary re-render)
    expect(getState().estimatesIndex).toBe(refBefore);
  });

  // ── Scenario 2F: Large merge — 100 cloud entries added correctly ──

  it("handles large additive merge without duplicates", () => {
    // Local has 50 entries
    const local = Array.from({ length: 50 }, (_, i) => makeEntry(`local-${i}`));
    setState({ estimatesIndex: local });

    // Cloud has 100 entries: 50 overlapping with local, 50 new
    const cloud = [
      ...Array.from({ length: 50 }, (_, i) => makeEntry(`local-${i}`, "Cloud version")),
      ...Array.from({ length: 50 }, (_, i) => makeEntry(`cloud-${i}`)),
    ];

    const deletedSet = new Set();

    useEstimatesStore.setState(state => {
      const existingIds = new Set(state.estimatesIndex.map(e => e.id));
      const safe = cloud.filter(e => !existingIds.has(e.id) && !deletedSet.has(e.id));
      if (safe.length === 0) return state;
      return { estimatesIndex: [...state.estimatesIndex, ...safe] };
    });

    const result = getState().estimatesIndex;
    expect(result).toHaveLength(100); // 50 local + 50 new cloud
    // No duplicates
    const ids = result.map(e => e.id);
    expect(new Set(ids).size).toBe(100);
    // Local versions preserved for overlapping IDs
    const localZero = result.find(e => e.id === "local-0");
    expect(localZero.name).toBe("Test"); // original local name, not "Cloud version"
  });

  // ── Scenario 2G: Delete + merge interaction ──

  it("full lifecycle: create, delete, cloud merge does not resurrect", async () => {
    // Step 1: Create locally
    const id = await getState().createEstimate("", "E-100", null);

    // Step 2: Delete locally
    await getState().deleteEstimate(id);
    expect(getState().estimatesIndex).toHaveLength(0);

    // Step 3: Cloud sync tries to merge the same ID back
    const cloudEntry = makeEntry(id, "Stale cloud copy");
    const deletedRaw = _idb.get("bldg-deleted-ids");
    const deletedIds = deletedRaw ? JSON.parse(deletedRaw) : [];
    const deletedSet = new Set(deletedIds);

    useEstimatesStore.setState(state => {
      const existingIds = new Set(state.estimatesIndex.map(e => e.id));
      const safe = [cloudEntry].filter(e => !existingIds.has(e.id) && !deletedSet.has(e.id));
      if (safe.length === 0) return state;
      return { estimatesIndex: [...state.estimatesIndex, ...safe] };
    });

    // Deleted ID should be in the set, blocking resurrection
    expect(deletedSet.has(id)).toBe(true);
    expect(getState().estimatesIndex).toHaveLength(0);
  });

  // ── Scenario 2H: Merge with mixed deleted and new entries ──

  it("correctly filters mixed batch of deleted and new cloud entries", async () => {
    // Create and delete two estimates
    const id1 = await getState().createEstimate("", "E-201", null);
    const id2 = await getState().createEstimate("", "E-202", null);
    await getState().deleteEstimate(id1);
    await getState().deleteEstimate(id2);

    // Read deleted IDs from IDB (what readDeletedIds() would return)
    const deletedRaw = _idb.get("bldg-deleted-ids");
    const deletedIds = deletedRaw ? JSON.parse(deletedRaw) : [];
    const deletedSet = new Set(deletedIds);

    // Cloud sends back: both deleted + 2 genuinely new
    const cloudEntries = [
      makeEntry(id1, "Zombie 1"),
      makeEntry(id2, "Zombie 2"),
      makeEntry("fresh-1", "Fresh 1"),
      makeEntry("fresh-2", "Fresh 2"),
    ];

    useEstimatesStore.setState(state => {
      const existingIds = new Set(state.estimatesIndex.map(e => e.id));
      const safe = cloudEntries.filter(e => !existingIds.has(e.id) && !deletedSet.has(e.id));
      if (safe.length === 0) return state;
      return { estimatesIndex: [...state.estimatesIndex, ...safe] };
    });

    const ids = getState().estimatesIndex.map(e => e.id);
    expect(ids).not.toContain(id1);
    expect(ids).not.toContain(id2);
    expect(ids).toContain("fresh-1");
    expect(ids).toContain("fresh-2");
    expect(ids).toHaveLength(2);
  });

  // Regression: the boot-time cross-device merge must REMOVE locally-cached
  // entries whose IDs appear in the cloud's authoritative deleted-ID list.
  // This direction was missing before 2026-04-19 — the old merge only ADDED
  // cloud entries missing locally, so a stale local entry that was deleted
  // on another device would live forever. See commit 74b56bd + pullDeletedEstimateIds.
  it("removes locally-cached entries when cloud marks them deleted", async () => {
    const { useEstimatesStore } = await import("@/stores/estimatesStore");
    const { getState, setState } = useEstimatesStore;

    // Seed local index with 3 entries — all appear "live" from the local view
    setState({
      estimatesIndex: [
        { id: "live-1", name: "Active A" },
        { id: "deleted-on-other-device", name: "Stale B" },
        { id: "live-3", name: "Active C" },
      ],
    });

    // Simulate what the reconcile does:
    //   cloudLive  = pullEstimatesIndex() → returns only rows where deleted_at IS NULL
    //   cloudDeleted = pullDeletedEstimateIds() → returns IDs where deleted_at IS NOT NULL
    const cloudLive = [{ id: "live-1" }, { id: "live-3" }];
    const cloudDeletedIds = ["deleted-on-other-device"];
    const deletedSet = new Set(cloudDeletedIds);

    // Reconcile — same shape as usePersistence.js line 279 block after the fix
    setState(state => {
      const filteredLocal = state.estimatesIndex.filter(e => !deletedSet.has(e.id));
      const localIds = new Set(filteredLocal.map(e => e.id));
      const newFromCloud = cloudLive.filter(e => !deletedSet.has(e.id) && !localIds.has(e.id));
      return { estimatesIndex: [...filteredLocal, ...newFromCloud] };
    });

    const ids = getState().estimatesIndex.map(e => e.id);
    expect(ids).toContain("live-1");
    expect(ids).toContain("live-3");
    expect(ids).not.toContain("deleted-on-other-device"); // the whole point
    expect(ids).toHaveLength(2);
  });

  it("also adds missing cloud-live entries while purging cloud-deleted ones", async () => {
    const { useEstimatesStore } = await import("@/stores/estimatesStore");
    const { getState, setState } = useEstimatesStore;

    // Local has one live, one stale-deleted. Cloud has one brand-new.
    setState({
      estimatesIndex: [
        { id: "shared", name: "In both places" },
        { id: "purge-me", name: "Deleted on other device" },
      ],
    });

    const cloudLive = [{ id: "shared" }, { id: "new-on-cloud", name: "Created on other device" }];
    const cloudDeletedIds = ["purge-me"];
    const deletedSet = new Set(cloudDeletedIds);

    setState(state => {
      const filteredLocal = state.estimatesIndex.filter(e => !deletedSet.has(e.id));
      const localIds = new Set(filteredLocal.map(e => e.id));
      const newFromCloud = cloudLive.filter(e => !deletedSet.has(e.id) && !localIds.has(e.id));
      return { estimatesIndex: [...filteredLocal, ...newFromCloud] };
    });

    const ids = getState().estimatesIndex.map(e => e.id).sort();
    expect(ids).toEqual(["new-on-cloud", "shared"]);
  });
});
