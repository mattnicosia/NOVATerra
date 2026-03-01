// Master Cost Database — curated national average rates maintained by BLDG
// This wraps SEED_ELEMENTS with metadata fields that enable the two-layer
// Master + Override architecture.  Master items are read-only for end users;
// clicking "Edit" on a master item creates a user override instead.
//
// All rates stored at national average (1.0× location factor).
// Location adjustment happens at display/calculation time via project zip.

import { SEED_ELEMENTS } from './seedAssemblies';

const CREATED = "2026-02-24T00:00:00.000Z";

/**
 * Transform seed elements into master DB items.
 * Adds: source, pricingBasis, confidence, sampleCount, timestamps, sourceZip/Label.
 */
export const MASTER_COST_DB = SEED_ELEMENTS.map(el => ({
  ...el,
  source: "master",
  pricingBasis: "national_avg",
  sourceZip: "",
  sourceLabel: "National Average",
  confidence: "high",
  sampleCount: 10,
  createdAt: CREATED,
  updatedAt: CREATED,
}));

/** Quick lookup: master item ID → master element */
export const MASTER_COST_MAP = new Map(MASTER_COST_DB.map(el => [el.id, el]));

/** Set of all master IDs for O(1) membership checks */
export const MASTER_IDS = new Set(MASTER_COST_DB.map(el => el.id));
