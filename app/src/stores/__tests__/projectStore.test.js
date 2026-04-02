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

// ── Import the store under test ─────────────────────────────────────
import { useProjectStore } from "@/stores/projectStore";

const getState = () => useProjectStore.getState();
const setState = s => useProjectStore.setState(s);

// ═════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════

describe("projectStore", () => {
  beforeEach(() => {
    getState().resetProject();
    vi.clearAllMocks();
  });

  // ── 1. Initial / default state ─────────────────────────────────────

  describe("initial state", () => {
    it("has a project object with default name 'New Estimate'", () => {
      expect(getState().project.name).toBe("New Estimate");
    });

    it("defaults to csi-commercial code system", () => {
      expect(getState().codeSystem).toBe("csi-commercial");
    });

    it("defaults bidType to 'Hard Bid'", () => {
      expect(getState().project.bidType).toBe("Hard Bid");
    });

    it("defaults status to 'Bidding'", () => {
      expect(getState().project.status).toBe("Bidding");
    });

    it("defaults laborType to 'open_shop'", () => {
      expect(getState().project.laborType).toBe("open_shop");
    });

    it("has empty customCodes and hiddenCodes", () => {
      expect(getState().customCodes).toEqual({});
      expect(getState().hiddenCodes).toEqual({});
    });

    it("has setupComplete defaulting to true", () => {
      expect(getState().project.setupComplete).toBe(true);
    });

    it("has empty coEstimators array", () => {
      expect(getState().project.coEstimators).toEqual([]);
    });

    it("has empty floors array", () => {
      expect(getState().project.floors).toEqual([]);
    });
  });

  // ── 2. setProject ──────────────────────────────────────────────────

  describe("setProject", () => {
    it("replaces the entire project object", () => {
      const custom = { name: "Custom Project", client: "Test Client" };
      getState().setProject(custom);
      expect(getState().project.name).toBe("Custom Project");
      expect(getState().project.client).toBe("Test Client");
    });
  });

  // ── 3. updateProject ───────────────────────────────────────────────

  describe("updateProject", () => {
    it("updates a single field on the project", () => {
      getState().updateProject("name", "Updated Name");
      expect(getState().project.name).toBe("Updated Name");
    });

    it("preserves other fields when updating one", () => {
      getState().updateProject("client", "ACME Corp");
      expect(getState().project.name).toBe("New Estimate");
      expect(getState().project.client).toBe("ACME Corp");
    });

    it("can update nested-like fields (zipCode, laborType)", () => {
      getState().updateProject("zipCode", "10001");
      getState().updateProject("laborType", "union");
      expect(getState().project.zipCode).toBe("10001");
      expect(getState().project.laborType).toBe("union");
    });
  });

  // ── 4. resetProject ────────────────────────────────────────────────

  describe("resetProject", () => {
    it("resets project back to blank defaults", () => {
      getState().updateProject("name", "Should Be Reset");
      getState().updateProject("client", "Gone");
      getState().resetProject();
      expect(getState().project.name).toBe("New Estimate");
      expect(getState().project.client).toBe("");
    });

    it("resets codeSystem to csi-commercial", () => {
      getState().setCodeSystem("uniformat");
      getState().resetProject();
      expect(getState().codeSystem).toBe("csi-commercial");
    });

    it("clears customCodes and hiddenCodes", () => {
      getState().setCustomCodes({ "csi-commercial": { "99": { name: "Test", subs: {} } } });
      getState().setHiddenCodes({ "csi-commercial": { divisions: ["05"] } });
      getState().resetProject();
      expect(getState().customCodes).toEqual({});
      expect(getState().hiddenCodes).toEqual({});
    });
  });

  // ── 5. setCodeSystem ───────────────────────────────────────────────

  describe("setCodeSystem", () => {
    it("sets the code system", () => {
      getState().setCodeSystem("uniformat");
      expect(getState().codeSystem).toBe("uniformat");
    });
  });

  // ── 6. Custom code CRUD ────────────────────────────────────────────

  describe("addDivision", () => {
    it("adds a custom division to the current code system", () => {
      getState().addDivision("99", "Custom Division");
      const codes = getState().customCodes["csi-commercial"];
      expect(codes).toBeDefined();
      expect(codes["99"].name).toBe("Custom Division");
      expect(codes["99"].subs).toEqual({});
    });

    it("does not overwrite an existing division", () => {
      getState().addDivision("99", "First");
      getState().addDivision("99", "Second");
      expect(getState().customCodes["csi-commercial"]["99"].name).toBe("First");
    });
  });

  describe("renameDivision", () => {
    it("renames an existing custom division", () => {
      getState().addDivision("99", "Old Name");
      getState().renameDivision("99", "New Name");
      expect(getState().customCodes["csi-commercial"]["99"].name).toBe("New Name");
    });

    it("is a no-op for a nonexistent division", () => {
      const before = getState().customCodes;
      getState().renameDivision("88", "Ghost");
      expect(getState().customCodes).toEqual(before);
    });
  });

  // ── 7. setCustomCodes / setHiddenCodes ─────────────────────────────

  describe("setCustomCodes / setHiddenCodes", () => {
    it("sets custom codes directly", () => {
      const codes = { "csi-commercial": { "50": { name: "Test", subs: {} } } };
      getState().setCustomCodes(codes);
      expect(getState().customCodes).toEqual(codes);
    });

    it("sets hidden codes directly", () => {
      const hidden = { "csi-commercial": { divisions: ["05", "14"], subdivisions: [] } };
      getState().setHiddenCodes(hidden);
      expect(getState().hiddenCodes).toEqual(hidden);
    });
  });
});
