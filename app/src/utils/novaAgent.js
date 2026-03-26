// ═══════════════════════════════════════════════════════════════════════
// NOVAAgent — Self-improving agent framework for construction intelligence
// Inspired by Meta's HyperAgents but domain-specific and outcome-driven.
//
// Pattern: Task Agent does work → Metric measures quality → Meta Agent
// analyzes history → adjusts config → next run is better.
//
// Key difference from HyperAgents: our metric is REAL BID OUTCOMES,
// not computational benchmarks. Every correction Matt makes is expert-
// labeled training signal worth 100x automated metrics.
// ═══════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "nova-agent-state";

// ── Load/save agent state from localStorage ──
function loadAgentState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAgentState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full or unavailable */ }
}

// ═══════════════════════════════════════════════════════════════════════
// NOVAAgent class — the core self-improving agent
// ═══════════════════════════════════════════════════════════════════════
export class NOVAAgent {
  constructor(name, defaultConfig = {}) {
    this.name = name;
    this.defaultConfig = { ...defaultConfig };

    // Load persisted state
    const saved = loadAgentState();
    const agentState = saved[name] || {};
    this.config = { ...defaultConfig, ...(agentState.config || {}) };
    this.history = agentState.history || [];
    this.improvementLog = agentState.improvementLog || [];
    this.version = agentState.version || 1;
    this.totalCorrections = agentState.totalCorrections || 0;
    this.lastImproved = agentState.lastImproved || null;
  }

  // ── Persist state ──
  _save() {
    const all = loadAgentState();
    all[this.name] = {
      config: this.config,
      history: this.history.slice(-200), // keep last 200 entries
      improvementLog: this.improvementLog.slice(-50),
      version: this.version,
      totalCorrections: this.totalCorrections,
      lastImproved: this.lastImproved,
    };
    saveAgentState(all);
  }

  // ── Record a task run ──
  recordRun(input, result, score, metadata = {}) {
    this.history.push({
      timestamp: new Date().toISOString(),
      input: this._summarizeInput(input),
      resultSummary: this._summarizeResult(result),
      score,
      config: { ...this.config },
      metadata,
    });
    this._save();
    return this;
  }

  // ── Record a user correction ──
  recordCorrection(original, corrected, metadata = {}) {
    this.totalCorrections++;
    this.history.push({
      timestamp: new Date().toISOString(),
      type: "correction",
      original: this._summarizeResult(original),
      corrected: this._summarizeResult(corrected),
      config: { ...this.config },
      metadata,
    });
    this._save();
    return this;
  }

  // ── Analyze performance and suggest improvements ──
  analyze() {
    const corrections = this.history.filter(h => h.type === "correction");
    const runs = this.history.filter(h => !h.type);

    if (corrections.length < 3) {
      return {
        ready: false,
        message: `Need at least 3 corrections to improve. Have ${corrections.length}.`,
        corrections: corrections.length,
        runs: runs.length,
      };
    }

    // Calculate current accuracy from recent corrections
    const recent = corrections.slice(-20);
    const patterns = this._findPatterns(recent);

    return {
      ready: true,
      corrections: corrections.length,
      runs: runs.length,
      version: this.version,
      patterns,
      currentConfig: { ...this.config },
      message: `${corrections.length} corrections analyzed. ${patterns.length} improvement patterns found.`,
    };
  }

  // ── Apply improvements based on correction analysis ──
  improve() {
    const analysis = this.analyze();
    if (!analysis.ready) return { improved: false, ...analysis };

    const corrections = this.history.filter(h => h.type === "correction");
    const adjustments = this._computeAdjustments(corrections);

    if (Object.keys(adjustments).length === 0) {
      return { improved: false, message: "No adjustments needed — current config is optimal for recent corrections." };
    }

    // Apply adjustments
    const oldConfig = { ...this.config };
    for (const [key, value] of Object.entries(adjustments)) {
      this.config[key] = value;
    }

    this.version++;
    this.lastImproved = new Date().toISOString();
    this.improvementLog.push({
      timestamp: this.lastImproved,
      version: this.version,
      adjustments,
      oldConfig,
      newConfig: { ...this.config },
      basedOn: corrections.length + " corrections",
    });

    this._save();

    console.log(`[NOVAAgent:${this.name}] Improved to v${this.version}:`, adjustments);

    return {
      improved: true,
      version: this.version,
      adjustments,
      oldConfig,
      newConfig: { ...this.config },
      message: `Agent improved to v${this.version}. ${Object.keys(adjustments).length} parameters adjusted.`,
    };
  }

  // ── Reset to defaults ──
  reset() {
    this.config = { ...this.defaultConfig };
    this.version = 1;
    this._save();
    return this;
  }

  // ── Get human-readable status ──
  getStatus() {
    return {
      name: this.name,
      version: this.version,
      config: { ...this.config },
      totalRuns: this.history.filter(h => !h.type).length,
      totalCorrections: this.totalCorrections,
      lastImproved: this.lastImproved,
      historySize: this.history.length,
      improvementCount: this.improvementLog.length,
    };
  }

  // ── Override these in subclasses ──
  _summarizeInput(input) {
    if (typeof input === "string") return input.slice(0, 100);
    if (typeof input === "object") return { keys: Object.keys(input || {}) };
    return String(input);
  }

  _summarizeResult(result) {
    if (Array.isArray(result)) return { count: result.length };
    if (typeof result === "object") return { keys: Object.keys(result || {}) };
    return String(result);
  }

  _findPatterns(corrections) {
    // Override in subclasses for domain-specific pattern detection
    return [];
  }

  _computeAdjustments(corrections) {
    // Override in subclasses for domain-specific parameter adjustment
    return {};
  }
}


// ═══════════════════════════════════════════════════════════════════════
// WallDetectionAgent — Self-improving wall detection from PDFs
// ═══════════════════════════════════════════════════════════════════════
export class WallDetectionAgent extends NOVAAgent {
  constructor() {
    super("wall-detector", {
      // Detection parameters (these get tuned by the meta agent)
      minLineWeight: 0.7,        // minimum stroke weight to consider as wall
      maxGapPx: 12,              // max gap between collinear segments to merge
      angleTolerance: 1.0,       // degrees tolerance for collinear detection
      minWallLengthPx: 30,       // minimum wall segment length in pixels
      residentialThreshold: 0.4, // % of paths at lightest weight → residential mode
      titleBlockExclude: true,   // exclude bottom 15% of sheet
      closedPathReject: true,    // reject closed paths (symbols, not walls)

      // Room detection parameters
      floodFillResolution: 5,    // grid cell size for flood fill (feet)
      minRoomAreaSF: 20,         // minimum room area to keep
      maxRoomAreaSF: 50000,      // maximum room area (larger = entire building)
    });
  }

  // ── Run wall detection with current config ──
  detect(paths, scale, sheetDims) {
    const config = this.config;
    const startTime = performance.now();

    // Step 1: Filter paths by weight threshold
    const threshold = this._computeThreshold(paths, config);
    const candidates = paths.filter(p => {
      const w = p.width || 0;
      if (w < threshold) return false;
      if (config.closedPathReject && p.closed) return false;
      return true;
    });

    // Step 2: Extract line segments from candidates
    const segments = [];
    for (const path of candidates) {
      for (const item of (path.items || [])) {
        if (item[0] === "l") { // line segment
          const start = item[1];
          const end = item[2];
          const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
          if (length < config.minWallLengthPx) continue;

          // Angle filter: keep roughly horizontal or vertical (±angleTolerance from 0/90/180/270)
          const angle = Math.abs(Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI);
          const nearH = angle < config.angleTolerance || Math.abs(angle - 180) < config.angleTolerance;
          const nearV = Math.abs(angle - 90) < config.angleTolerance || Math.abs(angle - 270) < config.angleTolerance;
          // Allow diagonal walls too (45° ± tolerance)
          const nearD = Math.abs(angle - 45) < config.angleTolerance * 3 ||
                        Math.abs(angle - 135) < config.angleTolerance * 3;

          if (!nearH && !nearV && !nearD) continue;

          // Title block exclusion
          if (config.titleBlockExclude && sheetDims) {
            const maxY = sheetDims.height * 0.85;
            if (start.y > maxY && end.y > maxY) continue;
          }

          segments.push({
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: end.y },
            weight: path.width || 0,
            length,
            angle,
          });
        }
      }
    }

    // Step 3: Merge collinear segments
    const merged = this._mergeCollinear(segments, config);

    // Step 4: Convert to feet if scale available
    const wallsFt = scale > 0 ? merged.map(w => ({
      ...w,
      startFt: { x: w.start.x / scale, y: w.start.y / scale },
      endFt: { x: w.end.x / scale, y: w.end.y / scale },
      lengthFt: w.length / scale,
    })) : merged;

    const elapsed = performance.now() - startTime;

    const result = {
      walls: wallsFt,
      wallCount: wallsFt.length,
      totalLF: wallsFt.reduce((sum, w) => sum + (w.lengthFt || w.length), 0),
      threshold,
      candidateCount: candidates.length,
      rawSegments: segments.length,
      elapsed: Math.round(elapsed),
      config: { ...config },
      version: this.version,
    };

    // Record the run
    this.recordRun(
      { pathCount: paths.length, scale, sheetDims },
      result,
      null, // score filled in when correction happens
      { elapsed }
    );

    return result;
  }

  // ── Adaptive threshold (residential vs commercial) ──
  _computeThreshold(paths, config) {
    const weights = paths.map(p => p.width || 0).filter(w => w > 0);
    if (weights.length === 0) return config.minLineWeight;

    const sorted = [...new Set(weights)].sort((a, b) => a - b);
    const lightest = sorted[0];
    const lightCount = weights.filter(w => w === lightest).length;

    // If lightest weight dominates → residential (hairline walls)
    if (lightCount / weights.length > config.residentialThreshold) {
      return Math.max(lightest - 0.01, 0); // include hairlines
    }

    return config.minLineWeight;
  }

  // ── Merge collinear segments ──
  _mergeCollinear(segments, config) {
    if (segments.length === 0) return [];

    // Group by approximate angle (horizontal vs vertical vs diagonal)
    const groups = { h: [], v: [], d: [] };
    for (const seg of segments) {
      const a = Math.abs(seg.angle);
      if (a < 20 || a > 160) groups.h.push(seg);
      else if (a > 70 && a < 110) groups.v.push(seg);
      else groups.d.push(seg);
    }

    const merged = [];

    // Merge within each group
    for (const [, group] of Object.entries(groups)) {
      // Sort by position (y for horizontal, x for vertical)
      const sorted = [...group];
      const used = new Set();

      for (let i = 0; i < sorted.length; i++) {
        if (used.has(i)) continue;
        let wall = { ...sorted[i] };
        used.add(i);

        // Try to extend this wall by merging nearby collinear segments
        let extended = true;
        while (extended) {
          extended = false;
          for (let j = i + 1; j < sorted.length; j++) {
            if (used.has(j)) continue;
            const other = sorted[j];

            // Check if collinear and close enough to merge
            const gap = this._segmentGap(wall, other);
            if (gap < config.maxGapPx) {
              // Merge: extend wall to cover both segments
              wall = this._mergeTwo(wall, other);
              used.add(j);
              extended = true;
            }
          }
        }

        merged.push(wall);
      }
    }

    return merged;
  }

  _segmentGap(a, b) {
    // Compute minimum distance between endpoint of a and nearest point of b
    const d1 = Math.sqrt((a.end.x - b.start.x) ** 2 + (a.end.y - b.start.y) ** 2);
    const d2 = Math.sqrt((a.start.x - b.end.x) ** 2 + (a.start.y - b.end.y) ** 2);
    const d3 = Math.sqrt((a.end.x - b.end.x) ** 2 + (a.end.y - b.end.y) ** 2);
    const d4 = Math.sqrt((a.start.x - b.start.x) ** 2 + (a.start.y - b.start.y) ** 2);
    return Math.min(d1, d2, d3, d4);
  }

  _mergeTwo(a, b) {
    // Find the two endpoints that are farthest apart
    const points = [a.start, a.end, b.start, b.end];
    let maxDist = 0;
    let best = [a.start, a.end];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.sqrt((points[i].x - points[j].x) ** 2 + (points[i].y - points[j].y) ** 2);
        if (d > maxDist) {
          maxDist = d;
          best = [points[i], points[j]];
        }
      }
    }
    return {
      start: best[0],
      end: best[1],
      weight: Math.max(a.weight, b.weight),
      length: maxDist,
      angle: Math.abs(Math.atan2(best[1].y - best[0].y, best[1].x - best[0].x) * 180 / Math.PI),
    };
  }

  // ── Pattern detection from corrections ──
  _findPatterns(corrections) {
    const patterns = [];

    // Pattern 1: User consistently adds walls that were below weight threshold
    const addedWalls = corrections.filter(c =>
      c.corrected?.count > c.original?.count
    );
    if (addedWalls.length > corrections.length * 0.5) {
      patterns.push({
        type: "missed-walls",
        description: "User frequently adds walls the detector missed — threshold may be too high",
        confidence: addedWalls.length / corrections.length,
        suggestion: "Lower minLineWeight",
      });
    }

    // Pattern 2: User consistently removes false positive walls
    const removedWalls = corrections.filter(c =>
      c.corrected?.count < c.original?.count
    );
    if (removedWalls.length > corrections.length * 0.5) {
      patterns.push({
        type: "false-positives",
        description: "User frequently removes false walls — threshold may be too low",
        confidence: removedWalls.length / corrections.length,
        suggestion: "Raise minLineWeight or minWallLengthPx",
      });
    }

    return patterns;
  }

  // ── Compute parameter adjustments from corrections ──
  _computeAdjustments(corrections) {
    const recent = corrections.slice(-20);
    if (recent.length < 3) return {};

    const adjustments = {};

    // Count: more walls added than removed → lower threshold
    const added = recent.filter(c => c.corrected?.count > c.original?.count).length;
    const removed = recent.filter(c => c.corrected?.count < c.original?.count).length;

    if (added > removed * 2 && added > 3) {
      // Lower weight threshold by 10%
      adjustments.minLineWeight = Math.max(0.1, this.config.minLineWeight * 0.9);
      console.log(`[WallAgent] Lowering minLineWeight: ${this.config.minLineWeight} → ${adjustments.minLineWeight} (${added} missed wall corrections)`);
    } else if (removed > added * 2 && removed > 3) {
      // Raise weight threshold by 10%
      adjustments.minLineWeight = Math.min(3.0, this.config.minLineWeight * 1.1);
      console.log(`[WallAgent] Raising minLineWeight: ${this.config.minLineWeight} → ${adjustments.minLineWeight} (${removed} false positive corrections)`);
    }

    // If walls are being added that are short → lower minimum length
    // If walls are being removed that are short → raise minimum length
    const shortWallCorrections = recent.filter(c =>
      c.metadata?.shortWalls
    ).length;
    if (shortWallCorrections > recent.length * 0.3) {
      adjustments.minWallLengthPx = Math.max(10, this.config.minWallLengthPx * 0.8);
    }

    return adjustments;
  }

  // ── Summarize for history ──
  _summarizeResult(result) {
    if (result?.wallCount !== undefined) {
      return { count: result.wallCount, totalLF: Math.round(result.totalLF || 0) };
    }
    return { count: Array.isArray(result) ? result.length : 0 };
  }
}


// ═══════════════════════════════════════════════════════════════════════
// CostPredictionAgent — Self-improving cost estimation
// ═══════════════════════════════════════════════════════════════════════
export class CostPredictionAgent extends NOVAAgent {
  constructor() {
    super("cost-predictor", {
      // Per-division calibration multipliers (start at 1.0, adjust from outcomes)
      divisionMultipliers: {},
      // Building type adjustments (learned from historical proposals)
      buildingTypeAdjustments: {},
      // Market region adjustments
      regionAdjustments: {},
      // Confidence thresholds
      minDataPoints: 3,        // minimum proposals needed for "HIGH" confidence
      learningRate: 0.15,      // how much each outcome adjusts the multiplier
    });
  }

  // ── Record an outcome (estimate vs actual cost) ──
  recordOutcome(estimateId, estimated, actual, divisions, metadata = {}) {
    const ratio = actual / estimated; // >1 = underestimated, <1 = overestimated
    const accuracy = 1 - Math.abs(1 - ratio);

    this.recordCorrection(
      { estimateId, estimated, divisions },
      { actual, ratio, accuracy },
      { ...metadata, buildingType: metadata.buildingType, region: metadata.region }
    );

    return { ratio, accuracy, overUnder: ratio > 1 ? "under" : "over" };
  }

  // ── Compute adjusted $/SF for a division ──
  getAdjustedRate(divisionCode, baseRate, buildingType, region) {
    const divMult = this.config.divisionMultipliers[divisionCode] || 1.0;
    const typeMult = this.config.buildingTypeAdjustments[buildingType]?.[divisionCode] || 1.0;
    const regionMult = this.config.regionAdjustments[region]?.[divisionCode] || 1.0;

    return baseRate * divMult * typeMult * regionMult;
  }

  // ── Compute adjustments from outcome history ──
  _computeAdjustments(corrections) {
    const outcomes = corrections.filter(c => c.corrected?.ratio);
    if (outcomes.length < this.config.minDataPoints) return {};

    const adjustments = { divisionMultipliers: { ...this.config.divisionMultipliers } };
    const lr = this.config.learningRate;

    // Group by division and compute average ratio
    const divisionRatios = {};
    for (const outcome of outcomes) {
      const ratio = outcome.corrected.ratio;
      const divs = outcome.original?.divisions || {};
      for (const [code, val] of Object.entries(divs)) {
        if (!divisionRatios[code]) divisionRatios[code] = [];
        divisionRatios[code].push(ratio);
      }
    }

    // Adjust multiplier toward actual/estimated ratio
    for (const [code, ratios] of Object.entries(divisionRatios)) {
      if (ratios.length < 2) continue;
      const avgRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
      const currentMult = this.config.divisionMultipliers[code] || 1.0;
      // Nudge toward the average ratio
      const newMult = currentMult + (avgRatio - currentMult) * lr;
      adjustments.divisionMultipliers[code] = Math.round(newMult * 1000) / 1000;
    }

    return adjustments;
  }

  _findPatterns(corrections) {
    const patterns = [];
    const outcomes = corrections.filter(c => c.corrected?.ratio);

    // Pattern: consistently underestimating
    const underEstimates = outcomes.filter(c => c.corrected.ratio > 1.05);
    if (underEstimates.length > outcomes.length * 0.6) {
      patterns.push({
        type: "systematic-underestimate",
        description: `${underEstimates.length}/${outcomes.length} estimates were below actual cost`,
        confidence: underEstimates.length / outcomes.length,
        suggestion: "Raise baseline benchmarks",
      });
    }

    // Pattern: consistently overestimating
    const overEstimates = outcomes.filter(c => c.corrected.ratio < 0.95);
    if (overEstimates.length > outcomes.length * 0.6) {
      patterns.push({
        type: "systematic-overestimate",
        description: `${overEstimates.length}/${outcomes.length} estimates were above actual cost`,
        confidence: overEstimates.length / outcomes.length,
        suggestion: "Lower baseline benchmarks",
      });
    }

    return patterns;
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Agent Registry — singleton instances
// ═══════════════════════════════════════════════════════════════════════
let _wallAgent = null;
let _costAgent = null;

export function getWallDetectionAgent() {
  if (!_wallAgent) _wallAgent = new WallDetectionAgent();
  return _wallAgent;
}

export function getCostPredictionAgent() {
  if (!_costAgent) _costAgent = new CostPredictionAgent();
  return _costAgent;
}

// ── Get all agent statuses ──
export function getAllAgentStatuses() {
  return {
    wallDetector: getWallDetectionAgent().getStatus(),
    costPredictor: getCostPredictionAgent().getStatus(),
  };
}
