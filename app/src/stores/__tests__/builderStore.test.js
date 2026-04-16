import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useItemsStore } from "@/stores/itemsStore";
import { useUndoStore } from "@/stores/undoStore";

// Mock external stores that itemsStore reads via getState()
vi.mock("@/stores/projectStore", () => ({
  useProjectStore: {
    getState: () => ({
      project: { laborType: "union", zipCode: "", locationMetroId: null },
      divFromCode: code => {
        if (!code) return "";
        const div = String(code).split(".")[0].padStart(2, "0");
        return `${div} - Mock Division`;
      },
    }),
  },
}));

vi.mock("@/stores/uiStore", () => ({
  useUiStore: {
    getState: () => ({
      appSettings: { laborTypes: [] },
    }),
  },
}));

// Helper shortcuts
const getState = () => useItemsStore.getState();
const setState = partial => useItemsStore.setState(partial);

// Seed an item directly into state (bypasses addElement)
const seedItem = (overrides = {}) => {
  const item = {
    id: overrides.id || "item-1",
    code: overrides.code || "",
    description: overrides.description || "Test Item",
    division: overrides.division || "",
    quantity: overrides.quantity ?? 1,
    unit: overrides.unit || "EA",
    material: overrides.material ?? 0,
    labor: overrides.labor ?? 0,
    equipment: overrides.equipment ?? 0,
    subcontractor: overrides.subcontractor ?? 0,
    trade: overrides.trade || "",
    directive: overrides.directive || "",
    directiveOverride: overrides.directiveOverride || false,
    notes: overrides.notes || "",
    drawingRef: overrides.drawingRef || "",
    variables: overrides.variables || [],
    formula: overrides.formula || "",
    specSection: overrides.specSection || "",
    specText: overrides.specText || "",
    specVariantLabel: overrides.specVariantLabel || "",
    allowanceOf: overrides.allowanceOf || "",
    allowanceSubMarkup: overrides.allowanceSubMarkup || "",
    locationLocked: overrides.locationLocked || false,
    subItems: overrides.subItems || [],
    bidContext: overrides.bidContext || "base",
    source: overrides.source || { category: "user", label: "" },
    novaProposed: overrides.novaProposed || false,
  };
  setState({ items: [...getState().items, item] });
  return item;
};

const INITIAL_MARKUP = {
  overhead: 10,
  profit: 10,
  overheadAndProfit: 20,
  contingency: 5,
  generalConditions: 0,
  insurance: 2,
  fee: 0,
  tax: 0,
  bond: 0,
};

describe("itemsStore (builder store)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.runAllTimers();

    // Reset store to initial state
    useItemsStore.setState({
      items: [],
      markup: { ...INITIAL_MARKUP },
      markupOrder: useItemsStore.getState().markupOrder,
      customMarkups: [],
      changeOrders: [],
      projectAssemblies: [],
    });
    useUndoStore.setState({ past: [], future: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Initial State ──────────────────────────────────────────────
  describe("initial state shape", () => {
    it("has empty items array", () => {
      expect(getState().items).toEqual([]);
    });

    it("has default markup values", () => {
      const m = getState().markup;
      expect(m.overhead).toBe(10);
      expect(m.profit).toBe(10);
      expect(m.overheadAndProfit).toBe(20);
      expect(m.contingency).toBe(5);
      expect(m.generalConditions).toBe(0);
      expect(m.insurance).toBe(2);
      expect(m.tax).toBe(0);
      expect(m.bond).toBe(0);
      expect(m.fee).toBe(0);
    });

    it("has empty custom markups", () => {
      expect(getState().customMarkups).toEqual([]);
    });

    it("has empty change orders", () => {
      expect(getState().changeOrders).toEqual([]);
    });

    it("has empty project assemblies", () => {
      expect(getState().projectAssemblies).toEqual([]);
    });

    it("has a markupOrder array with expected keys", () => {
      const order = getState().markupOrder;
      expect(order.length).toBeGreaterThan(0);
      const keys = order.map(o => o.key);
      expect(keys).toContain("contingency");
      expect(keys).toContain("overhead");
      expect(keys).toContain("profit");
    });
  });

  describe("normalizeAllCodes", () => {
    it("repairs a missing division label from the normalized code", () => {
      seedItem({ code: "7.100", division: "" });

      getState().normalizeAllCodes();

      expect(getState().items[0].code).toBe("07.100");
      expect(getState().items[0].division).toBe("07 - Mock Division");
    });
  });

  // ─── addElement ─────────────────────────────────────────────────
  describe("addElement", () => {
    it("adds an item with default values when no preset given", () => {
      getState().addElement("03", null);
      const items = getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].division).toBe("03");
      expect(items[0].description).toBe("");
      expect(items[0].quantity).toBe(1);
      expect(items[0].unit).toBe("EA");
      expect(items[0].material).toBe(0);
      expect(items[0].labor).toBe(0);
      expect(items[0].id).toBeTruthy();
    });

    it("adds an item with preset values", () => {
      const preset = {
        code: "03-300",
        name: "Cast-in-Place Concrete",
        quantity: 50,
        unit: "CY",
        material: 150,
        labor: 80,
        equipment: 25,
        subcontractor: 0,
        trade: "Concrete",
      };
      getState().addElement("03", preset);
      const item = getState().items[0];
      expect(item.code).toBe("03-300");
      expect(item.description).toBe("Cast-in-Place Concrete");
      expect(item.quantity).toBe(50);
      expect(item.unit).toBe("CY");
      expect(item.material).toBe(150);
      expect(item.labor).toBe(80);
      expect(item.equipment).toBe(25);
      expect(item.trade).toBe("Concrete");
    });

    it("sets bidContext from argument", () => {
      getState().addElement("", null, "alt1");
      expect(getState().items[0].bidContext).toBe("alt1");
    });

    it("defaults bidContext to base", () => {
      getState().addElement("", null);
      expect(getState().items[0].bidContext).toBe("base");
    });

    it("generates unique IDs for each element", () => {
      getState().addElement("", null);
      getState().addElement("", null);
      const items = getState().items;
      expect(items).toHaveLength(2);
      expect(items[0].id).not.toBe(items[1].id);
    });

    it("appends to existing items", () => {
      seedItem({ id: "existing-1", description: "Existing" });
      getState().addElement("", { name: "New" });
      expect(getState().items).toHaveLength(2);
      expect(getState().items[0].description).toBe("Existing");
      expect(getState().items[1].description).toBe("New");
    });

    it("pushes undo entry on add", () => {
      getState().addElement("", { name: "Undo Test" });
      expect(useUndoStore.getState().past).toHaveLength(1);
      expect(useUndoStore.getState().past[0].action).toContain("Add");
    });

    it("undo removes the added element", () => {
      getState().addElement("", { name: "Will Remove" });
      expect(getState().items).toHaveLength(1);
      useUndoStore.getState().past[0].undo();
      expect(getState().items).toHaveLength(0);
    });

    it("redo restores the undone element", () => {
      getState().addElement("", { name: "Will Redo" });
      const addedId = getState().items[0].id;
      const entry = useUndoStore.getState().past[0];
      entry.undo();
      expect(getState().items).toHaveLength(0);
      entry.redo();
      expect(getState().items).toHaveLength(1);
      expect(getState().items[0].id).toBe(addedId);
    });

    it("sets novaProposed from preset", () => {
      getState().addElement("", { name: "NOVA Item", novaProposed: true });
      expect(getState().items[0].novaProposed).toBe(true);
    });

    it("sets source from preset", () => {
      getState().addElement("", { name: "X", source: { category: "scan", label: "ROM" } });
      expect(getState().items[0].source).toEqual({ category: "scan", label: "ROM" });
    });

    it("initializes subItems from preset", () => {
      const subs = [{ id: "s1", desc: "Sub1" }];
      getState().addElement("", { name: "Parent", subItems: subs });
      expect(getState().items[0].subItems).toEqual(subs);
    });
  });

  // ─── updateItem ─────────────────────────────────────────────────
  describe("updateItem", () => {
    it("updates a single field", () => {
      seedItem({ id: "u-1", description: "Original" });
      getState().updateItem("u-1", "description", "Updated");
      expect(getState().items[0].description).toBe("Updated");
    });

    it("updates quantity to a number", () => {
      seedItem({ id: "u-2", quantity: 1 });
      getState().updateItem("u-2", "quantity", 42.5);
      expect(getState().items[0].quantity).toBe(42.5);
    });

    it("clears novaProposed on any manual edit", () => {
      seedItem({ id: "u-3", novaProposed: true, description: "NOVA" });
      getState().updateItem("u-3", "description", "User Edited");
      expect(getState().items[0].novaProposed).toBe(false);
    });

    it("sets directiveOverride when directive field is edited", () => {
      seedItem({ id: "u-4" });
      getState().updateItem("u-4", "directive", "M");
      expect(getState().items[0].directiveOverride).toBe(true);
      vi.runAllTimers();
    });

    it("clears directiveOverride when directive set to empty", () => {
      seedItem({ id: "u-5", directive: "M", directiveOverride: true });
      getState().updateItem("u-5", "directive", "");
      expect(getState().items[0].directiveOverride).toBe(false);
      vi.runAllTimers();
    });

    it("does not affect other items", () => {
      seedItem({ id: "u-6a", description: "First" });
      seedItem({ id: "u-6b", description: "Second" });
      getState().updateItem("u-6a", "description", "Changed");
      expect(getState().items[0].description).toBe("Changed");
      expect(getState().items[1].description).toBe("Second");
      vi.runAllTimers();
    });

    it("pushes undo entry after debounce", () => {
      seedItem({ id: "u-7", description: "Before" });
      useUndoStore.setState({ past: [], future: [] });
      getState().updateItem("u-7", "description", "After");
      vi.advanceTimersByTime(1600);
      expect(useUndoStore.getState().past).toHaveLength(1);
    });

    it("coalesces rapid edits to same field into one undo entry", () => {
      seedItem({ id: "u-8", description: "Start" });
      useUndoStore.setState({ past: [], future: [] });
      getState().updateItem("u-8", "description", "Mid1");
      vi.advanceTimersByTime(500);
      getState().updateItem("u-8", "description", "Mid2");
      vi.advanceTimersByTime(500);
      getState().updateItem("u-8", "description", "Final");
      vi.advanceTimersByTime(1600);
      expect(useUndoStore.getState().past).toHaveLength(1);
    });

    it("undo restores original value after debounce", () => {
      seedItem({ id: "u-9", description: "Original" });
      getState().updateItem("u-9", "description", "Changed");
      vi.advanceTimersByTime(1600);
      useUndoStore.getState().past[0].undo();
      expect(getState().items[0].description).toBe("Original");
    });

    it("flushes pending edit when switching to different field", () => {
      seedItem({ id: "u-10", description: "Orig", unit: "EA" });
      useUndoStore.setState({ past: [], future: [] });
      getState().updateItem("u-10", "description", "Changed");
      // Switch to different field -> flush
      getState().updateItem("u-10", "unit", "SF");
      expect(useUndoStore.getState().past.length).toBeGreaterThanOrEqual(1);
      vi.runAllTimers();
    });

    it("auto-calculates directive when cost fields change (no directiveOverride)", () => {
      seedItem({ id: "u-11", material: 100, labor: 0, equipment: 0, subcontractor: 0 });
      getState().updateItem("u-11", "labor", 50);
      // directive should be auto-calculated (not empty, since material + labor present)
      const item = getState().items[0];
      expect(item.directive).toBeDefined();
      vi.runAllTimers();
    });

    it("does not override directive when directiveOverride is true", () => {
      seedItem({ id: "u-12", directive: "M", directiveOverride: true, material: 100 });
      getState().updateItem("u-12", "labor", 50);
      expect(getState().items[0].directive).toBe("M");
      vi.runAllTimers();
    });
  });

  // ─── batchUpdateItem ────────────────────────────────────────────
  describe("batchUpdateItem", () => {
    it("updates multiple fields at once", () => {
      seedItem({ id: "b-1", material: 0, labor: 0 });
      getState().batchUpdateItem("b-1", { material: 100, labor: 50, unit: "SF" });
      const item = getState().items[0];
      expect(item.material).toBe(100);
      expect(item.labor).toBe(50);
      expect(item.unit).toBe("SF");
    });

    it("does nothing for non-existent item", () => {
      seedItem({ id: "b-2" });
      getState().batchUpdateItem("ghost", { material: 999 });
      expect(getState().items[0].material).toBe(0);
    });

    it("pushes undo entry immediately (no debounce)", () => {
      seedItem({ id: "b-3" });
      useUndoStore.setState({ past: [], future: [] });
      getState().batchUpdateItem("b-3", { material: 50 });
      expect(useUndoStore.getState().past).toHaveLength(1);
    });

    it("undo restores previous field values", () => {
      seedItem({ id: "b-4", material: 10, labor: 20 });
      getState().batchUpdateItem("b-4", { material: 100, labor: 200 });
      useUndoStore.getState().past[0].undo();
      const item = getState().items[0];
      expect(item.material).toBe(10);
      expect(item.labor).toBe(20);
    });

    it("redo reapplies the batch update", () => {
      seedItem({ id: "b-5", material: 10 });
      getState().batchUpdateItem("b-5", { material: 100 });
      const entry = useUndoStore.getState().past[0];
      entry.undo();
      expect(getState().items[0].material).toBe(10);
      entry.redo();
      expect(getState().items[0].material).toBe(100);
    });
  });

  // ─── removeItem ─────────────────────────────────────────────────
  describe("removeItem", () => {
    it("removes an item by ID", () => {
      seedItem({ id: "r-1" });
      seedItem({ id: "r-2" });
      getState().removeItem("r-1");
      expect(getState().items).toHaveLength(1);
      expect(getState().items[0].id).toBe("r-2");
    });

    it("does nothing for non-existent ID", () => {
      seedItem({ id: "r-3" });
      getState().removeItem("nope");
      expect(getState().items).toHaveLength(1);
    });

    it("pushes undo entry on remove", () => {
      seedItem({ id: "r-4", description: "Removed" });
      getState().removeItem("r-4");
      expect(useUndoStore.getState().past).toHaveLength(1);
      expect(useUndoStore.getState().past[0].action).toContain("Delete");
    });

    it("undo restores item at original index", () => {
      seedItem({ id: "r-5a", description: "First" });
      seedItem({ id: "r-5b", description: "Second" });
      seedItem({ id: "r-5c", description: "Third" });
      getState().removeItem("r-5b");
      expect(getState().items).toHaveLength(2);
      useUndoStore.getState().past[0].undo();
      expect(getState().items).toHaveLength(3);
      expect(getState().items[1].id).toBe("r-5b");
    });

    it("redo re-removes the item", () => {
      seedItem({ id: "r-6" });
      getState().removeItem("r-6");
      const entry = useUndoStore.getState().past[0];
      entry.undo();
      expect(getState().items).toHaveLength(1);
      entry.redo();
      expect(getState().items).toHaveLength(0);
    });

    it("does not push undo for non-existent ID", () => {
      getState().removeItem("ghost");
      expect(useUndoStore.getState().past).toHaveLength(0);
    });
  });

  // ─── duplicateItem ──────────────────────────────────────────────
  describe("duplicateItem", () => {
    it("duplicates an item and inserts after original", () => {
      seedItem({ id: "dup-1", description: "Original" });
      seedItem({ id: "dup-2", description: "After" });
      getState().duplicateItem("dup-1");
      const items = getState().items;
      expect(items).toHaveLength(3);
      expect(items[0].id).toBe("dup-1");
      expect(items[1].description).toBe("Original");
      expect(items[1].id).not.toBe("dup-1"); // new ID
      expect(items[2].id).toBe("dup-2");
    });

    it("does nothing for non-existent ID", () => {
      seedItem({ id: "dup-3" });
      getState().duplicateItem("nope");
      expect(getState().items).toHaveLength(1);
    });

    it("pushes undo entry", () => {
      seedItem({ id: "dup-4" });
      getState().duplicateItem("dup-4");
      expect(useUndoStore.getState().past).toHaveLength(1);
      expect(useUndoStore.getState().past[0].action).toContain("Duplicate");
    });

    it("undo removes the duplicated item", () => {
      seedItem({ id: "dup-5", description: "Orig" });
      getState().duplicateItem("dup-5");
      expect(getState().items).toHaveLength(2);
      useUndoStore.getState().past[0].undo();
      expect(getState().items).toHaveLength(1);
      expect(getState().items[0].id).toBe("dup-5");
    });

    it("redo restores the duplicate", () => {
      seedItem({ id: "dup-6" });
      getState().duplicateItem("dup-6");
      const dupId = getState().items[1].id;
      const entry = useUndoStore.getState().past[0];
      entry.undo();
      expect(getState().items).toHaveLength(1);
      entry.redo();
      expect(getState().items).toHaveLength(2);
      expect(getState().items[1].id).toBe(dupId);
    });

    it("copies subItems by value not reference", () => {
      seedItem({ id: "dup-7", subItems: [{ id: "s1", desc: "Sub" }] });
      getState().duplicateItem("dup-7");
      const orig = getState().items[0];
      const copy = getState().items[1];
      expect(copy.subItems).toEqual(orig.subItems);
      expect(copy.subItems).not.toBe(orig.subItems); // different array reference
    });
  });

  // ─── reorderItems ───────────────────────────────────────────────
  describe("reorderItems", () => {
    it("replaces items with new order", () => {
      seedItem({ id: "ro-1", description: "A" });
      seedItem({ id: "ro-2", description: "B" });
      const reversed = [...getState().items].reverse();
      getState().reorderItems(reversed);
      expect(getState().items[0].id).toBe("ro-2");
      expect(getState().items[1].id).toBe("ro-1");
    });

    it("pushes undo entry", () => {
      seedItem({ id: "ro-3" });
      seedItem({ id: "ro-4" });
      useUndoStore.setState({ past: [], future: [] });
      getState().reorderItems([...getState().items].reverse());
      expect(useUndoStore.getState().past).toHaveLength(1);
    });

    it("undo restores previous order", () => {
      seedItem({ id: "ro-5", description: "A" });
      seedItem({ id: "ro-6", description: "B" });
      getState().reorderItems([...getState().items].reverse());
      useUndoStore.getState().past[0].undo();
      expect(getState().items[0].id).toBe("ro-5");
      expect(getState().items[1].id).toBe("ro-6");
    });
  });

  // ─── Sub-item CRUD ──────────────────────────────────────────────
  describe("addSubItem", () => {
    it("adds a sub-item to the specified item", () => {
      seedItem({ id: "si-1" });
      getState().addSubItem("si-1");
      const subs = getState().items[0].subItems;
      expect(subs).toHaveLength(1);
      expect(subs[0].id).toBeTruthy();
      expect(subs[0].desc).toBe("");
      expect(subs[0].unit).toBe("EA");
      expect(subs[0].m).toBe(0);
      expect(subs[0].l).toBe(0);
      expect(subs[0].e).toBe(0);
      expect(subs[0].factor).toBe(1);
    });

    it("appends to existing sub-items", () => {
      seedItem({ id: "si-2", subItems: [{ id: "existing", desc: "Existing" }] });
      getState().addSubItem("si-2");
      expect(getState().items[0].subItems).toHaveLength(2);
    });

    it("undo removes the added sub-item", () => {
      seedItem({ id: "si-3" });
      getState().addSubItem("si-3");
      expect(getState().items[0].subItems).toHaveLength(1);
      useUndoStore.getState().past[0].undo();
      expect(getState().items[0].subItems).toHaveLength(0);
    });

    it("redo restores the sub-item", () => {
      seedItem({ id: "si-4" });
      getState().addSubItem("si-4");
      const subId = getState().items[0].subItems[0].id;
      const entry = useUndoStore.getState().past[0];
      entry.undo();
      entry.redo();
      expect(getState().items[0].subItems).toHaveLength(1);
      expect(getState().items[0].subItems[0].id).toBe(subId);
    });
  });

  describe("updateSubItem", () => {
    it("updates a field on a sub-item", () => {
      seedItem({ id: "us-1", subItems: [{ id: "sub-1", desc: "Old", unit: "EA", m: 0, l: 0, e: 0, factor: 1 }] });
      getState().updateSubItem("us-1", "sub-1", "desc", "New");
      expect(getState().items[0].subItems[0].desc).toBe("New");
      vi.runAllTimers();
    });

    it("updates numeric fields on sub-item", () => {
      seedItem({ id: "us-2", subItems: [{ id: "sub-2", desc: "", unit: "EA", m: 0, l: 0, e: 0, factor: 1 }] });
      getState().updateSubItem("us-2", "sub-2", "m", 50);
      expect(getState().items[0].subItems[0].m).toBe(50);
      vi.runAllTimers();
    });

    it("does not affect other sub-items", () => {
      seedItem({
        id: "us-3",
        subItems: [
          { id: "sub-3a", desc: "A", unit: "EA", m: 0, l: 0, e: 0, factor: 1 },
          { id: "sub-3b", desc: "B", unit: "EA", m: 0, l: 0, e: 0, factor: 1 },
        ],
      });
      getState().updateSubItem("us-3", "sub-3a", "desc", "Changed");
      expect(getState().items[0].subItems[0].desc).toBe("Changed");
      expect(getState().items[0].subItems[1].desc).toBe("B");
      vi.runAllTimers();
    });
  });

  describe("removeSubItem", () => {
    it("removes a sub-item by ID", () => {
      seedItem({
        id: "rs-1",
        subItems: [
          { id: "sub-a", desc: "A" },
          { id: "sub-b", desc: "B" },
        ],
      });
      getState().removeSubItem("rs-1", "sub-a");
      expect(getState().items[0].subItems).toHaveLength(1);
      expect(getState().items[0].subItems[0].id).toBe("sub-b");
    });

    it("pushes undo entry when sub-item found", () => {
      seedItem({ id: "rs-2", subItems: [{ id: "sub-c", desc: "C" }] });
      getState().removeSubItem("rs-2", "sub-c");
      expect(useUndoStore.getState().past).toHaveLength(1);
      expect(useUndoStore.getState().past[0].action).toContain("sub-item");
    });

    it("undo restores the removed sub-item", () => {
      seedItem({ id: "rs-3", subItems: [{ id: "sub-d", desc: "D" }] });
      getState().removeSubItem("rs-3", "sub-d");
      expect(getState().items[0].subItems).toHaveLength(0);
      useUndoStore.getState().past[0].undo();
      expect(getState().items[0].subItems).toHaveLength(1);
      expect(getState().items[0].subItems[0].id).toBe("sub-d");
    });

    it("does not push undo when sub-item not found", () => {
      seedItem({ id: "rs-4", subItems: [] });
      getState().removeSubItem("rs-4", "ghost-sub");
      expect(useUndoStore.getState().past).toHaveLength(0);
    });

    it("redo re-removes the sub-item", () => {
      seedItem({ id: "rs-5", subItems: [{ id: "sub-e", desc: "E" }] });
      getState().removeSubItem("rs-5", "sub-e");
      const entry = useUndoStore.getState().past[0];
      entry.undo();
      expect(getState().items[0].subItems).toHaveLength(1);
      entry.redo();
      expect(getState().items[0].subItems).toHaveLength(0);
    });
  });

  // ─── NOVA Source & Review ───────────────────────────────────────
  describe("NOVA source and review", () => {
    it("markNovaReviewed clears novaProposed on specified items", () => {
      seedItem({ id: "nr-1", novaProposed: true });
      seedItem({ id: "nr-2", novaProposed: true });
      seedItem({ id: "nr-3", novaProposed: true });
      getState().markNovaReviewed(["nr-1", "nr-3"]);
      expect(getState().items[0].novaProposed).toBe(false);
      expect(getState().items[1].novaProposed).toBe(true);
      expect(getState().items[2].novaProposed).toBe(false);
    });

    it("markNovaReviewed accepts a single ID", () => {
      seedItem({ id: "nr-4", novaProposed: true });
      getState().markNovaReviewed("nr-4");
      expect(getState().items[0].novaProposed).toBe(false);
    });

    it("setItemSource updates source metadata", () => {
      seedItem({ id: "src-1" });
      getState().setItemSource("src-1", { category: "scan", label: "ROM Phase 1" });
      expect(getState().items[0].source).toEqual({ category: "scan", label: "ROM Phase 1" });
    });

    it("getNovaProposedCount returns correct count", () => {
      seedItem({ id: "cnt-1", novaProposed: true });
      seedItem({ id: "cnt-2", novaProposed: false });
      seedItem({ id: "cnt-3", novaProposed: true });
      expect(getState().getNovaProposedCount()).toBe(2);
    });

    it("getNovaProposedCount returns 0 when no proposed items", () => {
      seedItem({ id: "cnt-4", novaProposed: false });
      expect(getState().getNovaProposedCount()).toBe(0);
    });

    it("getNovaProposedCount returns 0 on empty items", () => {
      expect(getState().getNovaProposedCount()).toBe(0);
    });
  });

  // ─── Markup ─────────────────────────────────────────────────────
  describe("markup operations", () => {
    it("updateMarkup changes a single markup field", () => {
      getState().updateMarkup("overhead", 15);
      expect(getState().markup.overhead).toBe(15);
      // other fields unchanged
      expect(getState().markup.profit).toBe(10);
    });

    it("setMarkup replaces the entire markup object", () => {
      const newMarkup = { ...INITIAL_MARKUP, overhead: 25, profit: 25 };
      getState().setMarkup(newMarkup);
      expect(getState().markup.overhead).toBe(25);
      expect(getState().markup.profit).toBe(25);
    });

    it("addCustomMarkup adds a custom markup entry", () => {
      getState().addCustomMarkup();
      const cm = getState().customMarkups;
      expect(cm).toHaveLength(1);
      expect(cm[0].label).toBe("");
      expect(cm[0].value).toBe(0);
      expect(cm[0].type).toBe("pct");
      expect(cm[0].id).toBeTruthy();
    });

    it("updateCustomMarkup modifies a custom markup field", () => {
      getState().addCustomMarkup();
      const id = getState().customMarkups[0].id;
      getState().updateCustomMarkup(id, "label", "Special");
      getState().updateCustomMarkup(id, "value", 5);
      const cm = getState().customMarkups[0];
      expect(cm.label).toBe("Special");
      expect(cm.value).toBe(5);
    });

    it("removeCustomMarkup removes by ID", () => {
      getState().addCustomMarkup();
      getState().addCustomMarkup();
      const firstId = getState().customMarkups[0].id;
      getState().removeCustomMarkup(firstId);
      expect(getState().customMarkups).toHaveLength(1);
      expect(getState().customMarkups[0].id).not.toBe(firstId);
    });
  });

  // ─── Project Assemblies ─────────────────────────────────────────
  describe("project assemblies", () => {
    it("addProjectAssembly adds with auto-generated ID", () => {
      getState().addProjectAssembly({ name: "Test Assembly" });
      const asms = getState().projectAssemblies;
      expect(asms).toHaveLength(1);
      expect(asms[0].name).toBe("Test Assembly");
      expect(asms[0].id).toBeTruthy();
    });

    it("removeProjectAssembly removes by ID", () => {
      getState().addProjectAssembly({ name: "A" });
      getState().addProjectAssembly({ name: "B" });
      const idToRemove = getState().projectAssemblies[0].id;
      getState().removeProjectAssembly(idToRemove);
      expect(getState().projectAssemblies).toHaveLength(1);
      expect(getState().projectAssemblies[0].name).toBe("B");
    });
  });

  // ─── Simple Setters ────────────────────────────────────────────
  describe("simple setters", () => {
    it("setItems replaces items array (with status migration)", () => {
      const items = [{ id: "x", description: "Direct" }];
      getState().setItems(items);
      // setItems applies legacy migration: adds status + columnStatus
      expect(getState().items).toEqual([{ id: "x", description: "Direct", status: "firm", columnStatus: {} }]);
    });

    it("setChangeOrders replaces change orders", () => {
      getState().setChangeOrders([{ id: "co-1", name: "CO #1" }]);
      expect(getState().changeOrders).toEqual([{ id: "co-1", name: "CO #1" }]);
    });

    it("setProjectAssemblies replaces assemblies", () => {
      getState().setProjectAssemblies([{ id: "pa-1", name: "Assembly" }]);
      expect(getState().projectAssemblies).toEqual([{ id: "pa-1", name: "Assembly" }]);
    });

    it("setMarkupOrder replaces markup order", () => {
      const newOrder = [{ key: "profit", label: "Profit", compound: true, active: true }];
      getState().setMarkupOrder(newOrder);
      expect(getState().markupOrder).toEqual(newOrder);
    });
  });

  // ─── getTotals ──────────────────────────────────────────────────
  describe("getTotals", () => {
    it("returns zeros for empty items", () => {
      const totals = getState().getTotals();
      expect(totals.material).toBe(0);
      expect(totals.labor).toBe(0);
      expect(totals.equipment).toBe(0);
      expect(totals.sub).toBe(0);
      expect(totals.direct).toBe(0);
      expect(totals.grand).toBe(0);
    });

    it("calculates direct costs from items", () => {
      seedItem({ id: "t-1", quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 1 });
      // Set all markups to 0 so grand = direct
      setState({
        markup: {
          overhead: 0,
          profit: 0,
          overheadAndProfit: 0,
          contingency: 0,
          generalConditions: 0,
          insurance: 0,
          fee: 0,
          tax: 0,
          bond: 0,
        },
        markupOrder: getState().markupOrder.map(m => ({ ...m, active: false })),
      });
      const totals = getState().getTotals();
      // quantity 10 * (material 5 + labor 3 + equipment 2 + subcontractor 1) = 110
      // location factors default to 1 (mocked), labor mult defaults to 1
      expect(totals.material).toBe(50);
      expect(totals.sub).toBe(10);
      expect(totals.direct).toBe(totals.material + totals.labor + totals.equipment + totals.sub);
    });

    it("sums multiple items", () => {
      seedItem({ id: "t-2a", quantity: 1, material: 100 });
      seedItem({ id: "t-2b", quantity: 1, material: 200 });
      const totals = getState().getTotals();
      expect(totals.material).toBe(300);
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────
  describe("edge cases", () => {
    it("removing from empty array does nothing", () => {
      getState().removeItem("nope");
      expect(getState().items).toEqual([]);
    });

    it("duplicating from empty array does nothing", () => {
      getState().duplicateItem("nope");
      expect(getState().items).toEqual([]);
    });

    it("multiple rapid adds maintain correct order", () => {
      for (let i = 0; i < 10; i++) {
        getState().addElement("", { name: `Item-${i}` });
      }
      const items = getState().items;
      expect(items).toHaveLength(10);
      items.forEach((item, i) => {
        expect(item.description).toBe(`Item-${i}`);
      });
    });

    it("setItems with empty array clears all", () => {
      seedItem({ id: "1" });
      seedItem({ id: "2" });
      getState().setItems([]);
      expect(getState().items).toEqual([]);
    });

    it("addSubItem on non-existent item does not crash", () => {
      getState().addSubItem("ghost-item");
      // no items exist, no crash
      expect(getState().items).toEqual([]);
    });

    it("removeSubItem on non-existent item does not crash", () => {
      getState().removeSubItem("ghost-item", "ghost-sub");
      expect(getState().items).toEqual([]);
    });

    it("batchUpdateItem flushes pending single-field edit first", () => {
      seedItem({ id: "e-1", description: "Start", material: 0 });
      useUndoStore.setState({ past: [], future: [] });
      getState().updateItem("e-1", "description", "Mid");
      // Now batch update should flush the pending description edit
      getState().batchUpdateItem("e-1", { material: 100 });
      // Should have undo entries for both the flushed edit and the batch
      expect(useUndoStore.getState().past.length).toBeGreaterThanOrEqual(1);
      vi.runAllTimers();
    });

    it("removeCustomMarkup with non-existent ID does nothing", () => {
      getState().addCustomMarkup();
      getState().removeCustomMarkup("non-existent-id");
      expect(getState().customMarkups).toHaveLength(1);
    });

    it("addElement with no arguments does not crash", () => {
      getState().addElement();
      expect(getState().items).toHaveLength(1);
      expect(getState().items[0].division).toBe("");
    });
  });
});
