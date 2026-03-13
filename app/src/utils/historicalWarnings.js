/**
 * Historical Pattern Warnings Engine
 * Mines exclusion patterns from actual bid history to generate
 * data-driven pre-send warnings. Augments the static warnings
 * from preSendAnalysis.js with learned intelligence.
 */

import { CSI } from "@/constants/csi";

// Exclusion keyword → division mapping (mirrors scopeGapEngine pattern)
const EXCLUSION_MAP = [
  { patterns: ["fire caulk", "firestop", "fire stop", "fire-stop", "fire seal"], divisions: ["07"], label: "firestop" },
  { patterns: ["blocking", "wood blocking", "plywood blocking"], divisions: ["06"], label: "blocking" },
  { patterns: ["insulation", "batt insulation", "spray foam"], divisions: ["07"], label: "insulation" },
  { patterns: ["paint", "painting", "primer", "finish coat"], divisions: ["09"], label: "painting" },
  { patterns: ["demo", "demolition", "selective demo"], divisions: ["02"], label: "demolition" },
  { patterns: ["permit", "permits", "building permit"], divisions: ["01"], label: "permits" },
  { patterns: ["bond", "bonding", "performance bond"], divisions: ["01"], label: "bonding" },
  { patterns: ["clean", "cleanup", "final clean", "rough clean"], divisions: ["01"], label: "cleanup" },
  { patterns: ["scaffold", "scaffolding"], divisions: ["01"], label: "scaffolding" },
  { patterns: ["concrete", "slab", "foundation", "footing"], divisions: ["03"], label: "concrete" },
  { patterns: ["waterproof", "waterproofing", "dampproof"], divisions: ["07"], label: "waterproofing" },
  { patterns: ["ceiling", "acoustical ceiling", "ACT", "suspended ceiling"], divisions: ["09"], label: "ceilings" },
  { patterns: ["flooring", "floor", "carpet", "tile", "VCT", "LVT"], divisions: ["09"], label: "flooring" },
  { patterns: ["door", "hardware", "door hardware", "lockset"], divisions: ["08"], label: "door hardware" },
  { patterns: ["glazing", "glass", "storefront", "curtain wall"], divisions: ["08"], label: "glazing" },
  { patterns: ["roofing", "roof", "membrane", "TPO", "EPDM"], divisions: ["07"], label: "roofing" },
  { patterns: ["electric", "electrical", "wiring", "conduit"], divisions: ["26"], label: "electrical" },
  { patterns: ["plumbing", "piping", "fixture", "plumb"], divisions: ["22"], label: "plumbing" },
  { patterns: ["hvac", "mechanical", "ductwork", "duct"], divisions: ["23"], label: "HVAC" },
  { patterns: ["sprinkler", "fire suppression", "fire protection"], divisions: ["21"], label: "fire suppression" },
  { patterns: ["drywall", "gypsum", "GWB", "sheetrock"], divisions: ["09"], label: "drywall" },
  { patterns: ["framing", "metal stud", "metal framing", "stud"], divisions: ["09", "05"], label: "framing" },
  { patterns: ["masonry", "brick", "block", "CMU"], divisions: ["04"], label: "masonry" },
  { patterns: ["steel", "structural steel", "misc metals"], divisions: ["05"], label: "steel" },
  { patterns: ["elevator", "lift"], divisions: ["14"], label: "elevator" },
  { patterns: ["site work", "earthwork", "grading", "excavation"], divisions: ["31"], label: "site work" },
  { patterns: ["equipment hookup", "hookup", "hook-up"], divisions: ["11", "22", "26"], label: "equipment hookups" },
  { patterns: ["grease trap", "grease interceptor"], divisions: ["22"], label: "grease trap" },
  { patterns: ["FRP", "wall panel", "wall protection"], divisions: ["09"], label: "wall protection" },
];

function getDivisionName(div) {
  return CSI[div]?.name || `Division ${div}`;
}

/**
 * Mine exclusion patterns from all past proposals.
 * @param {Object} proposals - keyed by invitationId → { parsedData }
 * @param {Array} estimateItems - items from current estimate
 * @returns {Array<{ division, divisionName, warning, riskLevel, source, frequency, total }>}
 */
export function mineHistoricalWarnings(proposals, estimateItems) {
  if (!proposals || Object.keys(proposals).length === 0) return [];
  if (!estimateItems?.length) return [];

  // Get divisions present in the current estimate
  const presentDivisions = new Set();
  for (const item of estimateItems) {
    const code = item.code || "";
    const div = code.split(".")[0];
    if (div) presentDivisions.add(div.padStart(2, "0"));
  }
  if (presentDivisions.size === 0) return [];

  // Count exclusion patterns across all proposals
  // { "firestop|07": { label, division, count, total } }
  const patternCounts = {};
  let totalProposals = 0;

  for (const prop of Object.values(proposals)) {
    const exclusions = prop?.parsedData?.exclusions || prop?.parsed_data?.exclusions;
    if (!exclusions || exclusions.length === 0) continue;
    totalProposals++;

    const seenInThisProposal = new Set(); // avoid double-counting within one proposal

    for (const excText of exclusions) {
      const lower = excText.toLowerCase();

      for (const mapping of EXCLUSION_MAP) {
        const matched = mapping.patterns.some(p => lower.includes(p));
        if (!matched) continue;

        for (const div of mapping.divisions) {
          const key = `${mapping.label}|${div}`;
          if (seenInThisProposal.has(key)) continue;
          seenInThisProposal.add(key);

          if (!patternCounts[key]) {
            patternCounts[key] = { label: mapping.label, division: div, count: 0 };
          }
          patternCounts[key].count++;
        }
      }
    }
  }

  if (totalProposals < 2) return []; // need at least 2 proposals for meaningful patterns

  // Filter to patterns that appear in 2+ proposals AND match current estimate divisions
  const warnings = [];

  for (const pc of Object.values(patternCounts)) {
    if (pc.count < 2) continue;
    if (!presentDivisions.has(pc.division)) continue;

    const pct = Math.round((pc.count / totalProposals) * 100);
    warnings.push({
      division: pc.division,
      divisionName: getDivisionName(pc.division),
      warning: `${pc.count} of your last ${totalProposals} subs excluded ${pc.label} — verify Div ${pc.division} coverage`,
      riskLevel: pct >= 50 ? "high" : "medium",
      source: "historical",
      frequency: pc.count,
      total: totalProposals,
    });
  }

  // Sort by frequency descending
  warnings.sort((a, b) => b.frequency - a.frequency);

  return warnings;
}
