// Module calculation engine
// Evaluates formulas and conditions for Smart Assembly Modules
// Generic — works for any module defined in modules.js
import { nn } from "@/utils/format";
import { parseRebarSpec } from "@/constants/modules";
import { getMeasuredQtyCtx } from "@/utils/measurementCalc";
import { evaluateArithmeticExpression, evaluateBooleanExpression } from "@/utils/safeExpression";

// Parse framing-specific spec strings into numeric formula variables
// Called per-instance since each wall type has its own specs
function computeFramingContext(ctx, specs) {
  // Parse EstSpacing: "12\" OC" → 12
  const spacingMatch = (specs.EstSpacing || '12" OC').match(/(\d+)/);
  ctx.EstSpacingNum = spacingMatch ? parseInt(spacingMatch[1]) : 12;

  // Parse TopPlates: "Single"=1, "Double"=2, "Triple"=3
  const plateMap = { Single: 1, Double: 2, Triple: 3 };
  ctx.TopPlateCount = plateMap[specs.TopPlates] || 2;

  // Parse BotPlates: "Single"=1, "Double"=2
  ctx.BotPlateCount = plateMap[specs.BotPlates] || 1;

  // Parse sheet sizes: "4x10" → area = 40
  const parseSheet = sheetSpec => {
    const m = String(sheetSpec || "4x8").match(/(\d+)x(\d+)/);
    const w = m ? parseInt(m[1]) : 4;
    const h = m ? parseInt(m[2]) : 8;
    return w * h;
  };

  ctx.SheetArea = parseSheet(specs.SheathSheet);
  ctx.DwSheetArea = parseSheet(specs.DwSheet);

  // Parse per-side GWB layers (backward-compat: fall back to old DwLayers if present)
  const oldLayers = parseInt(specs.DwLayers) || 0;
  ctx.DwSide1 = parseInt(specs.DwLayersSide1) || (oldLayers || 1);
  ctx.DwSide2 = parseInt(specs.DwLayersSide2) || 0;
  ctx.DwTotalLayers = ctx.DwSide1 + ctx.DwSide2;
  ctx.DwFinishSides = (ctx.DwSide1 > 0 ? 1 : 0) + (ctx.DwSide2 > 0 ? 1 : 0);
  // Backward compat alias
  ctx.DwLayerCount = ctx.DwTotalLayers || 1;

  // Parse DwFinish: "Level 4" → 1.0, "Level 5" → 1.5 (skim coat = 50% more compound)
  ctx.DwFinishMult = specs.DwFinish === "Level 5" ? 1.5 : 1;

  // Drywall effective height: use DwHeight if > 0, otherwise fall back to WallHeight
  const dwH = parseFloat(specs.DwHeight);
  ctx.DwHeightEff = dwH && dwH > 0 ? dwH : parseFloat(specs.WallHeight) || 9;

  // ── Metal Stud context parsing ──
  // Parse MSSpacing: "16\" OC" → 16
  const msSpacingMatch = (specs.MSSpacing || '16" OC').match(/(\d+)/);
  ctx.MSSpacingNum = msSpacingMatch ? parseInt(msSpacingMatch[1]) : 16;

  // Track count: "Top & Bottom"=2, "Top Only"=1, "Bottom Only"=1
  const trackMap = { "Top & Bottom": 2, "Top Only": 1, "Bottom Only": 1 };
  ctx.MSTrackCount = trackMap[specs.MSTrack] || 2;

  // Bridging rows: "None"=0, "Mid-Height"=1, "Third Points"=2
  const bridgeMap = { None: 0, "Mid-Height": 1, "Third Points": 2 };
  ctx.MSBridgingRows = bridgeMap[specs.MSBridging] || 0;

  // ── CMU-specific context parsing ──
  // Parse CMUWidth: "8\"" → 8
  const cmuWMatch = (specs.CMUWidth || '8"').match(/(\d+)/);
  ctx.CMUWidthNum = cmuWMatch ? parseInt(cmuWMatch[1]) : 8;

  // Vertical rebar — reuse existing parseRebarSpec
  if (specs.CMUVertRebar && specs.CMUVertRebar !== "None") {
    const vr = parseRebarSpec(specs.CMUVertRebar);
    ctx.CMUVertRebarSpacing = vr.spacing;
    ctx.CMUVertRebarLbsPerFt = vr.lbsPerFt;
  } else {
    ctx.CMUVertRebarSpacing = 48;
    ctx.CMUVertRebarLbsPerFt = 0;
  }

  // Horizontal reinforcement → LF multiplier per ft of wall height
  // Joint reinf @ 2 courses = every 16" = 0.75/ft; every course = 1.5/ft
  // Bond beam @ 48"OC = 0.25/ft; @ 24"OC = 0.5/ft
  const hSpec = specs.CMUHorizReinf || "None";
  if (hSpec.includes("every course")) ctx.CMUHorizCourseMult = 1.5;
  else if (hSpec.includes("2 courses")) ctx.CMUHorizCourseMult = 0.75;
  else if (hSpec.includes('48"')) ctx.CMUHorizCourseMult = 0.25;
  else if (hSpec.includes('24"')) ctx.CMUHorizCourseMult = 0.5;
  else ctx.CMUHorizCourseMult = 0;

  // Grout — CY per SF of wall face (scaled by block width relative to 8")
  const widthMult = (ctx.CMUWidthNum || 8) / 8;
  if (specs.CMUGrout === "Solid Grouted") {
    ctx.CMUGroutCYPerSF = 0.004 * widthMult;
  } else {
    // Rebar cells only: grout where vertical rebar exists
    const vs = ctx.CMUVertRebarSpacing || 48;
    ctx.CMUGroutCYPerSF = (12 / vs) * 0.0035 * widthMult;
  }

  // Control joint spacing — numeric (20, 24, 28, 32) or "None"
  const cjVal = parseFloat(specs.CMUControlJt);
  ctx.CMUControlJtNum = isNaN(cjVal) ? 24 : cjVal;

  // ── Concrete (Cast-in-Place) context parsing ──
  // Parse wall thickness: "8\"" → 8
  const concThickMatch = (specs.ConcThickness || '8"').match(/(\d+)/);
  ctx.ConcThickNum = concThickMatch ? parseInt(concThickMatch[1]) : 8;

  // CY of concrete per SF of wall face (thickness / 12 / 27, with 5% waste)
  ctx.ConcCYPerSF = (ctx.ConcThickNum / 12 / 27) * 1.05;

  // Vertical rebar — reuse parseRebarSpec
  if (specs.ConcVertRebar && specs.ConcVertRebar !== "None") {
    const cvr = parseRebarSpec(specs.ConcVertRebar);
    ctx.ConcVertRebarSpacing = cvr.spacing;
    ctx.ConcVertRebarLbsPerFt = cvr.lbsPerFt;
  } else {
    ctx.ConcVertRebarSpacing = 12;
    ctx.ConcVertRebarLbsPerFt = 0;
  }

  // Horizontal rebar — reuse parseRebarSpec
  if (specs.ConcHorizRebar && specs.ConcHorizRebar !== "None") {
    const chr = parseRebarSpec(specs.ConcHorizRebar);
    ctx.ConcHorizRebarSpacing = chr.spacing;
    ctx.ConcHorizRebarLbsPerFt = chr.lbsPerFt;
  } else {
    ctx.ConcHorizRebarSpacing = 12;
    ctx.ConcHorizRebarLbsPerFt = 0;
  }

  // Form ties per SF — approximately 1 per 4 SF
  ctx.ConcFormTiesPerSF = 0.25;

  // ── ICF (Insulated Concrete Forms) context parsing ──
  // Parse core width: "8\"" → 8
  const icfCoreMatch = (specs.ICFCoreWidth || '8"').match(/(\d+)/);
  ctx.ICFCoreNum = icfCoreMatch ? parseInt(icfCoreMatch[1]) : 8;

  // CY of concrete per SF of wall face (core width / 12 / 27, with 5% waste)
  ctx.ICFConcCYPerSF = (ctx.ICFCoreNum / 12 / 27) * 1.05;

  // Vertical rebar — reuse parseRebarSpec
  if (specs.ICFVertRebar && specs.ICFVertRebar !== "None") {
    const ivr = parseRebarSpec(specs.ICFVertRebar);
    ctx.ICFVertRebarSpacing = ivr.spacing;
    ctx.ICFVertRebarLbsPerFt = ivr.lbsPerFt;
  } else {
    ctx.ICFVertRebarSpacing = 12;
    ctx.ICFVertRebarLbsPerFt = 0;
  }

  // Horizontal rebar — reuse parseRebarSpec
  if (specs.ICFHorizRebar && specs.ICFHorizRebar !== "None") {
    const ihr = parseRebarSpec(specs.ICFHorizRebar);
    ctx.ICFHorizRebarSpacing = ihr.spacing;
    ctx.ICFHorizRebarLbsPerFt = ihr.lbsPerFt;
  } else {
    ctx.ICFHorizRebarSpacing = 12;
    ctx.ICFHorizRebarLbsPerFt = 0;
  }

  // ── Tilt-Up context parsing ──
  // Panel thickness: "5-1/2\"" → 5.5, "7-1/4\"" → 7.25, "9-1/4\"" → 9.25
  const tuThick = specs.TiltThickness || '5-1/2"';
  if (tuThick.includes("5-1/2")) ctx.TiltThickNum = 5.5;
  else if (tuThick.includes("7-1/4")) ctx.TiltThickNum = 7.25;
  else if (tuThick.includes("9-1/4")) ctx.TiltThickNum = 9.25;
  else ctx.TiltThickNum = 5.5;

  // Tilt-Up connections per LF of wall (approx 1 per 20 LF panel width)
  ctx.TiltConnectionsPerLF = 0.05;

  // ── Precast context parsing ──
  // Panel thickness: "6\"" → 6, "8\"" → 8
  const pcThickMatch = (specs.PrecastThickness || '8"').match(/(\d+)/);
  ctx.PrecastThickNum = pcThickMatch ? parseInt(pcThickMatch[1]) : 8;

  // Connections per LF (approx 1 per 15 LF panel width)
  ctx.PrecastConnectionsPerLF = 0.067;

  // ── SIP context parsing ──
  // Panel thickness: "4-1/2\"" → 4.5, "6-1/2\"" → 6.5, etc.
  const sipThick = specs.SIPThickness || '6-1/2"';
  if (sipThick.includes("4-1/2")) ctx.SIPThickNum = 4.5;
  else if (sipThick.includes("6-1/2")) ctx.SIPThickNum = 6.5;
  else if (sipThick.includes("8-1/4")) ctx.SIPThickNum = 8.25;
  else if (sipThick.includes("10-1/4")) ctx.SIPThickNum = 10.25;
  else ctx.SIPThickNum = 6.5;

  // ── 3D Printed context parsing ──
  // Wall thickness: "6\"" → 6
  const printThickMatch = (specs.PrintThickness || '8"').match(/(\d+)/);
  ctx.PrintThickNum = printThickMatch ? parseInt(printThickMatch[1]) : 8;

  // CF of print material per SF of wall face (thickness / 12, with 10% waste for layering)
  ctx.PrintCFPerSF = (ctx.PrintThickNum / 12) * 1.1;

  // ══════════════════════════════════════════════════════════════
  // FLOORS MODULE — context parsing
  // ══════════════════════════════════════════════════════════════

  // ── Wood Framing (floors) ──
  // Joist spacing: "16\" OC" → 16
  const flrSpacingMatch = (specs.FlrJoistSpacing || '16" OC').match(/(\d+)/);
  ctx.FlrJoistSpacingNum = flrSpacingMatch ? parseInt(flrSpacingMatch[1]) : 16;
  ctx.FlrJoistLFPerSF = 12 / ctx.FlrJoistSpacingNum;

  // ── Wood Trusses (floors) ──
  const trussSpacingMatch = (specs.TrussSpacing || '24" OC').match(/(\d+)/);
  ctx.TrussSpacingNum = trussSpacingMatch ? parseInt(trussSpacingMatch[1]) : 24;
  ctx.TrussLFPerSF = 12 / ctx.TrussSpacingNum;

  // ── Steel Deck (floors) ──
  // Concrete fill depth: "2.5\" NW" → 2.5, "3\" LW" → 3
  const deckFillSpec = specs.DeckConcFill || "None";
  const deckFillMatch = deckFillSpec.match(/([\d.]+)/);
  ctx.DeckConcFillDepth = deckFillMatch ? parseFloat(deckFillMatch[1]) : 0;
  ctx.DeckConcCYPerSF = ctx.DeckConcFillDepth > 0 ? (ctx.DeckConcFillDepth / 12 / 27) * 1.05 : 0;
  ctx.DeckShearStudsPerSF = 0.5;

  // ── Concrete on Deck (floors) ──
  const elevSlabMatch = (specs.ElevSlabThick || '6"').match(/(\d+)/);
  ctx.ElevSlabThickNum = elevSlabMatch ? parseInt(elevSlabMatch[1]) : 6;
  ctx.ElevSlabCYPerSF = (ctx.ElevSlabThickNum / 12 / 27) * 1.05;

  // Top rebar
  if (specs.ElevSlabTopRebar && specs.ElevSlabTopRebar !== "None") {
    const tr = parseRebarSpec(specs.ElevSlabTopRebar);
    ctx.ElevSlabTopRebarSpacing = tr.spacing;
    ctx.ElevSlabTopRebarLbsPerFt = tr.lbsPerFt;
  } else {
    ctx.ElevSlabTopRebarSpacing = 12;
    ctx.ElevSlabTopRebarLbsPerFt = 0;
  }

  // Bottom rebar
  if (specs.ElevSlabBotRebar && specs.ElevSlabBotRebar !== "None") {
    const br = parseRebarSpec(specs.ElevSlabBotRebar);
    ctx.ElevSlabBotRebarSpacing = br.spacing;
    ctx.ElevSlabBotRebarLbsPerFt = br.lbsPerFt;
  } else {
    ctx.ElevSlabBotRebarSpacing = 12;
    ctx.ElevSlabBotRebarLbsPerFt = 0;
  }

  // ── Precast Plank (floors) ──
  const pcToppingSpec = specs.PlankTopping || "None";
  const pcToppingMatch = pcToppingSpec.match(/([\d.]+)/);
  ctx.PlankToppingDepth = pcToppingMatch ? parseFloat(pcToppingMatch[1]) : 0;
  ctx.PlankToppingCYPerSF = ctx.PlankToppingDepth > 0 ? (ctx.PlankToppingDepth / 12 / 27) * 1.05 : 0;
  ctx.PlankJointSpacing = 48; // 4' plank width

  // ── CLT (floors) ──
  ctx.CLTConnPerSF = 0.5;

  // ── Finish waste factors ──
  const ft = specs.FlrFinishType || "";
  if (ft.includes("Tile") || ft.includes("Terrazzo")) ctx.FinishWaste = 1.1;
  else if (ft.includes("Hardwood")) ctx.FinishWaste = 1.08;
  else ctx.FinishWaste = 1.05;

  // ══════════════════════════════════════════════════════════════
  // ROOF CONTEXT VARIABLES
  // ══════════════════════════════════════════════════════════════

  // ── Roof Slope Factor (shared across all roof materials) ──
  const slopeSpec = specs.RoofSlope || "4:12";
  if (slopeSpec === "Flat") {
    ctx.RoofSlopeRise = 0;
    ctx.RoofSlopeFactor = 1;
  } else {
    const slopeMatch = slopeSpec.match(/(\d+):12/);
    ctx.RoofSlopeRise = slopeMatch ? parseInt(slopeMatch[1]) : 4;
    ctx.RoofSlopeFactor = Math.sqrt(1 + Math.pow(ctx.RoofSlopeRise / 12, 2));
  }

  // ── Wood Trusses (roof) ──
  const roofTrussSpMatch = (specs.RoofTrussSpacing || '24" OC').match(/(\d+)/);
  ctx.RoofTrussSpacingNum = roofTrussSpMatch ? parseInt(roofTrussSpMatch[1]) : 24;
  // Trusses are EA — quantity driven by building length / spacing
  // Using perimeter approximation: RoofSF / average span * (12 / spacing)
  // Simplified: trusses per SF = 12 / (spacing * averageSpan), but we use a direct factor
  ctx.RoofTrussPerSF = 12 / (ctx.RoofTrussSpacingNum * 12); // 1 truss per (spacing_ft) per LF of run

  // ── Wood Rafters (roof) ──
  const rafterSpMatch = (specs.RafterSpacing || '16" OC').match(/(\d+)/);
  ctx.RafterSpacingNum = rafterSpMatch ? parseInt(rafterSpMatch[1]) : 16;
  ctx.RafterLFPerSF = 12 / ctx.RafterSpacingNum;

  // ── Steel Joist (roof) ──
  const steelRoofJoistSpMap = { "4ft OC": 48, "5ft OC": 60, "6ft OC": 72 };
  ctx.SteelRoofJoistSpacingNum = steelRoofJoistSpMap[specs.SteelRoofJoistSpacing] || 60;
  ctx.SteelRoofJoistLFPerSF = 12 / ctx.SteelRoofJoistSpacingNum;

  // ── Precast/Concrete (roof) ──
  const precastRoofTopping = specs.PrecastRoofTopping || "None";
  const precastRoofTopMatch = precastRoofTopping.match(/([\d.]+)/);
  ctx.PrecastRoofToppingDepth = precastRoofTopMatch ? parseFloat(precastRoofTopMatch[1]) : 0;
  ctx.PrecastRoofToppingCYPerSF = ctx.PrecastRoofToppingDepth > 0 ? (ctx.PrecastRoofToppingDepth / 12 / 27) * 1.05 : 0;

  // ── Roof Finish waste factors ──
  const rfType = specs.RoofFinishType || "";
  if (rfType.includes("Tile") || rfType.includes("Slate")) ctx.RoofFinishWaste = 1.15;
  else if (rfType.includes("Shingles")) ctx.RoofFinishWaste = 1.1;
  else ctx.RoofFinishWaste = 1.05; // membranes, metal

  // ── Gutter downspout factor ──
  ctx.DownspoutPerLF = 1 / 30; // one downspout per ~30 LF of gutter

  // ══════════════════════════════════════════════════════════════
  // CEILINGS CONTEXT VARIABLES
  // ══════════════════════════════════════════════════════════════

  // ── Cathedral slope factor (1.0 for flat, slope factor for cathedral) ──
  const isCathedral = specs.CeilCathedral === "Yes";
  if (isCathedral) {
    const ceilPitchSpec = specs.CeilPitch || "4:12";
    const ceilPitchMatch = ceilPitchSpec.match(/(\d+):12/);
    const ceilRise = ceilPitchMatch ? parseInt(ceilPitchMatch[1]) : 4;
    ctx.CeilSlopeFactor = Math.sqrt(1 + Math.pow(ceilRise / 12, 2));
  } else {
    ctx.CeilSlopeFactor = 1;
  }

  // ── Drywall layers ──
  ctx.CeilDwLayers = specs.CeilType === "Drywall 2-Layer" ? 2 : 1;

  // ── Paint coat count ──
  const paintSpec = specs.CeilPaint || "None";
  if (paintSpec.includes("2 Coat") || paintSpec.includes("Primer + 2")) ctx.CeilPaintCoats = 2;
  else if (paintSpec.includes("1 Coat")) ctx.CeilPaintCoats = 1;
  else ctx.CeilPaintCoats = 0;
}

// Build a context object from specs + driving quantities for formula evaluation
// GENERIC — reads formulaVar from module definition, no hardcoded maps
// scaleCtx = { calibrations, scales, dpi, drawings } — needed to compute real quantities from measurements
export function buildCalcContext(moduleDef, specs, takeoffs, itemTakeoffIds, scaleCtx) {
  const ctx = { ...specs };

  // GENERIC: Build driving map from module definition's formulaVar properties
  moduleDef.categories.forEach(cat => {
    cat.items.forEach(item => {
      if (item.type === "driving" && item.formulaVar) {
        const toId = itemTakeoffIds[item.id];
        if (toId) {
          const to = takeoffs.find(t => t.id === toId);
          if (to) {
            const measuredQty = scaleCtx ? getMeasuredQtyCtx(to, scaleCtx) : null;
            ctx[item.formulaVar] = measuredQty !== null ? measuredQty : nn(to.quantity);
          } else {
            ctx[item.formulaVar] = 0;
          }
        } else {
          ctx[item.formulaVar] = 0;
        }
      }
    });
  });

  // GENERIC: Compute context helpers from module definition
  (moduleDef.contextHelpers || []).forEach(helper => {
    if (helper.type === "rebarLineal") {
      const rebar = parseRebarSpec(specs[helper.specId]);
      ctx[helper.id] = rebar.lbsPerFt * (12 / rebar.spacing);
    } else if (helper.type === "rebarArea") {
      const rebar = parseRebarSpec(specs[helper.specId]);
      ctx[helper.id] = rebar.lbsPerFt * (12 / rebar.spacing) * 2;
    }
  });

  // Module-specific: parse spec strings into numeric variables
  if (moduleDef.id === "walls" || moduleDef.id === "floors" || moduleDef.id === "roof") {
    computeFramingContext(ctx, specs);
  }
  if (moduleDef.id === "steel") {
    computeSteelContext(ctx, specs);
  }

  return ctx;
}

// Steel module: compute context variables for structural steel formulas
function computeSteelContext(ctx, specs) {
  // ── Structural Framing ratios (per ton of structural steel) ──
  ctx.SteelConnectionsPerTon = 2;
  ctx.SteelBoltsLbsPerTon = 50;
  ctx.SteelWeldsLFPerTon = 10;
  ctx.SteelPrimerSFPerTon = 500;
  ctx.SteelFireproofSFPerTon = 500;
  ctx.SteelAnchorBoltsPerTon = 4;
  ctx.SteelBasePlatesPerTon = 2;

  // ── Steel Joists: parse spacing ──
  const joistSpacingMatch = (specs.JoistSpacing || "5' OC").match(/(\d+)/);
  const joistSpacingFt = joistSpacingMatch ? parseInt(joistSpacingMatch[1]) : 5;
  ctx.JoistsLFPerSF = 1 / joistSpacingFt;
  ctx.JoistGirdersPerSF = 0.002;

  // ── Steel Decking: parse composite fill depth ──
  const compSpec = specs.CompositeType || "None";
  const compMatch = compSpec.match(/([\d.]+)/);
  ctx.CompositeFillDepth = compMatch ? parseFloat(compMatch[1]) : 0;
  ctx.CompositeCYPerSF = ctx.CompositeFillDepth > 0 ? (ctx.CompositeFillDepth / 12 / 27) * 1.05 : 0;
  ctx.DeckShearStudsPerSF = 0.5;
}

// Safely evaluate a formula string with variable substitution
// Uses cached regex per variable key for performance
export function evalModuleFormula(formula, context) {
  if (!formula || !formula.trim()) return 0;
  try {
    return evaluateArithmeticExpression(formula, context);
  } catch {
    return 0;
  }
}

// Check a condition string (e.g., "VaporBarrier !== 'None'")
export function evalCondition(condition, context) {
  if (!condition) return true;
  try {
    return evaluateBooleanExpression(condition, context);
  } catch {
    return false; // If we can't evaluate (missing variables), hide the item
  }
}

// Apply rounding based on item definition
// Items with round: "ceil" get Math.ceil (you can't buy 3.7 sheets)
function applyRounding(qty, item) {
  if (item.round === "ceil") return Math.ceil(qty);
  return Math.round(qty * 100) / 100;
}

// Compute all derived quantities for a module instance
// Returns { itemId: { qty: number, active: boolean }, ... }
// scaleCtx is optional but required for live quantity updates from measurements
export function computeAllDerived(moduleDef, specs, takeoffs, itemTakeoffIds, scaleCtx) {
  const ctx = buildCalcContext(moduleDef, specs, takeoffs, itemTakeoffIds, scaleCtx);
  const results = {};

  // First pass: compute all derived items
  moduleDef.categories.forEach(cat => {
    cat.items.forEach(item => {
      if (item.type === "derived") {
        const active = evalCondition(item.condition, ctx);
        let qty = 0;
        if (active && item.formula) {
          qty = evalModuleFormula(item.formula, ctx);
          qty = applyRounding(qty, item);
          if (qty < 0) qty = 0;
          // Store computed qty in context so later items can reference it
          // Use pattern: item id "struct-exc" → "StructExcQty" (PascalCase + Qty)
          const camel = item.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          const varName = camel.charAt(0).toUpperCase() + camel.slice(1) + "Qty";
          ctx[varName] = qty;
        }
        results[item.id] = { qty, active };
      }
    });
  });

  return results;
}

// Get the driving quantity for a module item from its linked takeoff
// scaleCtx is optional — when provided, computes real measured qty from measurements
export function getDrivingQty(itemId, itemTakeoffIds, takeoffs, scaleCtx) {
  const toId = itemTakeoffIds[itemId];
  if (!toId) return 0;
  const to = takeoffs.find(t => t.id === toId);
  if (!to) return 0;
  if (scaleCtx) {
    const measuredQty = getMeasuredQtyCtx(to, scaleCtx);
    return measuredQty !== null ? measuredQty : nn(to.quantity);
  }
  return nn(to.quantity);
}

// Helper: resolve driving qty from itemTakeoffIds map (used for cross-instance aggregation)
function resolveDrivingQty(itemId, itemTakeoffIds, takeoffs, scaleCtx) {
  const toId = itemTakeoffIds[itemId];
  if (!toId) return 0;
  const to = takeoffs.find(t => t.id === toId);
  if (!to) return 0;
  if (scaleCtx) {
    const measuredQty = getMeasuredQtyCtx(to, scaleCtx);
    return measuredQty !== null ? measuredQty : nn(to.quantity);
  }
  return nn(to.quantity);
}

// Enhanced version that handles multi-instance categories
// Returns: { itemId: { qty, active } } for single-instance items
//   PLUS: { "instanceId:itemId": { qty, active } } for multi-instance items
export function computeAllDerivedWithInstances(
  moduleDef,
  globalSpecs,
  takeoffs,
  globalItemTakeoffIds,
  categoryInstances,
  scaleCtx,
) {
  const results = {};

  // Build base context from global specs + all global driving items
  const globalCtx = buildCalcContext(moduleDef, globalSpecs, takeoffs, globalItemTakeoffIds, scaleCtx);

  // ── PASS 1: Process multi-instance categories first ──
  // These produce quantities that may feed into derived-only categories (e.g., drywall)
  moduleDef.categories.forEach(cat => {
    if (!cat.multiInstance) return;
    const instances = categoryInstances?.[cat.id] || [];

    // Build spec defaults map from category definition so conditions always resolve
    const specDefaults = {};
    (cat.specs || []).forEach(s => {
      if (s.default !== undefined) specDefaults[s.id] = s.default;
    });

    instances.forEach(catInst => {
      // Merge: global itemTakeoffIds + instance itemTakeoffIds (instance wins)
      const mergedIds = { ...globalItemTakeoffIds, ...catInst.itemTakeoffIds };
      // Merge: spec defaults + global specs + instance specs (instance wins)
      const mergedSpecs = { ...specDefaults, ...globalSpecs, ...catInst.specs };
      const instCtx = buildCalcContext(moduleDef, mergedSpecs, takeoffs, mergedIds, scaleCtx);

      // Build set of disabled item IDs from layer toggles
      const disabledItemIds = new Set();
      if (cat.layers && catInst.layerEnabled) {
        cat.layers.forEach(layer => {
          if (catInst.layerEnabled[layer.id] === false) {
            (layer.itemIds || []).forEach(id => disabledItemIds.add(id));
          }
        });
      }

      cat.items.forEach(item => {
        if (item.type === "derived") {
          // Skip items in disabled layers
          if (disabledItemIds.has(item.id)) {
            results[`${catInst.id}:${item.id}`] = { qty: 0, active: false };
            return;
          }
          const active = evalCondition(item.condition, instCtx);
          let qty = 0;
          if (active && item.formula) {
            qty = evalModuleFormula(item.formula, instCtx);
            qty = applyRounding(qty, item);
            if (qty < 0) qty = 0;
          }
          // Key: "instanceId:itemId" for per-instance results
          results[`${catInst.id}:${item.id}`] = { qty, active };
        }
      });
    });
  });

  // ── PASS 1.5: Cross-instance aggregation ──
  // Compute TotalDwSF for the framing module's drywall category
  if (moduleDef.id === "walls") {
    let totalDwSF = 0;

    // Exterior walls: 1 side (interior face gets drywall)
    const extCat = moduleDef.categories.find(c => c.id === "ext-walls");
    const extDefaults = {};
    (extCat?.specs || []).forEach(s => {
      if (s.default !== undefined) extDefaults[s.id] = s.default;
    });
    const extInstances = categoryInstances?.["ext-walls"] || [];
    extInstances.forEach(catInst => {
      if (catInst.layerEnabled?.drywall === false) return; // skip if drywall layer toggled off
      const mergedIds = { ...globalItemTakeoffIds, ...catInst.itemTakeoffIds };
      const mergedSpecs = { ...extDefaults, ...globalSpecs, ...catInst.specs };
      if (mergedSpecs.DwType === "None") return; // skip if drywall disabled
      const extLF = resolveDrivingQty("ext-wall-lf", mergedIds, takeoffs, scaleCtx);
      const dwH = parseFloat(mergedSpecs.DwHeight);
      const dwHeightEff = dwH && dwH > 0 ? dwH : nn(mergedSpecs.WallHeight);
      totalDwSF += extLF * dwHeightEff;
    });

    // Interior walls: 2 sides (both faces get drywall)
    const intCat = moduleDef.categories.find(c => c.id === "int-walls");
    const intDefaults = {};
    (intCat?.specs || []).forEach(s => {
      if (s.default !== undefined) intDefaults[s.id] = s.default;
    });
    const intInstances = categoryInstances?.["int-walls"] || [];
    intInstances.forEach(catInst => {
      if (catInst.layerEnabled?.drywall === false) return; // skip if drywall layer toggled off
      const mergedIds = { ...globalItemTakeoffIds, ...catInst.itemTakeoffIds };
      const mergedSpecs = { ...intDefaults, ...globalSpecs, ...catInst.specs };
      if (mergedSpecs.DwType === "None") return; // skip if drywall disabled
      const intLF = resolveDrivingQty("int-wall-lf", mergedIds, takeoffs, scaleCtx);
      const dwH = parseFloat(mergedSpecs.DwHeight);
      const dwHeightEff = dwH && dwH > 0 ? dwH : nn(mergedSpecs.WallHeight);
      totalDwSF += intLF * dwHeightEff * 2;
    });

    globalCtx.TotalDwSF = totalDwSF;
  }

  // ── PASS 2: Process non-multi-instance categories ──
  // These include derived-only (e.g., excavation, drywall) and single-instance measurement categories
  moduleDef.categories.forEach(cat => {
    if (cat.multiInstance) return;
    cat.items.forEach(item => {
      if (item.type === "derived") {
        const active = evalCondition(item.condition, globalCtx);
        let qty = 0;
        if (active && item.formula) {
          qty = evalModuleFormula(item.formula, globalCtx);
          qty = applyRounding(qty, item);
          if (qty < 0) qty = 0;
          const camel = item.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          const varName = camel.charAt(0).toUpperCase() + camel.slice(1) + "Qty";
          globalCtx[varName] = qty;
        }
        results[item.id] = { qty, active };
      }
    });
  });

  return results;
}
