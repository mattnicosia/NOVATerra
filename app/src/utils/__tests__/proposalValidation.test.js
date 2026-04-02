import { vi } from "vitest";

// Mock location factors so gate5 resolves deterministically
vi.mock("@/constants/locationFactors", () => ({
  resolveLocationFactors: (zip) => {
    if (zip === "10001") {
      return { label: "New York, NY", source: "metro", mat: 1.15, lab: 1.45, equip: 1.05 };
    }
    if (zip === "99999") {
      return { label: "Unknown", source: "none", mat: 1.0, lab: 1.0, equip: 1.0 };
    }
    return { label: "National Average", source: "state", mat: 1.0, lab: 1.0, equip: 1.0 };
  },
}));

import { validateProposal } from "@/utils/proposalValidation";

// ── Helpers ────────────────────────────────────────────────────

function makeValidProposal(overrides = {}) {
  return {
    id: "prop-1",
    projectName: "Test Office Build",
    totalCost: 2000000,
    projectSF: 10000,
    jobType: "commercial-office",
    zipCode: "10001",
    divisions: {
      "03": 300000,
      "05": 200000,
      "09": 400000,
      "22": 150000,
      "23": 250000,
      "26": 300000,
      "01": 200000,
      "07": 100000,
      "08": 100000,
    },
    ...overrides,
  };
}

function makeSimilarProposals(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `existing-${i}`,
    projectName: `Other Project ${i}`,
    totalCost: 1800000 + i * 50000,
    projectSF: 10000,
    jobType: "commercial-office",
    zipCode: "10001",
    divisions: { "03": 300000, "09": 400000, "26": 300000 },
    ...overrides,
  }));
}

// ── Tests ──────────────────────────────────────────────────────

describe("validateProposal", () => {
  describe("valid proposal", () => {
    it("passes all gates and returns ACCEPTED", () => {
      const proposal = makeValidProposal();
      const result = validateProposal(proposal, []);

      expect(result.overallStatus).toBe("ACCEPTED");
      expect(result.usableFor).toContain("sf_calibration");
      expect(result.usableFor).toContain("markup_calibration");
      expect(result.gates.gate1.status).toBe("PASS");
      expect(result.gates.gate2.status).toBe("PASS");
    });

    it("includes a timestamp", () => {
      const result = validateProposal(makeValidProposal(), []);
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });
  });

  // ── Gate 1: Required Fields ──

  describe("gate1 — required fields", () => {
    it("rejects when totalCost is missing and no divisions", () => {
      const proposal = makeValidProposal({ totalCost: 0, divisions: {} });
      const result = validateProposal(proposal, []);

      expect(result.gates.gate1.status).toBe("REJECT");
      expect(result.overallStatus).toBe("REJECTED");
    });

    it("rejects when projectSF is missing (MARKUP_ONLY if divisions present)", () => {
      const proposal = makeValidProposal({ projectSF: 0 });
      const result = validateProposal(proposal, []);

      expect(result.gates.gate1.status).toBe("REJECT");
      expect(result.gates.gate1.details.missingSF).toBe(true);
      // Should be MARKUP_ONLY since it has divisions
      expect(result.overallStatus).toBe("MARKUP_ONLY");
      expect(result.usableFor).toContain("markup_calibration");
    });

    it("warns when building type is missing", () => {
      const proposal = makeValidProposal({ jobType: null, buildingType: null });
      const result = validateProposal(proposal, []);

      expect(result.gates.gate1.status).toBe("WARN");
      expect(result.overallStatus).toBe("FLAGGED");
    });
  });

  // ── Gate 2: Sanity Bounds ──

  describe("gate2 — sanity bounds", () => {
    it("rejects when $/SF is far below minimum", () => {
      // commercial-office min is 80. Far below = < 80 * 0.5 = 40
      // totalCost / SF < 40 => totalCost < 40 * 10000 = 400000
      const proposal = makeValidProposal({ totalCost: 100000 }); // $10/SF
      const result = validateProposal(proposal, []);

      expect(result.gates.gate2.status).toBe("REJECT");
      expect(result.gates.gate2.details.perSFFlag).toBe("far_below");
    });

    it("warns when $/SF is below minimum but not extreme", () => {
      // Below 80 but above 40 => below flag
      const proposal = makeValidProposal({ totalCost: 600000 }); // $60/SF
      const result = validateProposal(proposal, []);

      expect(result.gates.gate2.status).toBe("WARN");
      expect(result.gates.gate2.details.perSFFlag).toBe("below");
    });

    it("passes when $/SF is within bounds", () => {
      // $200/SF for commercial-office (bounds: 80-800)
      const proposal = makeValidProposal();
      const result = validateProposal(proposal, []);

      expect(result.gates.gate2.status).toBe("PASS");
    });

    it("skips when no SF available", () => {
      const proposal = makeValidProposal({ projectSF: 0 });
      const result = validateProposal(proposal, []);

      expect(result.gates.gate2.details.skipped).toBe(true);
    });
  });

  // ── Gate 3: Outlier Detection ──

  describe("gate3 — outlier detection", () => {
    it("passes with insufficient similar proposals (< 3)", () => {
      const proposal = makeValidProposal();
      const result = validateProposal(proposal, []);

      expect(result.gates.gate3.status).toBe("PASS");
      expect(result.gates.gate3.details.skipped || result.gates.gate3.details.similarCount < 3).toBe(true);
    });

    it("rejects extreme outlier (> 3 std devs from mean)", () => {
      // Existing proposals all cluster around $180-200/SF
      const similars = makeSimilarProposals(5);
      // New proposal at $2000/SF is way outside
      const proposal = makeValidProposal({
        id: "outlier",
        totalCost: 20000000,
        projectSF: 10000,
      });

      const result = validateProposal(proposal, similars);
      expect(result.gates.gate3.status).toBe("REJECT");
      expect(Math.abs(result.gates.gate3.details.zScore)).toBeGreaterThan(3);
    });

    it("warns on moderate outlier (> 2 std devs)", () => {
      const similars = makeSimilarProposals(10);
      // Compute the mean to find a value ~2.5 std devs away
      const perSFs = similars.map((p) => p.totalCost / p.projectSF);
      const mean = perSFs.reduce((s, v) => s + v, 0) / perSFs.length;
      const variance = perSFs.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / perSFs.length;
      const stdDev = Math.sqrt(variance);

      const targetPerSF = mean + 2.5 * stdDev;
      const proposal = makeValidProposal({
        id: "moderate-outlier",
        totalCost: Math.round(targetPerSF * 10000),
        projectSF: 10000,
      });

      const result = validateProposal(proposal, similars);
      // Should be WARN (2 < z < 3) or REJECT (z > 3) depending on exact distribution
      expect(["WARN", "REJECT"]).toContain(result.gates.gate3.status);
    });
  });

  // ── Gate 4: Duplicate Detection ──

  describe("gate4 — duplicate detection", () => {
    it("passes when no duplicates exist", () => {
      const proposal = makeValidProposal({ projectName: "Unique Project ABC" });
      const existing = makeSimilarProposals(3);
      const result = validateProposal(proposal, existing);

      expect(result.gates.gate4.status).toBe("PASS");
    });

    it("warns on exact name match with similar cost", () => {
      const proposal = makeValidProposal({ projectName: "Test Office Build", totalCost: 2000000 });
      const existing = [
        { id: "dup-1", projectName: "Test Office Build", totalCost: 2010000, projectSF: 10000, jobType: "commercial-office" },
      ];
      const result = validateProposal(proposal, existing);

      expect(result.gates.gate4.status).toBe("WARN");
      expect(result.gates.gate4.details.duplicateType).toBe("exact");
    });

    it("passes on same name but different cost (revision)", () => {
      const proposal = makeValidProposal({ projectName: "Test Office Build", totalCost: 2000000 });
      const existing = [
        { id: "rev-1", projectName: "Test Office Build", totalCost: 3500000, projectSF: 10000, jobType: "commercial-office" },
      ];
      const result = validateProposal(proposal, existing);

      expect(result.gates.gate4.status).toBe("PASS");
      expect(result.gates.gate4.details.duplicateType).toBe("revision");
    });
  });

  // ── Gate 5: Normalization ──

  describe("gate5 — normalization", () => {
    it("passes with valid ZIP that resolves", () => {
      const proposal = makeValidProposal({ zipCode: "10001" });
      const result = validateProposal(proposal, []);

      expect(result.gates.gate5.status).toBe("PASS");
      expect(result.gates.gate5.details.locationResolved).toBe(true);
    });

    it("warns when no ZIP is provided", () => {
      const proposal = makeValidProposal({ zipCode: "", location: "" });
      const result = validateProposal(proposal, []);

      expect(result.gates.gate5.status).toBe("WARN");
      expect(result.gates.gate5.details.hasZip).toBe(false);
    });

    it("warns when ZIP does not resolve", () => {
      const proposal = makeValidProposal({ zipCode: "99999" });
      const result = validateProposal(proposal, []);

      expect(result.gates.gate5.status).toBe("WARN");
      expect(result.gates.gate5.details.locationResolved).toBe(false);
    });
  });

  // ── Overall status logic ──

  describe("overall status", () => {
    it("FLAGGED when any gate warns but none reject", () => {
      // Missing building type triggers WARN in gate1
      const proposal = makeValidProposal({ jobType: null, buildingType: null });
      const result = validateProposal(proposal, []);

      expect(result.overallStatus).toBe("FLAGGED");
      expect(result.usableFor).toContain("sf_calibration");
      expect(result.usableFor).toContain("markup_calibration");
    });

    it("REJECTED when a gate rejects and it is not MARKUP_ONLY eligible", () => {
      const proposal = makeValidProposal({ totalCost: 0, divisions: {} });
      const result = validateProposal(proposal, []);

      expect(result.overallStatus).toBe("REJECTED");
      expect(result.usableFor).toEqual([]);
    });
  });
});
