/**
 * Trade Scope Generator — chains ROM → scope template → trade grouping
 *
 * The lead-gen differentiator: generates a complete scope of work
 * separated by trade bundle with quantities and cost ranges.
 *
 * Input: building type + SF + options
 * Output: trade-separated scopes with items, costs, and narratives
 */

import { generateScopeTemplate } from "@/constants/scopeTemplates";
import { TRADE_GROUPINGS, autoTradeFromCode, TRADE_MAP } from "@/constants/tradeGroupings";

/**
 * Generate trade-separated scopes from project parameters.
 *
 * @param {string} buildingType — e.g., "commercial-office", "retail"
 * @param {number} sf — project square footage
 * @param {object} opts — { floors, workType, romDivisions }
 * @returns {{ trades: TradeScope[], grandTotal, perSF, itemCount }}
 */
export function generateTradeScopes(buildingType, sf, opts = {}) {
  const { floors = 1, workType = "", romDivisions } = opts;

  // Step 1: Generate scope template items with quantities + costs
  const template = generateScopeTemplate(buildingType, sf, { floors, workType });
  if (!template.items.length) return { trades: [], grandTotal: template.grandTotal, perSF: template.perSF, itemCount: 0 };

  // Step 2: Map each item to its trade bundle
  const tradeMap = {}; // tradeKey → { items[], costLow, costMid, costHigh }

  for (const item of template.items) {
    const tradeKey = autoTradeFromCode(item.code) || mapDivisionToTrade(item.division);
    if (!tradeKey) continue;

    if (!tradeMap[tradeKey]) {
      const tradeDef = TRADE_MAP[tradeKey];
      tradeMap[tradeKey] = {
        key: tradeKey,
        label: tradeDef?.label || tradeKey,
        sort: tradeDef?.sort || 99,
        items: [],
        costLow: 0,
        costMid: 0,
        costHigh: 0,
      };
    }

    tradeMap[tradeKey].items.push(item);
    tradeMap[tradeKey].costLow += item.lowCost || 0;
    tradeMap[tradeKey].costMid += item.midCost || 0;
    tradeMap[tradeKey].costHigh += item.highCost || 0;
  }

  // Step 3: If ROM divisions provided, calibrate trade costs against ROM
  if (romDivisions) {
    for (const trade of Object.values(tradeMap)) {
      // Sum ROM mid for all divisions this trade covers
      const divs = getDivisionsForTrade(trade.key);
      let romMid = 0;
      divs.forEach(d => { romMid += (romDivisions[d]?.total?.mid || 0); });
      // If ROM has data for this trade, use it as a calibration ceiling
      if (romMid > 0 && trade.costMid > 0) {
        const ratio = romMid / trade.costMid;
        if (ratio > 0.5 && ratio < 2) {
          // Within reasonable range — blend ROM and template (60/40)
          trade.costLow = Math.round(trade.costLow * (0.4 + 0.6 * ratio));
          trade.costMid = Math.round(trade.costMid * (0.4 + 0.6 * ratio));
          trade.costHigh = Math.round(trade.costHigh * (0.4 + 0.6 * ratio));
        }
      }
    }
  }

  // Step 4: Sort by trade sort order, generate narratives
  const trades = Object.values(tradeMap)
    .sort((a, b) => a.sort - b.sort)
    .map(trade => ({
      ...trade,
      narrative: generateTradeNarrative(trade, buildingType, sf, floors),
      itemCount: trade.items.length,
      pctOfTotal: 0, // calculated below
    }));

  // Calculate % of total
  const totalMid = trades.reduce((sum, t) => sum + t.costMid, 0);
  trades.forEach(t => { t.pctOfTotal = totalMid > 0 ? Math.round((t.costMid / totalMid) * 1000) / 10 : 0; });

  return {
    trades,
    grandTotal: template.grandTotal,
    perSF: template.perSF,
    itemCount: template.itemCount,
    buildingType: template.label,
  };
}

/** Map a division to its best trade (for items where autoTradeFromCode returns empty) */
function mapDivisionToTrade(div) {
  for (const t of TRADE_GROUPINGS) {
    if (t.divisions.includes(div)) return t.key;
  }
  return "";
}

/** Get all CSI divisions that belong to a trade */
function getDivisionsForTrade(tradeKey) {
  const trade = TRADE_MAP[tradeKey];
  if (!trade) return [];
  if (trade.divisions.length > 0) return trade.divisions;
  // For trades with subdivision-level mapping, infer from their sort position
  const divMap = { framing: ["06"], finishCarp: ["06"], insulation: ["07"], roofing: ["07"],
    doors: ["08"], windows: ["08"], drywall: ["09"], tile: ["09"],
    act: ["09"], flooring: ["09"], painting: ["09"] };
  return divMap[tradeKey] || [];
}

/** Generate a 2-3 sentence scope narrative per trade */
function generateTradeNarrative(trade, buildingType, sf, floors) {
  const items = trade.items;
  if (items.length === 0) return "";

  const descriptions = items.map(i => i.description).join(", ");
  const totalUnits = items
    .filter(i => i.unit !== "LS")
    .map(i => `${Math.round(i.qty).toLocaleString()} ${i.unit}`)
    .slice(0, 3)
    .join(", ");

  const NARRATIVES = {
    general: `General conditions and project management for ${Math.round(sf).toLocaleString()} SF ${buildingType.replace(/-/g, " ")} project. Includes temporary facilities, protection, site logistics, and final cleaning.`,
    demo: `Selective demolition of existing conditions. Scope includes removal and disposal of existing finishes, partitions, and MEP as required for new construction.`,
    sitework: `Site preparation including clearing, excavation, grading, and utility connections. ${floors > 1 ? "Foundation excavation for multi-story structure." : ""}`,
    concrete: `Complete concrete package: ${descriptions}. ${totalUnits ? `Approximately ${totalUnits}.` : ""} Includes forming, reinforcing, placement, finishing, and curing.`,
    masonry: `Masonry construction including CMU walls, brick veneer, and stone as specified. Includes mortar, reinforcing, and accessories.`,
    steel: `Structural steel framing package. Includes columns, beams, joists, decking, and miscellaneous metals. ${totalUnits ? `Estimated ${totalUnits}.` : ""}`,
    framing: `Rough carpentry including wood framing, blocking, backing, and structural sheathing. ${totalUnits ? `Approximately ${totalUnits}.` : ""}`,
    finishCarp: `Finish carpentry and millwork. Includes trim, casework, countertops, and custom millwork as detailed in drawings.`,
    insulation: `Building insulation including batt, rigid, and spray-applied insulation at walls, roof, and foundation. Includes vapor barriers.`,
    roofing: `Roofing and waterproofing systems. Includes membrane roofing, flashing, sealants, and below-grade waterproofing.`,
    doors: `Doors and hardware package: ${items.length} items including hollow metal frames, wood doors, and finish hardware sets.`,
    windows: `Windows and glazing package including curtain wall, storefront, and/or window systems. Includes glass, frames, and sealants.`,
    drywall: `Drywall and metal framing: ${descriptions}. ${totalUnits ? `Approximately ${totalUnits}.` : ""} Includes tape, joint compound, and corner bead.`,
    tile: `Ceramic/porcelain tile installation at wet areas and feature walls. Includes substrate preparation, setting materials, and grout.`,
    act: `Acoustical ceiling tile installation on exposed grid system. ${totalUnits ? `Approximately ${totalUnits}.` : ""}`,
    flooring: `Flooring package including resilient flooring (VCT/LVT), carpet tile, and/or specialty flooring as specified. ${totalUnits ? `Approximately ${totalUnits}.` : ""}`,
    painting: `Painting throughout: primers, two-coat finish on walls, ceilings, and trim. ${totalUnits ? `Approximately ${totalUnits}.` : ""} Includes surface prep and protection.`,
    specialties: `Building specialties including signage, toilet accessories, fire extinguisher cabinets, and corner guards.`,
    elevator: `${items.some(i => i.qty > 0) ? `Elevator installation: ${items.filter(i => i.qty > 0).map(i => `${Math.round(i.qty)} EA`).join(", ")}.` : "Elevator allowance if required by building height."} Includes cab, shaft work, and controls.`,
    fireSuppression: `Fire protection system: wet sprinkler system throughout per NFPA 13. Includes mains, branch lines, heads, and fire alarm system.`,
    plumbing: `Plumbing package: rough-in and fixtures. ${items.filter(i => i.unit === "EA").map(i => `${Math.round(i.qty)} ${i.description.toLowerCase()}`).join(", ") || "All piping, fixtures, and connections as required."}`,
    hvac: `HVAC system: complete heating, ventilation, and air conditioning. ${totalUnits ? `Approximately ${totalUnits}.` : ""} Includes ductwork, equipment, controls, and TAB.`,
    electrical: `Electrical package: power distribution, wiring, devices, and lighting. ${totalUnits ? `Approximately ${totalUnits}.` : ""} Includes panels, circuits, switches, receptacles, and fixtures.`,
  };

  return NARRATIVES[trade.key] || `${trade.label}: ${descriptions.slice(0, 150)}.`;
}
