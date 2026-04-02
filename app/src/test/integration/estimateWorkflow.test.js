import { describe, it, expect, beforeEach, vi } from "vitest";

// ═════════════════════════════════════════════════════════════════════
// Integration test: Estimate workflow across multiple stores
//
// Tests that projectStore, groupsStore, and undoStore interact
// correctly in a realistic workflow. We mock only external I/O
// (storage, cloud sync) and let the stores talk to each other.
// ═════════════════════════════════════════════════════════════════════

// ── Mock external I/O ───────────────────────────────────────────────
vi.mock("@/utils/storage", () => ({
  storage: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
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

vi.mock("@/utils/format", async () => {
  let counter = 0;
  return {
    uid: () => `int-uid-${++counter}`,
    today: () => "2026-04-02",
    nowStr: () => "Apr 2, 2026, 9:00 AM",
    nn: v => v ?? "",
  };
});

vi.mock("@/utils/directives", () => ({
  autoDirective: () => "",
}));

vi.mock("@/constants/tradeGroupings", () => ({
  autoTradeFromCode: () => "",
  TRADE_GROUPINGS: [],
}));

vi.mock("@/constants/seedTemplates", () => ({
  TEMPLATE_MAP: new Map(),
  resolveTemplateItems: () => [],
}));

// Mock dependent stores that estimatesStore imports but we don't test here
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

vi.mock("@/stores/drawingsStore", () => {
  const state = { setDrawings: vi.fn(), setDrawingScales: vi.fn(), setDrawingDpi: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useDrawingsStore: store };
});

vi.mock("@/stores/takeoffsStore", () => {
  const state = { setTakeoffs: vi.fn(), setTkCalibrations: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useTakeoffsStore: store };
});

vi.mock("@/stores/bidLevelingStore", () => {
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
  return { useBidLevelingStore: store };
});

vi.mock("@/stores/specsStore", () => {
  const state = { setSpecs: vi.fn(), setSpecPdf: vi.fn(), setExclusions: vi.fn(), setClarifications: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useSpecsStore: store };
});

vi.mock("@/stores/alternatesStore", () => {
  const state = { setAlternates: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useAlternatesStore: store };
});

vi.mock("@/stores/documentsStore", () => {
  const state = { setDocuments: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useDocumentsStore: store };
});

vi.mock("@/stores/moduleStore", () => {
  const state = { setModuleInstances: vi.fn(), setActiveModule: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useModuleStore: store };
});

vi.mock("@/stores/scanStore", () => {
  const state = { clearScan: vi.fn() };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useScanStore: store };
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
  const state = { user: { id: "int-user-1" } };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useAuthStore: store };
});

vi.mock("@/stores/orgStore", () => {
  const state = { org: { id: "int-org-1" } };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useOrgStore: store };
});

// ── Import the REAL stores we are testing together ───────────────────
import { useProjectStore } from "@/stores/projectStore";
import { useGroupsStore, DEFAULT_GROUPS } from "@/stores/groupsStore";
import { useUndoStore } from "@/stores/undoStore";
import { useEstimatesStore } from "@/stores/estimatesStore";

// ═════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════

describe("Estimate Workflow Integration", () => {
  beforeEach(() => {
    // Reset all stores to pristine state
    useProjectStore.getState().resetProject();
    useGroupsStore.setState({ groups: [...DEFAULT_GROUPS] });
    useUndoStore.getState().clear();
    useEstimatesStore.setState({
      estimatesIndex: [],
      activeEstimateId: null,
      draftId: null,
    });
    vi.clearAllMocks();
  });

  // ── 1. Create estimate, set project data, verify state ─────────────

  describe("create estimate and set project data", () => {
    it("creates an estimate and sets project info in projectStore", async () => {
      // Step 1: Create an estimate
      const estId = await useEstimatesStore.getState().createEstimate("", "E-INT-001", null);
      expect(estId).toBeTruthy();
      expect(useEstimatesStore.getState().activeEstimateId).toBe(estId);
      expect(useEstimatesStore.getState().estimatesIndex).toHaveLength(1);

      // Step 2: Set project data (simulates what loadEstimate does)
      useProjectStore.getState().updateProject("name", "Integration Test Project");
      useProjectStore.getState().updateProject("client", "Test Client LLC");
      useProjectStore.getState().updateProject("projectSF", "50000");

      // Step 3: Verify both stores are in correct state
      expect(useProjectStore.getState().project.name).toBe("Integration Test Project");
      expect(useProjectStore.getState().project.client).toBe("Test Client LLC");
      expect(useProjectStore.getState().project.projectSF).toBe("50000");

      const indexEntry = useEstimatesStore.getState().estimatesIndex[0];
      expect(indexEntry.id).toBe(estId);
      expect(indexEntry.estimateNumber).toBe("E-INT-001");
    });
  });

  // ── 2. Groups + undo integration ───────────────────────────────────

  describe("groups and undo work together", () => {
    it("adding a group creates an undo entry that can revert it", () => {
      const groupId = useGroupsStore.getState().addGroup("Alternate A", "alternate");
      expect(useGroupsStore.getState().groups).toHaveLength(2);
      expect(useUndoStore.getState().canUndo()).toBe(true);

      // Undo the add
      useUndoStore.getState().undo();
      expect(useGroupsStore.getState().groups).toHaveLength(1);
      expect(useGroupsStore.getState().groups[0].id).toBe("base");

      // Redo the add
      useUndoStore.getState().redo();
      expect(useGroupsStore.getState().groups).toHaveLength(2);
      expect(useGroupsStore.getState().groups[1].name).toBe("Alternate A");
    });

    it("removing a group creates an undo entry that can restore it", () => {
      const groupId = useGroupsStore.getState().addGroup("Temp Group", "add");
      useUndoStore.getState().clear(); // clear the addGroup undo entry

      useGroupsStore.getState().removeGroup(groupId);
      expect(useGroupsStore.getState().groups).toHaveLength(1);

      useUndoStore.getState().undo();
      expect(useGroupsStore.getState().groups).toHaveLength(2);
      expect(useGroupsStore.getState().groups.find(g => g.id === groupId)).toBeTruthy();
    });
  });

  // ── 3. Multiple stores, sequential workflow ────────────────────────

  describe("full sequential workflow", () => {
    it("project + groups + undo all maintain consistent state", async () => {
      // Create estimate
      await useEstimatesStore.getState().createEstimate("", "E-FULL-001", null);

      // Configure project
      useProjectStore.getState().updateProject("name", "Full Workflow Test");
      useProjectStore.getState().setCodeSystem("uniformat");

      // Add groups
      useGroupsStore.getState().addGroup("Add Alt 1", "alternate");
      useGroupsStore.getState().addGroup("Add Alt 2", "alternate");

      // Verify state
      expect(useProjectStore.getState().project.name).toBe("Full Workflow Test");
      expect(useProjectStore.getState().codeSystem).toBe("uniformat");
      expect(useGroupsStore.getState().groups).toHaveLength(3);
      expect(useUndoStore.getState().past).toHaveLength(2); // 2 group adds

      // Undo both group adds
      useUndoStore.getState().undo();
      useUndoStore.getState().undo();
      expect(useGroupsStore.getState().groups).toHaveLength(1);

      // Project state should be unaffected by group undo
      expect(useProjectStore.getState().project.name).toBe("Full Workflow Test");

      // Redo one
      useUndoStore.getState().redo();
      expect(useGroupsStore.getState().groups).toHaveLength(2);
    });
  });

  // ── 4. Reset project clears state independently ────────────────────

  describe("project reset isolation", () => {
    it("resetting project does not affect groups or undo", () => {
      useProjectStore.getState().updateProject("name", "Will Reset");
      useGroupsStore.getState().addGroup("Persist Group", "add");

      useProjectStore.getState().resetProject();

      // Project should be reset
      expect(useProjectStore.getState().project.name).toBe("New Estimate");
      // Groups should be untouched
      expect(useGroupsStore.getState().groups).toHaveLength(2);
      // Undo should still have the group add
      expect(useUndoStore.getState().canUndo()).toBe(true);
    });
  });

  // ── 5. Clearing undo does not affect data stores ───────────────────

  describe("undo clear isolation", () => {
    it("clearing undo history does not affect project or groups", () => {
      useProjectStore.getState().updateProject("name", "Keep Me");
      useGroupsStore.getState().addGroup("Keep Group", "add");

      useUndoStore.getState().clear();

      expect(useProjectStore.getState().project.name).toBe("Keep Me");
      expect(useGroupsStore.getState().groups).toHaveLength(2);
      expect(useUndoStore.getState().canUndo()).toBe(false);
    });
  });
});
