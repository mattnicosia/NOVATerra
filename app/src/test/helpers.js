/**
 * Shared test helpers — factories, render wrappers, and mock builders.
 */
import { vi } from "vitest";

// ── Data factories ───────────────────────────────────────────────────
let _seq = 0;
const seq = () => `test-${++_seq}`;

export function mockEstimate(overrides = {}) {
  return {
    id: seq(),
    title: "Test Estimate",
    projectName: "Test Project",
    buildingType: "commercial_office",
    grossSF: 10000,
    stories: 2,
    laborType: "open_shop",
    zip: "10001",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function mockItem(overrides = {}) {
  return {
    id: seq(),
    code: "09.260",
    description: "Gypsum board",
    unit: "SF",
    quantity: 1000,
    materialRate: 2.5,
    laborRate: 3.0,
    materialCost: 2500,
    laborCost: 3000,
    totalCost: 5500,
    trade: "Drywall",
    group: "",
    notes: "",
    ...overrides,
  };
}

export function mockTakeoff(overrides = {}) {
  return {
    id: seq(),
    type: "area",
    label: "Room 101",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    measuredValue: 100,
    drawingId: "drw-1",
    floor: 1,
    ...overrides,
  };
}

export function mockProposal(overrides = {}) {
  return {
    id: seq(),
    projectName: "Test GC Project",
    gcName: "Test GC",
    totalCost: 500000,
    grossSF: 10000,
    perSF: 50,
    buildingType: "commercial_office",
    zip: "10001",
    laborType: "union",
    date: "2024-06-15",
    divisions: {},
    ...overrides,
  };
}

export function mockProject(overrides = {}) {
  return {
    id: seq(),
    name: "Test Project",
    address: "123 Main St",
    zip: "10001",
    buildingType: "commercial_office",
    grossSF: 10000,
    stories: 2,
    laborType: "open_shop",
    ...overrides,
  };
}

// ── Mock store builder ───────────────────────────────────────────────
export function createMockStore(initialState = {}) {
  const state = { ...initialState };
  const store = vi.fn(() => state);
  store.getState = () => state;
  store.setState = vi.fn((partial) => {
    Object.assign(state, typeof partial === "function" ? partial(state) : partial);
  });
  store.subscribe = vi.fn(() => vi.fn());
  return store;
}

// ── Reset factory counter (call in beforeEach if needed) ─────────────
export function resetSeq() {
  _seq = 0;
}
