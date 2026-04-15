import { describe, it, expect, vi, beforeEach } from "vitest";
import { sortDivisionNames, sortCodes } from "@/utils/csiFormat";

/**
 * Cross-consumer ordering consistency test.
 *
 * WHAT THIS PROVES: Every consumer of division data — projectStore.getDivisions(),
 * ROM division output, and XLSX export — produces the identical CSI numeric order
 * when using sortDivisionNames/sortCodes.
 *
 * One expected-order list, three consumers must match.
 */

// ── Mock dependencies for store imports ──────────────────────────────
vi.mock("@/utils/storage", () => ({
  storage: { get: vi.fn().mockResolvedValue(undefined), set: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/utils/cloudSync", () => ({
  pushEstimate: vi.fn(), pushData: vi.fn(), deleteEstimate: vi.fn(), syncIndexColumns: vi.fn(),
  readLocalEstimateRecord: vi.fn().mockResolvedValue({ exists: true, corrupted: false, data: { project: {} } }),
}));
vi.mock("@/utils/idbKey", () => ({ idbKey: k => k }));

import { useProjectStore } from "@/stores/projectStore";

// ═════════════════════════════════════════════════════════════════════
// The single source of truth for expected CSI order
// ═════════════════════════════════════════════════════════════════════
const EXPECTED_ORDER = ["03", "06", "09", "22", "26"];

const EXPECTED_DISPLAY_ORDER = [
  "03 - Concrete",
  "06 - Wood, Plastics & Composites",
  "09 - Finishes",
  "22 - Plumbing",
  "26 - Electrical",
];

// ═════════════════════════════════════════════════════════════════════
// Consumer 1: projectStore.getDivisions()
// ═════════════════════════════════════════════════════════════════════

describe("Cross-consumer division ordering consistency", () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject();
    vi.clearAllMocks();
  });

  it("projectStore.getDivisions() sorted with sortDivisionNames produces CSI numeric order", () => {
    const divs = useProjectStore.getState().getDivisions();
    // getDivisions returns unsorted — consumer applies sortDivisionNames
    const sorted = [...divs].sort(sortDivisionNames);
    const codes = sorted.map(d => d.split(" - ")[0]);
    for (let i = 1; i < codes.length; i++) {
      const prev = parseInt(codes[i - 1], 10);
      const curr = parseInt(codes[i], 10);
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("projectStore.getDivisions() includes our test divisions in correct relative order after sorting", () => {
    const divs = useProjectStore.getState().getDivisions();
    const sorted = [...divs].sort(sortDivisionNames);
    const filtered = sorted.filter(d => EXPECTED_ORDER.includes(d.split(" - ")[0]));
    expect(filtered).toEqual(EXPECTED_DISPLAY_ORDER);
  });

  // ═════════════════════════════════════════════════════════════════
  // Consumer 2: ROM division output (simulated)
  // ═════════════════════════════════════════════════════════════════

  it("ROM division keys sorted with sortDivisionNames match expected order", () => {
    // Simulate ROM output with shuffled division keys
    const romDivisions = {
      "26": { label: "Electrical", total: { mid: 50000 } },
      "03": { label: "Concrete", total: { mid: 120000 } },
      "22": { label: "Plumbing", total: { mid: 40000 } },
      "09": { label: "Finishes", total: { mid: 80000 } },
      "06": { label: "Wood", total: { mid: 60000 } },
    };

    const sorted = Object.entries(romDivisions)
      .sort(([a], [b]) => sortDivisionNames(a, b))
      .map(([code]) => code);

    expect(sorted).toEqual(EXPECTED_ORDER);
  });

  // ═════════════════════════════════════════════════════════════════
  // Consumer 3: XLSX export division summary (simulated)
  // ═════════════════════════════════════════════════════════════════

  it("export division summary sorted with sortDivisionNames matches expected order", () => {
    // Simulate export divData keyed by display name
    const divData = {
      "26 - Electrical": { count: 5, total: 50000 },
      "03 - Concrete": { count: 8, total: 120000 },
      "22 - Plumbing": { count: 3, total: 40000 },
      "09 - Finishes": { count: 10, total: 80000 },
      "06 - Wood, Plastics & Composites": { count: 6, total: 60000 },
    };

    const sorted = Object.entries(divData)
      .sort(([a], [b]) => sortDivisionNames(a, b))
      .map(([name]) => name);

    expect(sorted).toEqual(EXPECTED_DISPLAY_ORDER);
  });

  // ═════════════════════════════════════════════════════════════════
  // Cross-consumer: all three match
  // ═════════════════════════════════════════════════════════════════

  it("all three consumers produce identical ordering for the same divisions", () => {
    // Consumer 1: projectStore (sorted at consumer level)
    const storeDivs = useProjectStore.getState().getDivisions();
    const storeFiltered = [...storeDivs]
      .sort(sortDivisionNames)
      .filter(d => EXPECTED_ORDER.includes(d.split(" - ")[0]))
      .map(d => d.split(" - ")[0]);

    // Consumer 2: ROM-style sort
    const romKeys = ["26", "03", "22", "09", "06"];
    const romSorted = [...romKeys].sort(sortDivisionNames);

    // Consumer 3: Export-style sort
    const exportKeys = ["26 - Electrical", "03 - Concrete", "22 - Plumbing", "09 - Finishes", "06 - Wood, Plastics & Composites"];
    const exportSorted = [...exportKeys].sort(sortDivisionNames).map(d => d.split(" - ")[0]);

    // All three must produce identical code ordering
    expect(storeFiltered).toEqual(EXPECTED_ORDER);
    expect(romSorted).toEqual(EXPECTED_ORDER);
    expect(exportSorted).toEqual(EXPECTED_ORDER);
  });

  // ═════════════════════════════════════════════════════════════════
  // Subdivision ordering consistency
  // ═════════════════════════════════════════════════════════════════

  it("sortCodes produces consistent subdivision ordering", () => {
    const subs = ["03.300", "03.100", "03.200", "06.110", "06.100", "09.200"];
    const sorted = [...subs].sort(sortCodes);

    // Verify sorted within each division
    expect(sorted.indexOf("03.100")).toBeLessThan(sorted.indexOf("03.200"));
    expect(sorted.indexOf("03.200")).toBeLessThan(sorted.indexOf("03.300"));
    expect(sorted.indexOf("06.100")).toBeLessThan(sorted.indexOf("06.110"));

    // Verify sorted across divisions
    expect(sorted.indexOf("03.300")).toBeLessThan(sorted.indexOf("06.100"));
    expect(sorted.indexOf("06.110")).toBeLessThan(sorted.indexOf("09.200"));
  });

  // ═════════════════════════════════════════════════════════════════
  // divFromCode stability
  // ═════════════════════════════════════════════════════════════════

  it("divFromCode produces stable, normalized output", () => {
    const store = useProjectStore.getState();
    // Same code, same output every time
    const result1 = store.divFromCode("03.300");
    const result2 = store.divFromCode("03.300");
    expect(result1).toBe(result2);
    expect(result1).toBe("03 - Concrete");

    // Different input formats, same division
    const fromSub = store.divFromCode("03.300");
    const fromDiv = store.divFromCode("03");
    expect(fromSub).toBe(fromDiv);
  });
});
