import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock external dependencies BEFORE importing the store ──────────
vi.mock("@/utils/format", () => {
  let counter = 0;
  return { uid: () => `test-uid-${++counter}` };
});

vi.mock("@/constants/tradeGroupings", () => ({
  fuzzyMatchTrade: vi.fn(text => (text ? [text] : [])),
}));

import { useMasterDataStore, migrateSubcontractorSchema } from "@/stores/masterDataStore";

// Helper to get/set store
const store = () => useMasterDataStore.getState();
const _act = fn => fn;

describe("masterDataStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useMasterDataStore.setState(useMasterDataStore.getInitialState());
  });

  // ─── Initial State ───────────────────────────────────────────────
  describe("initial state", () => {
    it("has empty arrays for all contact categories", () => {
      const md = store().masterData;
      expect(md.clients).toEqual([]);
      expect(md.architects).toEqual([]);
      expect(md.engineers).toEqual([]);
      expect(md.estimators).toEqual([]);
      expect(md.subcontractors).toEqual([]);
    });

    it("has empty historicalProposals array", () => {
      expect(store().masterData.historicalProposals).toEqual([]);
    });

    it("has empty companyProfiles array", () => {
      expect(store().masterData.companyProfiles).toEqual([]);
    });

    it("has default jobTypes populated", () => {
      const jt = store().masterData.jobTypes;
      expect(jt.length).toBeGreaterThan(10);
      expect(jt).toContain("New Construction");
      expect(jt).toContain("Renovation");
      expect(jt).toContain("Commercial");
    });

    it("has default bidDeliveryTypes", () => {
      expect(store().masterData.bidDeliveryTypes).toEqual(["Email", "Sealed & Delivered", "Both", "Online Portal"]);
    });

    it("has default bidTypes", () => {
      expect(store().masterData.bidTypes).toContain("Hard Bid");
      expect(store().masterData.bidTypes).toContain("GMP");
    });

    it("has empty companyInfo fields", () => {
      const ci = store().masterData.companyInfo;
      expect(ci.name).toBe("");
      expect(ci.logo).toBeNull();
      expect(ci.brandColors).toEqual([]);
      expect(ci.boilerplateExclusions).toEqual([]);
    });

    it("has empty pdfUploadQueue", () => {
      expect(store().pdfUploadQueue).toEqual([]);
    });
  });

  // ─── Master Item CRUD ────────────────────────────────────────────
  describe("addMasterItem", () => {
    it("adds an item with auto-generated id to a category", () => {
      store().addMasterItem("clients", { name: "Acme Corp" });
      const clients = store().masterData.clients;
      expect(clients).toHaveLength(1);
      expect(clients[0].name).toBe("Acme Corp");
      expect(clients[0].id).toBeDefined();
    });

    it("appends to existing items", () => {
      store().addMasterItem("architects", { name: "Arch1" });
      store().addMasterItem("architects", { name: "Arch2" });
      expect(store().masterData.architects).toHaveLength(2);
    });

    it("handles categories that start empty", () => {
      store().addMasterItem("subcontractors", { name: "Sub Co" });
      expect(store().masterData.subcontractors).toHaveLength(1);
    });
  });

  describe("updateMasterItem", () => {
    it("updates a specific field of an item by id", () => {
      store().addMasterItem("clients", { name: "Old Name" });
      const id = store().masterData.clients[0].id;
      store().updateMasterItem("clients", id, "name", "New Name");
      expect(store().masterData.clients[0].name).toBe("New Name");
    });

    it("does not modify other items", () => {
      store().addMasterItem("clients", { name: "A" });
      store().addMasterItem("clients", { name: "B" });
      const idA = store().masterData.clients[0].id;
      store().updateMasterItem("clients", idA, "name", "A+");
      expect(store().masterData.clients[1].name).toBe("B");
    });

    it("does nothing if id not found", () => {
      store().addMasterItem("clients", { name: "A" });
      store().updateMasterItem("clients", "nonexistent", "name", "X");
      expect(store().masterData.clients[0].name).toBe("A");
    });
  });

  describe("removeMasterItem", () => {
    it("removes an item by id", () => {
      store().addMasterItem("engineers", { name: "Eng1" });
      const id = store().masterData.engineers[0].id;
      store().removeMasterItem("engineers", id);
      expect(store().masterData.engineers).toHaveLength(0);
    });

    it("does nothing if id not found", () => {
      store().addMasterItem("engineers", { name: "Eng1" });
      store().removeMasterItem("engineers", "nonexistent");
      expect(store().masterData.engineers).toHaveLength(1);
    });
  });

  // ─── Bulk Subs ───────────────────────────────────────────────────
  describe("addBulkSubs", () => {
    it("adds multiple subcontractors in one call", () => {
      store().addBulkSubs([
        { name: "Sub A", trade: "Electrical" },
        { name: "Sub B", trade: "Plumbing" },
        { name: "Sub C", trade: "HVAC" },
      ]);
      expect(store().masterData.subcontractors).toHaveLength(3);
      expect(store().masterData.subcontractors[0].id).toBeDefined();
      expect(store().masterData.subcontractors[2].name).toBe("Sub C");
    });

    it("appends to existing subs", () => {
      store().addMasterItem("subcontractors", { name: "Existing" });
      store().addBulkSubs([{ name: "New" }]);
      expect(store().masterData.subcontractors).toHaveLength(2);
    });
  });

  // ─── Toggle Sub Preferred ────────────────────────────────────────
  describe("toggleSubPreferred", () => {
    it("toggles preferred flag from undefined to true", () => {
      store().addMasterItem("subcontractors", { name: "Sub A" });
      const id = store().masterData.subcontractors[0].id;
      store().toggleSubPreferred(id);
      expect(store().masterData.subcontractors[0].preferred).toBe(true);
    });

    it("toggles preferred flag from true to false", () => {
      store().addMasterItem("subcontractors", { name: "Sub A", preferred: true });
      const id = store().masterData.subcontractors[0].id;
      store().toggleSubPreferred(id);
      expect(store().masterData.subcontractors[0].preferred).toBe(false);
    });
  });

  // ─── Job Types ───────────────────────────────────────────────────
  describe("addJobType", () => {
    it("appends a new job type", () => {
      const before = store().masterData.jobTypes.length;
      store().addJobType("Data Center");
      expect(store().masterData.jobTypes).toHaveLength(before + 1);
      expect(store().masterData.jobTypes).toContain("Data Center");
    });
  });

  // ─── Company Info ────────────────────────────────────────────────
  describe("updateCompanyInfo", () => {
    it("updates a single field on companyInfo", () => {
      store().updateCompanyInfo("name", "BLDG Estimating");
      expect(store().masterData.companyInfo.name).toBe("BLDG Estimating");
    });

    it("preserves other companyInfo fields", () => {
      store().updateCompanyInfo("name", "Test Co");
      store().updateCompanyInfo("phone", "555-1234");
      expect(store().masterData.companyInfo.name).toBe("Test Co");
      expect(store().masterData.companyInfo.phone).toBe("555-1234");
    });
  });

  // ─── Company Profiles CRUD ───────────────────────────────────────
  describe("company profiles", () => {
    it("addCompanyProfile creates a profile with id", () => {
      store().addCompanyProfile({ name: "NYC Office", address: "123 Main" });
      const profiles = store().masterData.companyProfiles;
      expect(profiles).toHaveLength(1);
      expect(profiles[0].name).toBe("NYC Office");
      expect(profiles[0].id).toBeDefined();
    });

    it("updateCompanyProfile updates a field", () => {
      store().addCompanyProfile({ name: "Old" });
      const id = store().masterData.companyProfiles[0].id;
      store().updateCompanyProfile(id, "name", "New");
      expect(store().masterData.companyProfiles[0].name).toBe("New");
    });

    it("removeCompanyProfile removes by id", () => {
      store().addCompanyProfile({ name: "Remove Me" });
      const id = store().masterData.companyProfiles[0].id;
      store().removeCompanyProfile(id);
      expect(store().masterData.companyProfiles).toHaveLength(0);
    });
  });

  // ─── Historical Proposals CRUD ───────────────────────────────────
  describe("historical proposals", () => {
    it("addHistoricalProposal adds with id and importedAt", () => {
      store().addHistoricalProposal({ projectName: "Project X", totalCost: 500000 });
      const proposals = store().masterData.historicalProposals;
      expect(proposals).toHaveLength(1);
      expect(proposals[0].id).toBeDefined();
      expect(proposals[0].importedAt).toBeDefined();
      expect(proposals[0].projectName).toBe("Project X");
    });

    it("updateHistoricalProposal merges updates", () => {
      store().addHistoricalProposal({ projectName: "P1" });
      const id = store().masterData.historicalProposals[0].id;
      store().updateHistoricalProposal(id, { totalCost: 1000000, sf: 50000 });
      const p = store().masterData.historicalProposals[0];
      expect(p.totalCost).toBe(1000000);
      expect(p.sf).toBe(50000);
      expect(p.projectName).toBe("P1");
    });

    it("removeHistoricalProposal removes by id", () => {
      store().addHistoricalProposal({ projectName: "P1" });
      store().addHistoricalProposal({ projectName: "P2" });
      const id = store().masterData.historicalProposals[0].id;
      store().removeHistoricalProposal(id);
      expect(store().masterData.historicalProposals).toHaveLength(1);
      expect(store().masterData.historicalProposals[0].projectName).toBe("P2");
    });

    it("updateProposalOutcome sets outcome and metadata", () => {
      store().addHistoricalProposal({ projectName: "P1" });
      const id = store().masterData.historicalProposals[0].id;
      store().updateProposalOutcome(id, "won", { winMargin: 5 });
      const p = store().masterData.historicalProposals[0];
      expect(p.outcome).toBe("won");
      expect(p.outcomeMetadata.winMargin).toBe(5);
    });

    it("updateProposalOutcome merges metadata with existing", () => {
      store().addHistoricalProposal({ projectName: "P1" });
      const id = store().masterData.historicalProposals[0].id;
      store().updateProposalOutcome(id, "lost", { reason: "price" });
      store().updateProposalOutcome(id, "lost", { competitor: "OtherGC" });
      const p = store().masterData.historicalProposals[0];
      expect(p.outcomeMetadata.reason).toBe("price");
      expect(p.outcomeMetadata.competitor).toBe("OtherGC");
    });
  });

  // ─── Filtering: getContactsForCompany ────────────────────────────
  describe("getContactsForCompany", () => {
    beforeEach(() => {
      useMasterDataStore.setState({
        masterData: {
          ...store().masterData,
          clients: [
            { id: "c1", name: "Global Client" },
            { id: "c2", name: "NYC Client", companyProfileId: "prof-1" },
            { id: "c3", name: "LA Client", companyProfileId: "prof-2" },
          ],
        },
      });
    });

    it("returns all contacts for __all__", () => {
      const result = store().getContactsForCompany("clients", "__all__");
      expect(result).toHaveLength(3);
    });

    it("returns only global contacts for falsy companyId", () => {
      const result = store().getContactsForCompany("clients", "");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Global Client");
    });

    it("returns profile-specific + global contacts for specific companyId", () => {
      const result = store().getContactsForCompany("clients", "prof-1");
      expect(result).toHaveLength(2);
      expect(result.map(c => c.name)).toContain("Global Client");
      expect(result.map(c => c.name)).toContain("NYC Client");
    });
  });

  // ─── Filtering: getProposalsForCompany ───────────────────────────
  describe("getProposalsForCompany", () => {
    beforeEach(() => {
      useMasterDataStore.setState({
        masterData: {
          ...store().masterData,
          historicalProposals: [
            { id: "p1", projectName: "Global Proj" },
            { id: "p2", projectName: "NYC Proj", companyProfileId: "prof-1" },
            { id: "p3", projectName: "LA Proj", companyProfileId: "prof-2" },
          ],
        },
      });
    });

    it("returns all proposals for __all__", () => {
      expect(store().getProposalsForCompany("__all__")).toHaveLength(3);
    });

    it("returns only global proposals for falsy companyId", () => {
      const result = store().getProposalsForCompany("");
      expect(result).toHaveLength(1);
      expect(result[0].projectName).toBe("Global Proj");
    });

    it("returns only exact-match proposals for specific companyId", () => {
      const result = store().getProposalsForCompany("prof-1");
      expect(result).toHaveLength(1);
      expect(result[0].projectName).toBe("NYC Proj");
    });
  });

  // ─── getCompanyInfo ──────────────────────────────────────────────
  describe("getCompanyInfo", () => {
    it("returns default companyInfo when no profileId", () => {
      store().updateCompanyInfo("name", "Default Co");
      expect(store().getCompanyInfo(null).name).toBe("Default Co");
      expect(store().getCompanyInfo("").name).toBe("Default Co");
    });

    it("returns matching profile when profileId exists", () => {
      store().addCompanyProfile({ name: "Branch Office" });
      const profId = store().masterData.companyProfiles[0].id;
      const result = store().getCompanyInfo(profId);
      expect(result.name).toBe("Branch Office");
    });

    it("falls back to default companyInfo when profile not found", () => {
      store().updateCompanyInfo("name", "Fallback");
      expect(store().getCompanyInfo("nonexistent").name).toBe("Fallback");
    });
  });

  // ─── PDF Upload Queue ────────────────────────────────────────────
  describe("pdfUploadQueue", () => {
    it("addToUploadQueue adds items", () => {
      store().addToUploadQueue([
        { id: "q1", status: "pending" },
        { id: "q2", status: "pending" },
      ]);
      expect(store().pdfUploadQueue).toHaveLength(2);
    });

    it("updateQueueItem updates specific item", () => {
      store().addToUploadQueue([{ id: "q1", status: "pending" }]);
      store().updateQueueItem("q1", { status: "processing" });
      expect(store().pdfUploadQueue[0].status).toBe("processing");
    });

    it("removeQueueItem removes specific item", () => {
      store().addToUploadQueue([{ id: "q1" }, { id: "q2" }]);
      store().removeQueueItem("q1");
      expect(store().pdfUploadQueue).toHaveLength(1);
      expect(store().pdfUploadQueue[0].id).toBe("q2");
    });

    it("clearSavedFromQueue removes only saved items", () => {
      store().addToUploadQueue([
        { id: "q1", status: "saved" },
        { id: "q2", status: "pending" },
        { id: "q3", status: "saved" },
      ]);
      store().clearSavedFromQueue();
      expect(store().pdfUploadQueue).toHaveLength(1);
      expect(store().pdfUploadQueue[0].id).toBe("q2");
    });

    it("clearFailedFromQueue removes only failed items", () => {
      store().addToUploadQueue([
        { id: "q1", status: "failed" },
        { id: "q2", status: "pending" },
      ]);
      store().clearFailedFromQueue();
      expect(store().pdfUploadQueue).toHaveLength(1);
      expect(store().pdfUploadQueue[0].id).toBe("q2");
    });
  });

  // ─── setMasterData ───────────────────────────────────────────────
  describe("setMasterData", () => {
    it("replaces entire masterData", () => {
      const newData = { clients: [{ id: "x", name: "X" }], jobTypes: [] };
      store().setMasterData(newData);
      expect(store().masterData).toEqual(newData);
    });
  });

  // ─── migrateSubcontractorSchema ──────────────────────────────────
  describe("migrateSubcontractorSchema", () => {
    it("returns input unchanged when no subcontractors", () => {
      const data = { clients: [] };
      expect(migrateSubcontractorSchema(data)).toBe(data);
    });

    it("returns input unchanged when already migrated (has trades array)", () => {
      const data = { subcontractors: [{ id: "1", trades: ["Electrical"] }] };
      expect(migrateSubcontractorSchema(data)).toBe(data);
    });

    it("migrates legacy trade string to trades array", () => {
      const data = { subcontractors: [{ id: "1", trade: "Electrical" }] };
      const result = migrateSubcontractorSchema(data);
      expect(result.subcontractors[0].trades).toEqual(["Electrical"]);
      expect(result.subcontractors[0]._legacyTrade).toBe("Electrical");
    });

    it("adds prequal fields during migration", () => {
      const data = { subcontractors: [{ id: "1", trade: "Plumbing" }] };
      const result = migrateSubcontractorSchema(data);
      const sub = result.subcontractors[0];
      expect(sub.markets).toEqual([]);
      expect(sub.insuranceExpiry).toBe("");
      expect(sub.bondingCapacity).toBe("");
      expect(sub.emr).toBe("");
      expect(sub.certifications).toEqual([]);
      expect(sub.yearsInBusiness).toBe("");
      expect(sub.licenseNo).toBe("");
      expect(sub.website).toBe("");
      expect(sub.address).toBe("");
    });

    it("returns null/undefined input unchanged", () => {
      expect(migrateSubcontractorSchema(null)).toBeNull();
      expect(migrateSubcontractorSchema(undefined)).toBeUndefined();
    });

    it("preserves existing prequal fields during migration", () => {
      const data = {
        subcontractors: [{ id: "1", trade: "HVAC", markets: ["NYC"], website: "example.com" }],
      };
      const result = migrateSubcontractorSchema(data);
      expect(result.subcontractors[0].markets).toEqual(["NYC"]);
      expect(result.subcontractors[0].website).toBe("example.com");
    });
  });
});
