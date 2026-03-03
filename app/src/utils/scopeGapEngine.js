/**
 * Scope Gap Detection Engine
 *
 * Compares estimate items against a parsed sub proposal to identify
 * missing scope, exclusion conflicts, and quantity mismatches.
 * This is NOVATerra's moat — no competitor has the estimate context.
 */

import { CSI } from '@/constants/csi';

// ── CSI normalization ──────────────────────────────────────────
// Estimate items use "09.260" format; proposals use "09" (2-digit).
// Normalize both to 2-digit division codes for matching.

export function normalizeCSI(code) {
  if (!code) return null;
  const s = String(code).trim();
  // "09.260" → "09", "09260" → "09", "09" → "09", "9" → "09"
  // Also handles "09 - Finishes" format from item.division
  const match = s.match(/^(\d{1,2})/);
  if (!match) return null;
  return match[1].padStart(2, '0');
}

function getDivisionName(divCode) {
  return CSI[divCode]?.name || `Division ${divCode}`;
}

function getItemTotal(item) {
  const qty = Number(item.quantity) || 0;
  const m = Number(item.material) || 0;
  const l = Number(item.labor) || 0;
  const e = Number(item.equipment) || 0;
  const sub = Number(item.subcontractor) || 0;
  return qty * (m + l + e + sub);
}

// ── Exclusion conflict keywords ────────────────────────────────
// Common exclusion phrases mapped to CSI divisions / keywords

const EXCLUSION_KEYWORDS = [
  { patterns: ['fire caulk', 'firestop', 'fire stop', 'fire-stop', 'fire seal'], divisions: ['07'], specPatterns: ['07.84', '07.8'] },
  { patterns: ['blocking', 'wood blocking', 'plywood blocking'], divisions: ['06'], specPatterns: ['06.1'] },
  { patterns: ['insulation', 'batt insulation', 'spray foam'], divisions: ['07'], specPatterns: ['07.2'] },
  { patterns: ['paint', 'painting', 'primer', 'finish coat'], divisions: ['09'], specPatterns: ['09.9'] },
  { patterns: ['demo', 'demolition', 'selective demo'], divisions: ['02'], specPatterns: ['02.4'] },
  { patterns: ['permit', 'permits', 'building permit'], divisions: ['01'], specPatterns: ['01.4'] },
  { patterns: ['bond', 'bonding', 'performance bond'], divisions: ['01'], specPatterns: ['01.2'] },
  { patterns: ['clean', 'cleanup', 'final clean', 'rough clean'], divisions: ['01'], specPatterns: ['01.7'] },
  { patterns: ['scaffold', 'scaffolding'], divisions: ['01'], specPatterns: ['01.5'] },
  { patterns: ['concrete', 'slab', 'foundation', 'footing'], divisions: ['03'], specPatterns: ['03.'] },
  { patterns: ['waterproof', 'waterproofing', 'dampproof'], divisions: ['07'], specPatterns: ['07.1'] },
  { patterns: ['ceiling', 'acoustical ceiling', 'ACT', 'suspended ceiling'], divisions: ['09'], specPatterns: ['09.5'] },
  { patterns: ['flooring', 'floor', 'carpet', 'tile', 'VCT', 'LVT'], divisions: ['09'], specPatterns: ['09.6', '09.3'] },
  { patterns: ['door', 'hardware', 'door hardware', 'lockset'], divisions: ['08'], specPatterns: ['08.'] },
  { patterns: ['glazing', 'glass', 'storefront', 'curtain wall'], divisions: ['08'], specPatterns: ['08.4', '08.8'] },
  { patterns: ['roofing', 'roof', 'membrane', 'TPO', 'EPDM'], divisions: ['07'], specPatterns: ['07.5', '07.4'] },
  { patterns: ['electric', 'electrical', 'wiring', 'conduit'], divisions: ['26'], specPatterns: ['26.'] },
  { patterns: ['plumbing', 'piping', 'fixture', 'plumb'], divisions: ['22'], specPatterns: ['22.'] },
  { patterns: ['hvac', 'mechanical', 'ductwork', 'duct'], divisions: ['23'], specPatterns: ['23.'] },
  { patterns: ['sprinkler', 'fire suppression', 'fire protection'], divisions: ['21'], specPatterns: ['21.'] },
  { patterns: ['drywall', 'gypsum', 'GWB', 'sheetrock'], divisions: ['09'], specPatterns: ['09.2'] },
  { patterns: ['framing', 'metal stud', 'metal framing', 'stud'], divisions: ['09', '05'], specPatterns: ['09.1', '05.4'] },
  { patterns: ['masonry', 'brick', 'block', 'CMU'], divisions: ['04'], specPatterns: ['04.'] },
  { patterns: ['steel', 'structural steel', 'misc metals'], divisions: ['05'], specPatterns: ['05.'] },
  { patterns: ['elevator', 'lift'], divisions: ['14'], specPatterns: ['14.'] },
  { patterns: ['site work', 'earthwork', 'grading', 'excavation'], divisions: ['31'], specPatterns: ['31.'] },
];

function findExclusionConflicts(exclusions, estimateByDivision) {
  const conflicts = [];

  for (const excText of exclusions) {
    const lower = excText.toLowerCase();

    for (const kw of EXCLUSION_KEYWORDS) {
      const matched = kw.patterns.some(p => lower.includes(p));
      if (!matched) continue;

      // Find estimate items in the affected divisions
      for (const div of kw.divisions) {
        const divItems = estimateByDivision[div];
        if (!divItems || divItems.length === 0) continue;

        // Narrow down to items matching by spec section or description keyword
        // (all items are already in the correct division bucket)
        const narrowed = divItems.filter(item => {
          const specMatch = item.specSection && kw.specPatterns.some(sp =>
            item.specSection.startsWith(sp) || item.specSection.includes(sp)
          );
          const descMatch = kw.patterns.some(p =>
            (item.description || '').toLowerCase().includes(p)
          );
          return specMatch || descMatch;
        });

        // Use narrowed results if any matched, otherwise use the whole division bucket
        const affectedItems = narrowed.length > 0 ? narrowed : divItems;

        if (affectedItems.length > 0) {
          const exposure = affectedItems.reduce((sum, item) => sum + getItemTotal(item), 0);
          conflicts.push({
            exclusionText: excText,
            affectedDivision: div,
            affectedDivisionName: getDivisionName(div),
            affectedItems: affectedItems.map(i => ({
              code: i.code,
              description: i.description,
              total: getItemTotal(i),
            })),
            estimatedExposure: Math.round(exposure),
          });
        }
      }
    }
  }

  // Deduplicate by exclusion text + division
  const seen = new Set();
  return conflicts.filter(c => {
    const key = `${c.exclusionText}::${c.affectedDivision}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main analysis function ─────────────────────────────────────

export function analyzeGaps(estimateItems, parsedProposal) {
  if (!estimateItems?.length || !parsedProposal) {
    return {
      coverageScore: 0, totalExposure: 0,
      matched: [], missingFromProposal: [], extraInProposal: [],
      quantityMismatches: [], exclusionConflicts: [],
    };
  }

  // Filter to base bid items only (exclude alternates)
  const baseItems = estimateItems.filter(i =>
    !i.bidContext || i.bidContext === 'base'
  );

  // Group estimate items by 2-digit division
  const estimateByDivision = {};
  for (const item of baseItems) {
    const div = normalizeCSI(item.code) || normalizeCSI(item.division) || '00';
    if (!estimateByDivision[div]) estimateByDivision[div] = [];
    estimateByDivision[div].push(item);
  }

  // Group proposal line items by CSI code
  const proposalByDivision = {};
  const proposalItems = parsedProposal.lineItems || [];
  for (const item of proposalItems) {
    const div = normalizeCSI(item.csiCode);
    if (!div) continue;
    if (!proposalByDivision[div]) proposalByDivision[div] = [];
    proposalByDivision[div].push(item);
  }

  const allEstimateDivisions = Object.keys(estimateByDivision);
  const allProposalDivisions = Object.keys(proposalByDivision);

  const matched = [];
  const missingFromProposal = [];
  const quantityMismatches = [];

  // Compare each estimate division against proposal
  for (const div of allEstimateDivisions) {
    const estItems = estimateByDivision[div];
    const propItems = proposalByDivision[div];
    const estimateTotal = estItems.reduce((sum, i) => sum + getItemTotal(i), 0);

    if (!propItems || propItems.length === 0) {
      // Division missing from proposal entirely
      if (estimateTotal > 0) {
        missingFromProposal.push({
          division: div,
          divisionName: getDivisionName(div),
          estimateItems: estItems.map(i => ({
            code: i.code,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            total: getItemTotal(i),
          })),
          estimatedExposure: Math.round(estimateTotal),
        });
      }
    } else {
      const proposalTotal = propItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      matched.push({
        division: div,
        divisionName: getDivisionName(div),
        estimateTotal: Math.round(estimateTotal),
        proposalTotal: Math.round(proposalTotal),
        items: propItems.map(i => ({
          csiCode: i.csiCode,
          description: i.description,
          amount: i.amount,
        })),
      });

      // Check quantity mismatches — for each estimate item, find best-matching
      // proposal item (same unit, closest description) to avoid cartesian explosion
      for (const estItem of estItems) {
        const estQty = Number(estItem.quantity) || 0;
        if (estQty === 0) continue;
        const estUnit = (estItem.unit || '').toLowerCase().replace(/\./g, '');
        if (!estUnit) continue;

        // Find the best proposal match: same unit, prefer description overlap
        let bestMatch = null;
        let bestScore = -1;
        for (const propItem of propItems) {
          const propQty = Number(propItem.quantity) || 0;
          if (propQty === 0) continue;
          const propUnit = (propItem.unit || '').toLowerCase().replace(/\./g, '');
          if (estUnit !== propUnit) continue;

          // Score by description word overlap
          const estWords = new Set((estItem.description || '').toLowerCase().split(/\s+/));
          const propWords = (propItem.description || '').toLowerCase().split(/\s+/);
          const overlap = propWords.filter(w => estWords.has(w)).length;
          if (overlap > bestScore) {
            bestScore = overlap;
            bestMatch = propItem;
          }
        }

        if (bestMatch) {
          const propQty = Number(bestMatch.quantity);
          const pctDiff = Math.round(((propQty - estQty) / estQty) * 100);
          if (Math.abs(pctDiff) > 20) {
            quantityMismatches.push({
              division: div,
              divisionName: getDivisionName(div),
              estimateItem: estItem.description,
              proposalItem: bestMatch.description,
              estQty, propQty, unit: estItem.unit,
              pctDiff,
            });
          }
        }
      }
    }
  }

  // Extra scope: divisions in proposal but not in estimate
  const extraInProposal = [];
  for (const div of allProposalDivisions) {
    if (!estimateByDivision[div]) {
      const propItems = proposalByDivision[div];
      for (const item of propItems) {
        extraInProposal.push({
          csiCode: item.csiCode,
          description: item.description,
          amount: Number(item.amount) || 0,
        });
      }
    }
  }

  // Exclusion conflicts
  const exclusions = parsedProposal.exclusions || [];
  const exclusionConflicts = findExclusionConflicts(exclusions, estimateByDivision);

  // Coverage score: % of estimate divisions (by $) covered by proposal
  const totalEstimateValue = allEstimateDivisions.reduce((sum, div) =>
    sum + estimateByDivision[div].reduce((s, i) => s + getItemTotal(i), 0), 0);

  const coveredValue = matched.reduce((sum, m) => sum + m.estimateTotal, 0);
  const coverageScore = totalEstimateValue > 0
    ? Math.round((coveredValue / totalEstimateValue) * 100)
    : 0;

  const totalExposure = missingFromProposal.reduce((sum, m) => sum + m.estimatedExposure, 0)
    + exclusionConflicts.reduce((sum, c) => sum + c.estimatedExposure, 0);

  return {
    coverageScore,
    totalExposure: Math.round(totalExposure),
    matched,
    missingFromProposal,
    extraInProposal,
    quantityMismatches,
    exclusionConflicts,
  };
}
