import { describe, it, expect, beforeEach, vi } from "vitest";

// undoStore has no external deps beyond zustand, but mock storage/idbKey
// in case they get added later.
vi.mock("@/utils/storage", () => ({
  storage: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/utils/idbKey", () => ({
  idbKey: key => key,
}));

// ── Import the store under test ─────────────────────────────────────
import { useUndoStore } from "@/stores/undoStore";

const getState = () => useUndoStore.getState();
const setState = s => useUndoStore.setState(s);

/** Helper to create a simple undo/redo entry */
const makeEntry = (label = "test") => ({
  action: label,
  undo: vi.fn(),
  redo: vi.fn(),
  timestamp: Date.now(),
});

// ═════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════

describe("undoStore", () => {
  beforeEach(() => {
    setState({ past: [], future: [] });
    vi.clearAllMocks();
  });

  // ── 1. Initial state ──────────────────────────────────────────────

  describe("initial state", () => {
    it("has empty past and future stacks", () => {
      expect(getState().past).toEqual([]);
      expect(getState().future).toEqual([]);
    });

    it("canUndo returns false when past is empty", () => {
      expect(getState().canUndo()).toBe(false);
    });

    it("canRedo returns false when future is empty", () => {
      expect(getState().canRedo()).toBe(false);
    });
  });

  // ── 2. push ───────────────────────────────────────────────────────

  describe("push", () => {
    it("adds an entry to the past stack", () => {
      const entry = makeEntry("Add item");
      getState().push(entry);
      expect(getState().past).toHaveLength(1);
      expect(getState().past[0].action).toBe("Add item");
    });

    it("clears the future stack on push (new action invalidates redo)", () => {
      // Set up a future entry
      setState({ future: [makeEntry("old redo")] });
      getState().push(makeEntry("new action"));
      expect(getState().future).toEqual([]);
    });

    it("accumulates multiple entries in order", () => {
      getState().push(makeEntry("first"));
      getState().push(makeEntry("second"));
      getState().push(makeEntry("third"));
      expect(getState().past).toHaveLength(3);
      expect(getState().past[0].action).toBe("first");
      expect(getState().past[2].action).toBe("third");
    });

    it("canUndo returns true after push", () => {
      getState().push(makeEntry());
      expect(getState().canUndo()).toBe(true);
    });
  });

  // ── 3. Stack depth limit (MAX_HISTORY = 50) ───────────────────────

  describe("stack depth limit", () => {
    it("limits the past stack to 50 entries", () => {
      for (let i = 0; i < 60; i++) {
        getState().push(makeEntry(`action-${i}`));
      }
      expect(getState().past).toHaveLength(50);
      // Most recent should be the last pushed
      expect(getState().past[49].action).toBe("action-59");
      // Oldest should have been trimmed (action-0 through action-9 dropped)
      expect(getState().past[0].action).toBe("action-10");
    });
  });

  // ── 4. undo ───────────────────────────────────────────────────────

  describe("undo", () => {
    it("calls the entry's undo function", () => {
      const entry = makeEntry("test undo");
      getState().push(entry);
      getState().undo();
      expect(entry.undo).toHaveBeenCalledOnce();
    });

    it("returns the action label on success", () => {
      getState().push(makeEntry("my action"));
      const result = getState().undo();
      expect(result).toBe("my action");
    });

    it("moves the entry from past to future", () => {
      const entry = makeEntry();
      getState().push(entry);
      getState().undo();
      expect(getState().past).toHaveLength(0);
      expect(getState().future).toHaveLength(1);
      expect(getState().future[0]).toBe(entry);
    });

    it("returns false when past is empty (no-op)", () => {
      const result = getState().undo();
      expect(result).toBe(false);
    });

    it("undoes the most recent action first (LIFO)", () => {
      const first = makeEntry("first");
      const second = makeEntry("second");
      getState().push(first);
      getState().push(second);

      getState().undo();
      expect(second.undo).toHaveBeenCalled();
      expect(first.undo).not.toHaveBeenCalled();
    });

    it("canRedo returns true after undo", () => {
      getState().push(makeEntry());
      getState().undo();
      expect(getState().canRedo()).toBe(true);
    });
  });

  // ── 5. redo ───────────────────────────────────────────────────────

  describe("redo", () => {
    it("calls the entry's redo function", () => {
      const entry = makeEntry("test redo");
      getState().push(entry);
      getState().undo();
      vi.clearAllMocks();
      getState().redo();
      expect(entry.redo).toHaveBeenCalledOnce();
    });

    it("returns the action label on success", () => {
      getState().push(makeEntry("my redo"));
      getState().undo();
      const result = getState().redo();
      expect(result).toBe("my redo");
    });

    it("moves the entry from future back to past", () => {
      const entry = makeEntry();
      getState().push(entry);
      getState().undo();
      getState().redo();
      expect(getState().past).toHaveLength(1);
      expect(getState().future).toHaveLength(0);
    });

    it("returns false when future is empty (no-op)", () => {
      const result = getState().redo();
      expect(result).toBe(false);
    });

    it("re-does the most recently undone action (LIFO from future)", () => {
      const a = makeEntry("a");
      const b = makeEntry("b");
      getState().push(a);
      getState().push(b);
      getState().undo(); // undoes b
      getState().undo(); // undoes a
      vi.clearAllMocks();

      getState().redo(); // should redo a (last undone)
      expect(a.redo).toHaveBeenCalled();
      expect(b.redo).not.toHaveBeenCalled();
    });
  });

  // ── 6. undo + redo round-trip ─────────────────────────────────────

  describe("round-trip", () => {
    it("undo then redo restores stacks to original state", () => {
      const entry = makeEntry("round trip");
      getState().push(entry);
      expect(getState().past).toHaveLength(1);

      getState().undo();
      expect(getState().past).toHaveLength(0);
      expect(getState().future).toHaveLength(1);

      getState().redo();
      expect(getState().past).toHaveLength(1);
      expect(getState().future).toHaveLength(0);
    });
  });

  // ── 7. clear ──────────────────────────────────────────────────────

  describe("clear", () => {
    it("empties both past and future stacks", () => {
      getState().push(makeEntry("a"));
      getState().push(makeEntry("b"));
      getState().undo(); // move b to future

      getState().clear();
      expect(getState().past).toEqual([]);
      expect(getState().future).toEqual([]);
    });

    it("canUndo and canRedo return false after clear", () => {
      getState().push(makeEntry());
      getState().clear();
      expect(getState().canUndo()).toBe(false);
      expect(getState().canRedo()).toBe(false);
    });
  });

  // ── 8. New push after undo invalidates redo ───────────────────────

  describe("push after undo", () => {
    it("clears the redo stack when a new action is pushed after undo", () => {
      getState().push(makeEntry("original"));
      getState().undo();
      expect(getState().future).toHaveLength(1);

      getState().push(makeEntry("new branch"));
      expect(getState().future).toEqual([]);
      expect(getState().past).toHaveLength(1);
      expect(getState().past[0].action).toBe("new branch");
    });
  });
});
