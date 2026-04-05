import { describe, it, expect } from "vitest";
import { normalizeGCProposal, normalizeSubProposal, normalizeVendorQuote } from "@/utils/proposalNormalizer";

// ─── Fixture: Raw GC extraction (simulates Sonnet output) ──────
const GC_RAW = {
  projectName: "200 Petit Ave",
  contractor: "The Kulka Group",
  client: "AVGI",
  date: "2025-03-06",
  address: "200 Petit Ave, Bellmore, NY",
  projectSF: 19310,
  totalCost: 7007251,
  directCost: 5685976,
  laborType: "open_shop",
  constructionType: "Type V wood-frame",
  divisions: [
    { code: "01.3113", division: "01", label: "Project Coordination & Permits", cost: 20000, costPerSF: 1.04 },
    { code: "02.1000", division: "02", label: "Demolition", cost: 116598, costPerSF: 6.04 },
    { code: "03.1000", division: "03", label: "Concrete", cost: 141839, costPerSF: 7.35 },
    { code: "03.3370", division: "03", label: "Concrete Topping", cost: 63435, costPerSF: 3.29 },
    { code: "09.2300", division: "09", label: "Drywall & Carpentry", cost: 274821, costPerSF: 14.23 },
    { code: "26.0000", division: "26", label: "Electric", cost: 424010, costPerSF: 21.96 },
  ],
  markup: {
    contingency: { percent: 5, cost: 284299 },
    generalConditions: { percent: null, cost: 477622 },
    fee: { percent: null, cost: 322395 },
    insurance: { percent: null, cost: 236960 },
  },
  exclusions: ["No FF&E", "No winter conditions"],
  clarifications: ["Budget valid 30 days"],
};

const SUB_RAW = {
  projectName: "Goodwill RFP Build Out",
  subcontractor: "Swift Construction LLC",
  client: "Tener Contracting",
  date: "2025-02-28",
  trade: "drywall",
  csiDivision: "09",
  totalCost: 26992,
  drawingDate: "2025-01-29",
  lineItems: [
    { description: "Furnish and install drywall partitions @ 12ft high", quantity: 1, unit: "LS", total: 20000, notes: "Metal Framing, 5/8 gypsum board, insulation" },
    { description: "Modify existing ceilings for new walls", quantity: 1, unit: "LS", total: 3000 },
    { description: "Furnish and install FR plywood blocking", quantity: 1, unit: "LS", total: 1500 },
    { description: "Install bathroom accessories", quantity: 1, unit: "LS", total: 1000 },
    { description: "Install HM frames doors and hardware", quantity: 4, unit: "EA", unitRate: 375, total: 1492 },
  ],
  alternates: [
    { description: "Open/close ceiling for plumbing", cost: 2410, type: "add" },
  ],
};

const VENDOR_RAW = {
  vendor: "ABC Supply",
  client: "Tener Contracting",
  date: "2025-03-01",
  quoteNumber: "Q-2025-0442",
  validUntil: "2025-03-31",
  items: [
    { description: "2x6 SPF #2 Stud 8ft", unit: "EA", unitPrice: 4.89, quantity: 2400, extendedPrice: 11736, csiDivision: "06" },
    { description: "5/8 Type X Gypsum Board 4x12", unit: "EA", unitPrice: 18.50, quantity: 300, extendedPrice: 5550, csiDivision: "09" },
  ],
  totalCost: 17286,
};

describe("normalizeGCProposal", () => {
  it("produces valid proposal shape with division rollup", () => {
    const result = normalizeGCProposal(GC_RAW, "200-petit.pdf");
    expect(result.proposal.totalCost).toBe(7007251);
    expect(result.proposal.projectSF).toBe(19310);
    expect(result.proposal.divisions["01"]).toBe(20000);
    expect(result.proposal.divisions["03"]).toBe(205274);
    expect(result.proposal.divisions["09"]).toBe(274821);
    expect(result.proposal.extractionConfidence).toBe("high");
    expect(result.proposal.source).toBe("pdf");
  });

  it("extracts $/SF rates when projectSF is available", () => {
    const result = normalizeGCProposal(GC_RAW, "200-petit.pdf");
    expect(result.sfRates.length).toBe(6);
    const elecRate = result.sfRates.find(r => r.division === "26");
    expect(elecRate.costPerSF).toBeCloseTo(21.96, 1);
  });

  it("preserves markup structure", () => {
    const result = normalizeGCProposal(GC_RAW, "200-petit.pdf");
    expect(result.markup.contingency.cost).toBe(284299);
    expect(result.markup.contingency.percent).toBe(5);
  });

  it("preserves exclusions and clarifications", () => {
    const result = normalizeGCProposal(GC_RAW, "200-petit.pdf");
    expect(result.exclusions).toHaveLength(2);
    expect(result.clarifications).toHaveLength(1);
  });
});

describe("normalizeSubProposal", () => {
  it("produces valid proposal shape with single division", () => {
    const result = normalizeSubProposal(SUB_RAW, "goodwill-swift.pdf");
    expect(result.proposal.totalCost).toBe(26992);
    expect(result.proposal.divisions["09"]).toBe(26992);
    expect(result.proposal.proposalType).toBe("sub");
  });

  it("converts line items to estimate-compatible format", () => {
    const result = normalizeSubProposal(SUB_RAW, "goodwill-swift.pdf");
    expect(result.items.length).toBe(5);
    const doorItem = result.items.find(i => i.description.includes("HM frames"));
    expect(doorItem.quantity).toBe(4);
    expect(doorItem.unit).toBe("EA");
    expect(doorItem.division).toBe("09");
    expect(doorItem.novaProposed).toBe(true);
  });

  it("extracts unit rates when available", () => {
    const result = normalizeSubProposal(SUB_RAW, "goodwill-swift.pdf");
    expect(result.unitRates.length).toBe(1);
    expect(result.unitRates[0].unitRate).toBe(375);
    expect(result.unitRates[0].unit).toBe("EA");
  });

  it("preserves alternates", () => {
    const result = normalizeSubProposal(SUB_RAW, "goodwill-swift.pdf");
    expect(result.alternates).toHaveLength(1);
    expect(result.alternates[0].cost).toBe(2410);
  });
});

describe("normalizeVendorQuote", () => {
  it("extracts material rates with proper shape", () => {
    const result = normalizeVendorQuote(VENDOR_RAW, "abc-supply-quote.pdf");
    expect(result.materialRates.length).toBe(2);
    const stud = result.materialRates.find(r => r.description.includes("2x6"));
    expect(stud.unitPrice).toBe(4.89);
    expect(stud.unit).toBe("EA");
    expect(stud.division).toBe("06");
    expect(stud.vendor).toBe("ABC Supply");
  });

  it("preserves quote metadata", () => {
    const result = normalizeVendorQuote(VENDOR_RAW, "abc-supply-quote.pdf");
    expect(result.vendor).toBe("ABC Supply");
    expect(result.totalCost).toBe(17286);
  });
});
