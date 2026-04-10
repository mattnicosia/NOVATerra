import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock all external dependencies BEFORE importing the store ──────────
// NOTE: vi.mock factories are hoisted, so we cannot reference outer variables.
// Each factory must be self-contained.

// Mock storage (IndexedDB wrapper)
vi.mock("@/utils/storage", () => ({
  storage: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock cloudSync
vi.mock("@/utils/cloudSync", () => ({
  pushEstimate: vi.fn().mockResolvedValue(undefined),
  pushData: vi.fn().mockResolvedValue(undefined),
  deleteEstimate: vi.fn().mockResolvedValue(undefined),
  syncIndexColumns: vi.fn().mockResolvedValue(undefined),
  readLocalEstimateRecord: vi.fn().mockResolvedValue({ exists: true, corrupted: false, data: { project: {} } }),
}));

// Mock idbKey — pass through key unchanged
vi.mock("@/utils/idbKey", () => ({
  idbKey: key => key,
}));

// Mock seedTemplates
vi.mock("@/constants/seedTemplates", () => ({
  TEMPLATE_MAP: new Map(),
  resolveTemplateItems: () => [],
}));

// Mock directives
vi.mock("@/utils/directives", () => ({
  autoDirective: () => "",
}));

// Mock tradeGroupings
vi.mock("@/constants/tradeGroupings", () => ({
  autoTradeFromCode: () => "",
  TRADE_GROUPINGS: [],
}));

// Mock all dependent Zustand stores (each factory is self-contained)
vi.mock("@/stores/uiStore", () => {
  const state = {
    appSettings: { defaultLaborType: "open_shop" },
    cloudSyncInProgress: false,
    setAiChatMessages: vi.fn(),
  };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useUiStore: store };
});

vi.mock("@/stores/projectStore", () => {
  const state = {
    setProject: vi.fn(),
    setCodeSystem: vi.fn(),
    setCustomCodes: vi.fn(),
  };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useProjectStore: store };
});

vi.mock("@/stores/itemsStore", () => {
  const state = {
    setItems: vi.fn(),
    setMarkup: vi.fn(),
    setMarkupOrder: vi.fn(),
    setCustomMarkups: vi.fn(),
    setChangeOrders: vi.fn(),
  };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useItemsStore: store };
});

vi.mock("@/stores/drawingPipelineStore", () => {
  const state = {
    setDrawings: vi.fn(),
    setDrawingScales: vi.fn(),
    setDrawingDpi: vi.fn(),
    setTakeoffs: vi.fn(),
    setTkCalibrations: vi.fn(),
    clearScan: vi.fn(),
  };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useDrawingPipelineStore: store };
});

vi.mock("@/stores/bidManagementStore", () => {
  const state = {
    setSubBidSubs: vi.fn(),
    setBidTotals: vi.fn(),
    setBidCells: vi.fn(),
    setBidSelections: vi.fn(),
    setLinkedSubs: vi.fn(),
    setSubKeyLabels: vi.fn(),
  };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useBidManagementStore: store };
});

vi.mock("@/stores/documentManagementStore", () => {
  const state = {
    setSpecs: vi.fn(),
    setSpecPdf: vi.fn(),
    setExclusions: vi.fn(),
    setClarifications: vi.fn(),
    setDocuments: vi.fn(),
  };
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
  const state = {
    getCompanyInfo: () => ({
      boilerplateExclusions: [],
      boilerplateNotes: [],
    }),
  };
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

// ── Now import the store under test ────────────────────────────────────

import { useEstimatesStore, markDeleted, hydrateDeletedIds } from "@/stores/estimatesStore";
import { storage } from "@/utils/storage";
import * as cloudSync from "@/utils/cloudSync";

// ── Helpers ────────────────────────────────────────────────────────────

const getState = () => useEstimatesStore.getState();
const setState = s => useEstimatesStore.setState(s);

const makeFakeEntry = (overrides = {}) => ({
  id: `est-${Math.random().toString(36).slice(2, 7)}`,
  name: "Test Estimate",
  estimateNumber: "E-001",
  client: "Acme Corp",
  status: "Bidding",
  bidDue: "",
  startDate: "2026-03-17",
  estimatedHours: 0,
  grandTotal: 0,
  elementCount: 0,
  lastModified: "Mar 17, 2026, 9:00 AM",
  estimator: "",
  coEstimators: [],
  jobType: "",
  companyProfileId: "",
  buildingType: "",
  workType: "",
  architect: "",
  projectSF: 0,
  zipCode: "",
  divisionTotals: {},
  outcomeMetadata: {},
  ownerId: "test-user-123",
  orgId: "test-org-456",
  ...overrides,
});

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("estimatesStore", () => {
  beforeEach(() => {
    // Reset store to pristine initial state
    setState({
      estimatesIndex: [],
      activeEstimateId: null,
      draftId: null,
    });
    vi.clearAllMocks();
    cloudSync.readLocalEstimateRecord.mockResolvedValue({ exists: true, corrupted: false, data: { project: {} } });
    localStorage.removeItem("bldg-dirty-estimates");
  });

  // ── 1. Initial state shape ──────────────────────────────────────────

  describe("initial state", () => {
    it("has an empty estimatesIndex array", () => {
      expect(getState().estimatesIndex).toEqual([]);
    });

    it("has null activeEstimateId", () => {
      expect(getState().activeEstimateId).toBeNull();
    });

    it("has null draftId", () => {
      expect(getState().draftId).toBeNull();
    });
  });

  // ── 2. setEstimatesIndex ────────────────────────────────────────────

  describe("setEstimatesIndex", () => {
    it("sets the index to the provided array", () => {
      const entries = [makeFakeEntry({ id: "a" }), makeFakeEntry({ id: "b" })];
      getState().setEstimatesIndex(entries);
      expect(getState().estimatesIndex).toHaveLength(2);
      expect(getState().estimatesIndex[0].id).toBe("a");
    });

    it("defaults to empty array for non-array input", () => {
      getState().setEstimatesIndex(null);
      expect(getState().estimatesIndex).toEqual([]);

      getState().setEstimatesIndex("not an array");
      expect(getState().estimatesIndex).toEqual([]);

      getState().setEstimatesIndex(undefined);
      expect(getState().estimatesIndex).toEqual([]);
    });
  });

  // ── 3. setActiveEstimateId ──────────────────────────────────────────

  describe("setActiveEstimateId", () => {
    it("sets the active estimate ID", () => {
      getState().setActiveEstimateId("est-123");
      expect(getState().activeEstimateId).toBe("est-123");
    });

    it("can be set to null", () => {
      getState().setActiveEstimateId("est-123");
      getState().setActiveEstimateId(null);
      expect(getState().activeEstimateId).toBeNull();
    });
  });

  // ── 4. clearDraft ───────────────────────────────────────────────────

  describe("clearDraft", () => {
    it("sets draftId to null", () => {
      setState({ draftId: "draft-abc" });
      getState().clearDraft();
      expect(getState().draftId).toBeNull();
    });
  });

  // ── 5. createEstimate ───────────────────────────────────────────────

  describe("createEstimate", () => {
    it("returns a new estimate ID", async () => {
      const id = await getState().createEstimate("", "", null);
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("adds a new entry to estimatesIndex", async () => {
      await getState().createEstimate("profile-1", "E-100", null);
      const idx = getState().estimatesIndex;
      expect(idx).toHaveLength(1);
      expect(idx[0].estimateNumber).toBe("E-100");
      expect(idx[0].companyProfileId).toBe("profile-1");
    });

    it("sets the activeEstimateId to the new estimate", async () => {
      const id = await getState().createEstimate();
      expect(getState().activeEstimateId).toBe(id);
    });

    it("defaults name to 'New Estimate' without a template", async () => {
      await getState().createEstimate();
      expect(getState().estimatesIndex[0].name).toBe("New Estimate");
    });

    it("persists estimate data to storage", async () => {
      const id = await getState().createEstimate("", "E-200", null);
      const setCalls = storage.set.mock.calls;
      const dataCall = setCalls.find(c => c[0] === `bldg-est-${id}`);
      const indexCall = setCalls.find(c => c[0] === "bldg-index");
      expect(dataCall).toBeTruthy();
      expect(indexCall).toBeTruthy();
    });

    it("includes ownership fields from auth/org stores", async () => {
      await getState().createEstimate();
      const entry = getState().estimatesIndex[0];
      expect(entry.ownerId).toBe("test-user-123");
      expect(entry.orgId).toBe("test-org-456");
    });

    it("sets default status to Bidding", async () => {
      await getState().createEstimate();
      expect(getState().estimatesIndex[0].status).toBe("Bidding");
    });

    it("pushes to cloud sync when not in progress", async () => {
      await getState().createEstimate();
      expect(cloudSync.pushEstimate).toHaveBeenCalled();
      expect(cloudSync.pushData).not.toHaveBeenCalled();
    });

    it("accumulates multiple estimates in the index", async () => {
      await getState().createEstimate("", "E-1");
      await getState().createEstimate("", "E-2");
      await getState().createEstimate("", "E-3");
      expect(getState().estimatesIndex).toHaveLength(3);
    });

    it("populates index entry with all required fields", async () => {
      const id = await getState().createEstimate("cp-1", "E-300", null);
      const entry = getState().estimatesIndex[0];
      expect(entry.id).toBe(id);
      expect(entry.name).toBe("New Estimate");
      expect(entry.estimateNumber).toBe("E-300");
      expect(entry.client).toBe("");
      expect(entry.status).toBe("Bidding");
      expect(entry.grandTotal).toBe(0);
      expect(entry.elementCount).toBe(0);
      expect(entry.divisionTotals).toEqual({});
      expect(entry.assignedTo).toEqual(["test-user-123"]);
      expect(entry.templateId).toBeNull();
      expect(entry.correspondenceCount).toBe(0);
      expect(entry.schedulePauses).toEqual([]);
      expect(entry.manualPercentComplete).toBeNull();
      expect(entry.manualHoursLogged).toBeNull();
      expect(entry.delegatedBy).toBe("");
    });
  });

  // ── 6. deleteEstimate ───────────────────────────────────────────────

  describe("deleteEstimate", () => {
    it("removes the estimate from the index", async () => {
      const entry = makeFakeEntry({ id: "del-1" });
      setState({ estimatesIndex: [entry], activeEstimateId: "del-1" });

      await getState().deleteEstimate("del-1");
      expect(getState().estimatesIndex).toHaveLength(0);
    });

    it("clears activeEstimateId if the deleted estimate was active", async () => {
      const entry = makeFakeEntry({ id: "del-2" });
      setState({ estimatesIndex: [entry], activeEstimateId: "del-2" });

      await getState().deleteEstimate("del-2");
      expect(getState().activeEstimateId).toBeNull();
    });

    it("preserves activeEstimateId if a different estimate was deleted", async () => {
      const e1 = makeFakeEntry({ id: "keep" });
      const e2 = makeFakeEntry({ id: "remove" });
      setState({ estimatesIndex: [e1, e2], activeEstimateId: "keep" });

      await getState().deleteEstimate("remove");
      expect(getState().activeEstimateId).toBe("keep");
      expect(getState().estimatesIndex).toHaveLength(1);
      expect(getState().estimatesIndex[0].id).toBe("keep");
    });

    it("persists the deleted-ids list to storage", async () => {
      setState({ estimatesIndex: [makeFakeEntry({ id: "del-3" })] });
      await getState().deleteEstimate("del-3");

      const setCall = storage.set.mock.calls.find(c => c[0] === "bldg-deleted-ids");
      expect(setCall).toBeTruthy();
      const deletedIds = JSON.parse(setCall[1]);
      expect(deletedIds).toContain("del-3");
    });

    it("removes the estimate data from storage", async () => {
      setState({ estimatesIndex: [makeFakeEntry({ id: "del-4" })] });
      await getState().deleteEstimate("del-4");
      expect(storage.delete).toHaveBeenCalledWith("bldg-est-del-4");
    });

    it("calls cloud sync deleteEstimate", async () => {
      setState({ estimatesIndex: [makeFakeEntry({ id: "del-5" })] });
      await getState().deleteEstimate("del-5");
      expect(cloudSync.deleteEstimate).toHaveBeenCalledWith("del-5");
    });
  });

  // ── 7. updateIndexEntry ─────────────────────────────────────────────

  describe("updateIndexEntry", () => {
    it("updates fields on an existing entry", () => {
      const entry = makeFakeEntry({ id: "upd-1", name: "Original" });
      setState({ estimatesIndex: [entry] });

      getState().updateIndexEntry("upd-1", { name: "Updated Name" });
      expect(getState().estimatesIndex[0].name).toBe("Updated Name");
    });

    it("does not modify other entries", () => {
      const e1 = makeFakeEntry({ id: "upd-a", name: "A" });
      const e2 = makeFakeEntry({ id: "upd-b", name: "B" });
      setState({ estimatesIndex: [e1, e2] });

      getState().updateIndexEntry("upd-a", { name: "A Updated" });
      expect(getState().estimatesIndex[1].name).toBe("B");
    });

    it("is a no-op when the ID is not found", () => {
      const entry = makeFakeEntry({ id: "upd-c" });
      setState({ estimatesIndex: [entry] });

      getState().updateIndexEntry("nonexistent", { name: "Ghost" });
      expect(getState().estimatesIndex).toHaveLength(1);
      expect(getState().estimatesIndex[0].name).toBe("Test Estimate");
    });

    it("is a no-op when values have not actually changed", () => {
      const entry = makeFakeEntry({
        id: "upd-d",
        name: "Same",
        status: "Bidding",
      });
      setState({ estimatesIndex: [entry] });
      const refBefore = getState().estimatesIndex;

      getState().updateIndexEntry("upd-d", {
        name: "Same",
        status: "Bidding",
      });
      // The no-op guard returns the same state object — reference equality
      expect(getState().estimatesIndex).toBe(refBefore);
    });

    it("can update multiple fields at once", () => {
      const entry = makeFakeEntry({ id: "upd-e", name: "Old", status: "Bidding" });
      setState({ estimatesIndex: [entry] });

      getState().updateIndexEntry("upd-e", {
        name: "New Name",
        status: "Won",
        client: "New Client",
      });
      const updated = getState().estimatesIndex[0];
      expect(updated.name).toBe("New Name");
      expect(updated.status).toBe("Won");
      expect(updated.client).toBe("New Client");
    });

    it("persists index to storage after update", () => {
      const entry = makeFakeEntry({ id: "upd-f" });
      setState({ estimatesIndex: [entry] });
      vi.clearAllMocks();

      getState().updateIndexEntry("upd-f", { name: "Persisted" });
      expect(storage.set).toHaveBeenCalled();
    });

    it("syncs updated index columns to the cloud record", () => {
      const entry = makeFakeEntry({ id: "upd-g" });
      setState({ estimatesIndex: [entry] });
      vi.clearAllMocks();

      getState().updateIndexEntry("upd-g", { status: "Won" });
      expect(cloudSync.syncIndexColumns).toHaveBeenCalledWith("upd-g", { status: "Won" });
      expect(cloudSync.pushData).not.toHaveBeenCalled();
    });
  });

  // ── 8. assignEstimate ───────────────────────────────────────────────

  describe("assignEstimate", () => {
    it("updates the assignedTo field for an estimate", () => {
      const entry = makeFakeEntry({ id: "asgn-1", assignedTo: [] });
      setState({ estimatesIndex: [entry] });

      getState().assignEstimate("asgn-1", ["user-a", "user-b"]);
      expect(getState().estimatesIndex[0].assignedTo).toEqual(["user-a", "user-b"]);
    });

    it("is a no-op when assignedTo has not changed", () => {
      const entry = makeFakeEntry({ id: "asgn-2", assignedTo: ["user-x"] });
      setState({ estimatesIndex: [entry] });

      getState().assignEstimate("asgn-2", ["user-x"]);
      expect(getState().estimatesIndex[0].assignedTo).toEqual(["user-x"]);
    });

    it("persists the assignment change into the estimate blob before pushing", async () => {
      const entry = makeFakeEntry({ id: "asgn-3", assignedTo: [] });
      setState({ estimatesIndex: [entry] });
      cloudSync.readLocalEstimateRecord.mockResolvedValueOnce({
        exists: true,
        corrupted: false,
        data: { project: { name: "Test" } },
      });

      getState().assignEstimate("asgn-3", ["user-a", "user-b"]);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(storage.set).toHaveBeenCalledWith(
        "bldg-est-asgn-3",
        expect.stringContaining('"assignedTo":["user-a","user-b"]'),
      );
      expect(cloudSync.pushEstimate).toHaveBeenCalledWith(
        "asgn-3",
        expect.objectContaining({
          project: expect.objectContaining({
            assignedTo: ["user-a", "user-b"],
          }),
        }),
      );
    });

    it("marks the estimate dirty when the direct cloud push fails", async () => {
      const entry = makeFakeEntry({ id: "asgn-4", assignedTo: [] });
      setState({ estimatesIndex: [entry] });
      cloudSync.pushEstimate.mockRejectedValueOnce(new Error("sync failed"));

      getState().assignEstimate("asgn-4", ["user-a"]);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(localStorage.getItem("bldg-dirty-estimates")).toContain("asgn-4");
    });
  });

  // ── 9. initDraftEstimate ────────────────────────────────────────────

  describe("initDraftEstimate", () => {
    it("returns a new draft ID", () => {
      const id = getState().initDraftEstimate("");
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("sets both activeEstimateId and draftId", () => {
      const id = getState().initDraftEstimate("");
      expect(getState().activeEstimateId).toBe(id);
      expect(getState().draftId).toBe(id);
    });

    it("does NOT add to estimatesIndex (draft is in-memory only)", () => {
      getState().initDraftEstimate("");
      expect(getState().estimatesIndex).toHaveLength(0);
    });
  });

  // ── 10. getRevisionChain ────────────────────────────────────────────

  describe("getRevisionChain", () => {
    it("returns the parent plus all revisions sorted by revision number", () => {
      const parent = makeFakeEntry({ id: "parent-1", revisionNumber: 0 });
      const rev1 = makeFakeEntry({
        id: "rev-1",
        parentEstimateId: "parent-1",
        revisionNumber: 1,
      });
      const rev2 = makeFakeEntry({
        id: "rev-2",
        parentEstimateId: "parent-1",
        revisionNumber: 2,
      });
      setState({ estimatesIndex: [rev2, parent, rev1] });

      const chain = getState().getRevisionChain("parent-1");
      expect(chain).toHaveLength(3);
      expect(chain[0].id).toBe("parent-1");
      expect(chain[1].id).toBe("rev-1");
      expect(chain[2].id).toBe("rev-2");
    });

    it("returns the chain when called from a revision ID", () => {
      const parent = makeFakeEntry({ id: "p-2", revisionNumber: 0 });
      const rev = makeFakeEntry({
        id: "r-2",
        parentEstimateId: "p-2",
        revisionNumber: 1,
      });
      setState({ estimatesIndex: [parent, rev] });

      const chain = getState().getRevisionChain("r-2");
      expect(chain).toHaveLength(2);
    });

    it("returns empty array for nonexistent ID", () => {
      expect(getState().getRevisionChain("ghost")).toEqual([]);
    });

    it("returns single-element array for estimate with no revisions", () => {
      const solo = makeFakeEntry({ id: "solo-1" });
      setState({ estimatesIndex: [solo] });

      const chain = getState().getRevisionChain("solo-1");
      expect(chain).toHaveLength(1);
      expect(chain[0].id).toBe("solo-1");
    });
  });

  // ── 11. Zombie guard exports ────────────────────────────────────────

  describe("markDeleted / hydrateDeletedIds", () => {
    it("markDeleted prevents an ID from being added to the index", () => {
      markDeleted("zombie-1");

      setState({
        estimatesIndex: [makeFakeEntry({ id: "zombie-1" })],
      });

      // The zombie guard subscriber should strip it out
      expect(getState().estimatesIndex.some(e => e.id === "zombie-1")).toBe(false);
    });

    it("hydrateDeletedIds accepts an array and guards all IDs", () => {
      hydrateDeletedIds(["zombie-a", "zombie-b"]);

      setState({
        estimatesIndex: [
          makeFakeEntry({ id: "zombie-a" }),
          makeFakeEntry({ id: "safe-1" }),
          makeFakeEntry({ id: "zombie-b" }),
        ],
      });

      const ids = getState().estimatesIndex.map(e => e.id);
      expect(ids).not.toContain("zombie-a");
      expect(ids).not.toContain("zombie-b");
      expect(ids).toContain("safe-1");
    });
  });

  // ── 12. _getOwnership ──────────────────────────────────────────────

  describe("_getOwnership", () => {
    it("returns ownerId and orgId from auth/org stores", () => {
      const ownership = getState()._getOwnership();
      expect(ownership.ownerId).toBe("test-user-123");
      expect(ownership.orgId).toBe("test-org-456");
    });
  });

  // ── 13. importFromRfp ──────────────────────────────────────────────

  describe("importFromRfp", () => {
    it("creates a new estimate from RFP data and returns an ID", async () => {
      const rfpData = {
        project: {
          name: "RFP Import Test",
          client: "Big Client",
          estimateNumber: "RFP-001",
          status: "Bidding",
        },
        items: [],
      };

      const id = await getState().importFromRfp(rfpData, {
        sourceRfpId: "rfp-99",
      });
      expect(typeof id).toBe("string");

      const idx = getState().estimatesIndex;
      expect(idx).toHaveLength(1);
      expect(idx[0].name).toBe("RFP Import Test");
      expect(idx[0].client).toBe("Big Client");
      expect(idx[0].sourceRfpId).toBe("rfp-99");
      expect(idx[0].emailCount).toBe(1);
    });

    it("sets activeEstimateId to the new estimate", async () => {
      const id = await getState().importFromRfp({ project: {} });
      expect(getState().activeEstimateId).toBe(id);
    });

    it("stamps ownership on the imported data", async () => {
      await getState().importFromRfp({ project: { name: "Test" } });
      const entry = getState().estimatesIndex[0];
      expect(entry.ownerId).toBe("test-user-123");
      expect(entry.orgId).toBe("test-org-456");
    });

    it("defaults name to 'Imported RFP' when project name is missing", async () => {
      await getState().importFromRfp({ project: {} });
      expect(getState().estimatesIndex[0].name).toBe("Imported RFP");
    });
  });

  // ── 14. duplicateEstimate ──────────────────────────────────────────

  describe("duplicateEstimate", () => {
    it("returns undefined if source data is not in storage", async () => {
      setState({ estimatesIndex: [makeFakeEntry({ id: "dup-1" })] });
      const result = await getState().duplicateEstimate("dup-1");
      expect(result).toBeUndefined();
    });

    it("creates a copy with ' (Copy)' suffix when source exists", async () => {
      const sourceData = {
        project: { name: "Original Project" },
        items: [],
      };
      storage.get.mockResolvedValueOnce({
        value: JSON.stringify(sourceData),
      });

      const entry = makeFakeEntry({ id: "dup-2", name: "Original Project" });
      setState({ estimatesIndex: [entry] });

      const newId = await getState().duplicateEstimate("dup-2");
      expect(typeof newId).toBe("string");
      expect(newId).not.toBe("dup-2");

      const idx = getState().estimatesIndex;
      expect(idx).toHaveLength(2);
      const copy = idx.find(e => e.id === newId);
      expect(copy.name).toBe("Original Project (Copy)");
    });

    it("persists the duplicate to storage", async () => {
      const sourceData = { project: { name: "Src" }, items: [] };
      storage.get.mockResolvedValueOnce({
        value: JSON.stringify(sourceData),
      });
      const entry = makeFakeEntry({ id: "dup-3", name: "Src" });
      setState({ estimatesIndex: [entry] });

      const newId = await getState().duplicateEstimate("dup-3");

      const dataCall = storage.set.mock.calls.find(c => c[0] === `bldg-est-${newId}`);
      expect(dataCall).toBeTruthy();
    });
  });
});
