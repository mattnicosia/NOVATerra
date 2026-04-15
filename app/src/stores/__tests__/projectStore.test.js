import { describe, it, expect, beforeEach, vi } from "vitest";
import { sortDivisionNames } from "@/utils/csiFormat";

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

  // ── 8. Division ordering behavior ─────────────────────────────────

  describe("getDivisions behavior", () => {
    it("returns display-format strings (code - name)", () => {
      const divs = getState().getDivisions();
      divs.forEach(d => {
        expect(d).toMatch(/^\d{2} - .+/);
      });
    });

    it("includes standard CSI divisions", () => {
      const divs = getState().getDivisions();
      const codes = divs.map(d => d.split(" - ")[0]);
      expect(codes).toContain("03");
      expect(codes).toContain("06");
      expect(codes).toContain("09");
      expect(codes).toContain("26");
    });

    it("does not include hidden divisions", () => {
      getState().setHiddenCodes({ "csi-commercial": { divisions: ["05"], subdivisions: [] } });
      const divs = getState().getDivisions();
      const codes = divs.map(d => d.split(" - ")[0]);
      expect(codes).not.toContain("05");
    });

    it("sorts correctly with sortDivisionNames at consumer level", () => {
      const divs = getState().getDivisions();
      const sorted = [...divs].sort(sortDivisionNames);
      const codes = sorted.map(d => parseInt(d.split(" - ")[0], 10));
      for (let i = 1; i < codes.length; i++) {
        expect(codes[i]).toBeGreaterThanOrEqual(codes[i - 1]);
      }
    });
  });

  // ── 9. divFromCode stability ─────────────────────────────────────

  describe("divFromCode", () => {
    it("returns consistent display format for subdivision code", () => {
      expect(getState().divFromCode("03.300")).toBe("03 - Concrete");
    });

    it("returns consistent display format for bare division code", () => {
      expect(getState().divFromCode("03")).toBe("03 - Concrete");
    });

    it("produces same output for same input (stability)", () => {
      const r1 = getState().divFromCode("06.110");
      const r2 = getState().divFromCode("06.110");
      expect(r1).toBe(r2);
    });

    it("normalizes single-digit codes", () => {
      const result = getState().divFromCode("3");
      expect(result).toMatch(/^03/);
    });

    it("returns empty string for falsy input", () => {
      expect(getState().divFromCode("")).toBe("");
      expect(getState().divFromCode(null)).toBe("");
      expect(getState().divFromCode(undefined)).toBe("");
    });
  });
});
