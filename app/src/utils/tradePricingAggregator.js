// Trade Pricing Aggregator — builds statistical index from parsed proposals
// Aggregates unit rates and $/SF by CSI division, normalized via normalizationEngine

import { supabase } from "@/utils/supabase";

const CSI_LABELS = {
  "01": "General Requirements", "02": "Existing Conditions", "03": "Concrete",
  "04": "Masonry", "05": "Metals", "06": "Wood/Plastics/Composites",
  "07": "Thermal & Moisture", "08": "Openings", "09": "Finishes",
  "10": "Specialties", "11": "Equipment", "12": "Furnishings",
  "21": "Fire Suppression", "22": "Plumbing", "23": "HVAC",
  "26": "Electrical", "27": "Communications", "28": "Electronic Safety",
  "31": "Earthwork", "32": "Exterior Improvements", "33": "Utilities",
};

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function stdDev(arr, mean) {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Aggregate parsed proposals from ingestion_runs into trade_pricing_index.
 * Reads all parsed ingestion_runs, extracts $/SF per division and unit rates,
 * computes statistics, and upserts into trade_pricing_index table.
 */
export async function aggregateTradePricing() {
  // Pull all parsed runs
  const { data: runs, error } = await supabase
    .from("ingestion_runs")
    .select("id, parsed_data, classification, folder_type, company_name, total_bid")
    .eq("parse_status", "parsed");

  if (error) {
    console.error("[tradePricing] Failed to load runs:", error.message);
    return { error: error.message };
  }

  if (!runs?.length) {
    console.log("[tradePricing] No parsed runs to aggregate");
    return { count: 0 };
  }

  // Collect data points by key: `${csiDiv}|${metricType}|${unit}`
  const buckets = {};

  for (const run of runs) {
    const pd = run.parsed_data;
    if (!pd?.lineItems?.length) continue;

    const runId = run.id;
    const totalBid = pd.totalBid || run.total_bid;

    for (const item of pd.lineItems) {
      const csi = item.csiCode;
      if (!csi) continue;

      const amount = item.amount || 0;
      const unitPrice = item.unitPrice || 0;
      const unit = item.unit || null;
      const quantity = item.quantity || 0;

      // $/SF per division (lump sum / project SF — requires project SF from classification)
      // For now, just collect unit rates where available

      if (unitPrice > 0 && unit) {
        const key = `${csi}|unit_rate|${unit.toUpperCase()}`;
        if (!buckets[key]) buckets[key] = { csi, metricType: "unit_rate", unit: unit.toUpperCase(), values: [], runIds: [] };
        buckets[key].values.push(unitPrice);
        buckets[key].runIds.push(runId);
      }

      // Lump sum amounts per division
      if (amount > 0) {
        const key = `${csi}|lump_sum_per_sf|null`;
        if (!buckets[key]) buckets[key] = { csi, metricType: "lump_sum_per_sf", unit: null, values: [], runIds: [] };
        buckets[key].values.push(amount);
        buckets[key].runIds.push(runId);
      }
    }
  }

  // Compute stats and upsert
  const rows = [];
  for (const [, bucket] of Object.entries(buckets)) {
    if (bucket.values.length < 2) continue; // Need at least 2 data points

    const vals = bucket.values;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const med = median(vals);
    const p25 = percentile(vals, 25);
    const p75 = percentile(vals, 75);
    const sd = stdDev(vals, mean);

    rows.push({
      csi_division: bucket.csi,
      trade_name: CSI_LABELS[bucket.csi] || `Division ${bucket.csi}`,
      metric_type: bucket.metricType,
      unit: bucket.unit,
      labor_type: null, // TODO: segment by labor type when classification includes it
      sample_count: vals.length,
      mean: Math.round(mean * 100) / 100,
      median: Math.round(med * 100) / 100,
      p25: Math.round(p25 * 100) / 100,
      p75: Math.round(p75 * 100) / 100,
      std_dev: Math.round(sd * 100) / 100,
      min_val: Math.round(Math.min(...vals) * 100) / 100,
      max_val: Math.round(Math.max(...vals) * 100) / 100,
      source_proposal_ids: [...new Set(bucket.runIds)].slice(0, 100),
      last_updated: new Date().toISOString(),
    });
  }

  if (!rows.length) {
    console.log("[tradePricing] No sufficient data to aggregate");
    return { count: 0 };
  }

  // Clear existing index and insert fresh
  await supabase.from("trade_pricing_index").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // Insert in batches of 50
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error: insertErr } = await supabase.from("trade_pricing_index").insert(batch);
    if (insertErr) {
      console.error(`[tradePricing] Insert batch ${i} failed:`, insertErr.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`[tradePricing] Aggregated ${inserted} index entries from ${runs.length} parsed proposals`);
  return { count: inserted, fromRuns: runs.length };
}

/**
 * Load the trade pricing index from Supabase for ROM engine use.
 * Returns a map: { "09": { median, mean, p25, p75, sampleCount }, ... }
 */
export async function loadTradePricingIndex() {
  const { data, error } = await supabase
    .from("trade_pricing_index")
    .select("*")
    .order("csi_division");

  if (error || !data?.length) return {};

  const index = {};
  for (const row of data) {
    if (!index[row.csi_division]) index[row.csi_division] = {};
    const key = row.metric_type + (row.unit ? `_${row.unit}` : "");
    index[row.csi_division][key] = {
      tradeName: row.trade_name,
      metricType: row.metric_type,
      unit: row.unit,
      sampleCount: row.sample_count,
      mean: parseFloat(row.mean),
      median: parseFloat(row.median),
      p25: parseFloat(row.p25),
      p75: parseFloat(row.p75),
      stdDev: parseFloat(row.std_dev),
      minVal: parseFloat(row.min_val),
      maxVal: parseFloat(row.max_val),
    };
  }

  return index;
}
