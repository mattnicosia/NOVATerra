import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock external dependencies BEFORE importing the store ───────────
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

// Mock format uid for deterministic IDs in tests
let _uidCounter = 0;
vi.mock("@/utils/format", () => ({
  uid: () => `test-uid-${++_uidCounter}`,
}));

// Mock undoStore — let groupsStore push to it, but we spy on push
const _undoPushCalls = [];
vi.mock("@/stores/undoStore", () => {
  const state = {
    push: vi.fn(entry => _undoPushCalls.push(entry)),
    past: [],
    future: [],
    undo: vi.fn(),
    redo: vi.fn(),
    clear: vi.fn(),
    canUndo: () => false,
    canRedo: () => false,
  };
  const store = () => state;
  store.getState = () => state;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  return { useUndoStore: store };
});

// ── Import the store under test ─────────────────────────────────────
import { useGroupsStore, DEFAULT_GROUPS } from "@/stores/groupsStore";
import { useUndoStore } from "@/stores/undoStore";

const getState = () => useGroupsStore.getState();
const setState = s => useGroupsStore.setState(s);

// ═════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════

describe("groupsStore", () => {
  beforeEach(() => {
    setState({ groups: [...DEFAULT_GROUPS] });
    _uidCounter = 0;
    _undoPushCalls.length = 0;
    vi.clearAllMocks();
  });

  // ── 1. Initial / default state ─────────────────────────────────────

  describe("initial state", () => {
    it("has a default 'Base Bid' group", () => {
      const groups = getState().groups;
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe("base");
      expect(groups[0].name).toBe("Base Bid");
      expect(groups[0].type).toBe("base");
      expect(groups[0].accepted).toBe(true);
    });
  });

  // ── 2. DEFAULT_GROUPS export ───────────────────────────────────────

  describe("DEFAULT_GROUPS constant", () => {
    it("contains exactly one base group", () => {
      expect(DEFAULT_GROUPS).toHaveLength(1);
      expect(DEFAULT_GROUPS[0].id).toBe("base");
    });
  });

  // ── 3. addGroup ────────────────────────────────────────────────────

  describe("addGroup", () => {
    it("adds a new group with a generated ID", () => {
      const id = getState().addGroup("Alternate 1", "add");
      expect(id).toBe("test-uid-1");
      expect(getState().groups).toHaveLength(2);
      expect(getState().groups[1].name).toBe("Alternate 1");
    });

    it("sets the new group type to 'add' by default when type is falsy", () => {
      getState().addGroup("No Type", "");
      const added = getState().groups[1];
      expect(added.type).toBe("add");
    });

    it("sets accepted to false for new groups", () => {
      getState().addGroup("New Group", "alternate");
      expect(getState().groups[1].accepted).toBe(false);
    });

    it("pushes an undo entry", () => {
      getState().addGroup("Undo Test", "add");
      expect(useUndoStore.getState().push).toHaveBeenCalledOnce();
      expect(_undoPushCalls[0].action).toContain("Undo Test");
    });

    it("supports parentId for nested groups", () => {
      getState().addGroup("Child", "add", "base");
      expect(getState().groups[1].parentId).toBe("base");
    });

    it("returns the new group's ID", () => {
      const id = getState().addGroup("Return Test", "add");
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });
  });

  // ── 4. updateGroup ─────────────────────────────────────────────────

  describe("updateGroup", () => {
    it("updates a field on an existing group", () => {
      getState().addGroup("Editable", "add");
      const id = getState().groups[1].id;
      getState().updateGroup(id, "name", "Updated Name");
      expect(getState().groups[1].name).toBe("Updated Name");
    });

    it("protects the base group id and type from being changed", () => {
      getState().updateGroup("base", "id", "hacked");
      expect(getState().groups[0].id).toBe("base");

      getState().updateGroup("base", "type", "alternate");
      expect(getState().groups[0].type).toBe("base");
    });

    it("allows updating name on the base group", () => {
      getState().updateGroup("base", "name", "Renamed Base");
      expect(getState().groups[0].name).toBe("Renamed Base");
    });

    it("pushes an undo entry", () => {
      getState().addGroup("For Update", "add");
      vi.clearAllMocks();
      _undoPushCalls.length = 0;

      const id = getState().groups[1].id;
      getState().updateGroup(id, "accepted", true);
      expect(useUndoStore.getState().push).toHaveBeenCalledOnce();
    });
  });

  // ── 5. removeGroup ─────────────────────────────────────────────────

  describe("removeGroup", () => {
    it("removes a non-base group", () => {
      getState().addGroup("Removable", "add");
      const id = getState().groups[1].id;
      expect(getState().groups).toHaveLength(2);

      getState().removeGroup(id);
      expect(getState().groups).toHaveLength(1);
      expect(getState().groups[0].id).toBe("base");
    });

    it("cannot remove the base group", () => {
      getState().removeGroup("base");
      expect(getState().groups).toHaveLength(1);
      expect(getState().groups[0].id).toBe("base");
    });

    it("pushes an undo entry", () => {
      getState().addGroup("Delete Me", "add");
      vi.clearAllMocks();
      _undoPushCalls.length = 0;

      const id = getState().groups[1].id;
      getState().removeGroup(id);
      expect(useUndoStore.getState().push).toHaveBeenCalledOnce();
    });
  });

  // ── 6. reorderGroups ───────────────────────────────────────────────

  describe("reorderGroups", () => {
    it("reorders groups while keeping Base Bid at index 0", () => {
      getState().addGroup("Alpha", "add");
      getState().addGroup("Beta", "add");
      const [base, alpha, beta] = getState().groups;

      // Pass them in wrong order — beta, alpha, base
      getState().reorderGroups([beta, alpha, base]);

      const result = getState().groups;
      expect(result[0].id).toBe("base");
      expect(result[1].name).toBe("Beta");
      expect(result[2].name).toBe("Alpha");
    });

    it("pushes an undo entry", () => {
      getState().addGroup("A", "add");
      vi.clearAllMocks();
      _undoPushCalls.length = 0;

      getState().reorderGroups([...getState().groups]);
      expect(useUndoStore.getState().push).toHaveBeenCalledOnce();
    });
  });

  // ── 7. setGroups (direct setter) ───────────────────────────────────

  describe("setGroups", () => {
    it("replaces the entire groups array", () => {
      const custom = [
        { id: "base", name: "Base Bid", type: "base", accepted: true, description: "" },
        { id: "alt-1", name: "Alt 1", type: "alternate", accepted: false, description: "" },
      ];
      getState().setGroups(custom);
      expect(getState().groups).toHaveLength(2);
      expect(getState().groups[1].name).toBe("Alt 1");
    });
  });

  // ── 8. Undo callback actually reverts ──────────────────────────────

  describe("undo callback integration", () => {
    it("calling the undo callback from addGroup reverts the groups", () => {
      const prevGroups = [...getState().groups];
      getState().addGroup("Will Undo", "add");
      expect(getState().groups).toHaveLength(2);

      // Execute the undo callback stored in the push call
      const undoEntry = _undoPushCalls[0];
      undoEntry.undo();
      expect(getState().groups).toHaveLength(prevGroups.length);
    });

    it("calling the redo callback from addGroup re-adds the group", () => {
      getState().addGroup("Will Redo", "add");
      const undoEntry = _undoPushCalls[0];

      undoEntry.undo();
      expect(getState().groups).toHaveLength(1);

      undoEntry.redo();
      expect(getState().groups).toHaveLength(2);
      expect(getState().groups[1].name).toBe("Will Redo");
    });
  });
});
