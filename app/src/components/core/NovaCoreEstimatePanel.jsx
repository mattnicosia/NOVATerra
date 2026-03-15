// NovaCoreEstimatePanel — Wires NOVATerra estimate line items to NOVA Core ROM
// Fetches ROM data for each CSI-coded item, displays confidence bands + badges.
// Falls back to romEngine.js seed data when ROM returns no_data.
// Does NOT modify any existing files — standalone panel.

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useNovaCoreRom } from "@/lib/nova-core/useNovaCoreRom";
import { generateBaselineROM } from "@/utils/romEngine";
import NovaCoreRomInsight, { DisplayFlagBadge } from "@/components/core/NovaCoreRomInsight";
import { fmt, fmt2, nn } from "@/utils/format";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

// ── Seed fallback helper ──
// When NOVA Core returns no_data, look up romEngine.js seed data
// and wrap it into a compatible result shape with 'Seed data' badge
function buildSeedFallback(item, projectSF, buildingType) {
  if (!projectSF || projectSF <= 0) return null;

  try {
    const rom = generateBaselineROM(projectSF, buildingType);
    if (!rom || !rom.divisions) return null;

    // romEngine uses 2-digit division codes
    const divCode = (item.code || "").substring(0, 2);
    const divData = rom.divisions[divCode];
    if (!divData) return null;

    // Seed data gives $/SF ranges — convert to unit cost using item quantity
    const qty = nn(item.quantity);
    const seedP50 = divData.perSF?.mid ?? null;
    const seedP10 = divData.perSF?.low ?? null;
    const seedP90 = divData.perSF?.high ?? null;

    return {
      csi_code_id: item.code || "",
      raw_band: { p10: seedP10, p50: seedP50, p90: seedP90 },
      adjusted_band: { p10: seedP10, p50: seedP50, p90: seedP90 },
      multipliers: { location: 1, building_type: 1, project_type: 1, delivery_method: 1, combined: 1 },
      is_national: false,
      display_flag: "seed_fallback",
      disclosure: "No NOVA Core data. Showing romEngine seed $/SF benchmark for this division.",
      unit_cost: seedP50,
      csi_section: divCode,
      csi_title: divData.label || null,
      trade_name: null,
      unit_code: "SF",
      local_sample_count: 0,
      national_sample_count: 0,
      extended_costs: qty > 0 ? {
        p10_extended: seedP10 !== null ? Math.round(seedP10 * qty * 100) / 100 : null,
        p50_extended: seedP50 !== null ? Math.round(seedP50 * qty * 100) / 100 : null,
        p90_extended: seedP90 !== null ? Math.round(seedP90 * qty * 100) / 100 : null,
      } : null,
      fetched_at: new Date().toISOString(),
      is_seed_fallback: true,
    };
  } catch {
    return null;
  }
}

// ── Line item row with ROM insight ──
function RomLineItem({ item, romResult, isLoading, error, onFetch, C, T }) {
  const qty = nn(item.quantity);
  const currentTotal = nn(item.material) + nn(item.labor) + nn(item.equipment) + nn(item.subcontractor);
  const hasCode = !!item.code;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 12px",
        borderRadius: T.radius.sm,
        border: `1px solid ${C.border}`,
        background: C.bg1,
        transition: "border-color 0.15s",
      }}
    >
      {/* Item header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          {/* CSI code */}
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: hasCode ? C.accent : C.textDim,
              fontFamily: T.font.sans,
              fontFeatureSettings: "'tnum'",
              flexShrink: 0,
            }}
          >
            {item.code || "—"}
          </span>
          {/* Description */}
          <span
            style={{
              fontSize: 11,
              color: C.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
          >
            {item.description || "Untitled"}
          </span>
        </div>

        {/* Current unit cost */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: currentTotal > 0 ? C.text : C.textDim,
                fontFamily: T.font.sans,
                fontFeatureSettings: "'tnum'",
              }}
            >
              {currentTotal > 0 ? fmt2(currentTotal) : "—"}
            </div>
            <div style={{ fontSize: 7, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
              current
            </div>
          </div>

          {/* Fetch button */}
          {hasCode && !romResult && !isLoading && (
            <button
              onClick={() => onFetch(item)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                fontSize: 9,
                fontWeight: 600,
                color: C.accent,
                background: `${C.accent}08`,
                border: `1px solid ${C.accent}20`,
                borderRadius: T.radius.sm,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `${C.accent}15`;
                e.currentTarget.style.borderColor = `${C.accent}40`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = `${C.accent}08`;
                e.currentTarget.style.borderColor = `${C.accent}20`;
              }}
            >
              <Ic d={I.ai} size={10} color={C.accent} />
              ROM Lookup
            </button>
          )}

          {/* Loading state */}
          {isLoading && (
            <span
              style={{
                fontSize: 9,
                color: C.textDim,
                fontStyle: "italic",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              Loading...
            </span>
          )}
        </div>
      </div>

      {/* Qty + unit */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 9, color: C.textDim }}>
        <span>
          Qty: <strong style={{ color: C.textMuted }}>{qty || "—"}</strong>
        </span>
        <span>
          Unit: <strong style={{ color: C.textMuted }}>{item.unit || "—"}</strong>
        </span>
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 9, color: C.red, padding: "4px 8px", background: `${C.red}08`, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* ROM result */}
      {romResult && (
        <NovaCoreRomInsight result={romResult} showExtended={qty > 0} />
      )}

      {/* No code warning */}
      {!hasCode && (
        <div style={{ fontSize: 9, color: C.textDim, fontStyle: "italic" }}>
          Assign a CSI code to enable NOVA Core ROM lookup
        </div>
      )}
    </div>
  );
}

// ── Main Panel ──
export default function NovaCoreEstimatePanel() {
  const C = useTheme();
  const T = C.T;

  const items = useItemsStore(s => s.items);
  const projectInfo = useProjectStore(s => s.info);

  const { fetchRom, results, isLoading: checkLoading, getError, clearCache } = useNovaCoreRom();

  const [romResults, setRomResults] = useState({});
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [fetchAll, setFetchAll] = useState(false);

  // M5: Cancellation ref for handleFetchAll
  const isCancelledRef = useRef(false);
  useEffect(() => {
    return () => { isCancelledRef.current = true; };
  }, []);

  // Project context for ROM requests
  const metroArea = projectInfo?.locationMetroId || projectInfo?.metro || "";
  const projectType = projectInfo?.projectType || "new-construction";
  const buildingType = projectInfo?.buildingType || "commercial-office";
  const projectSF = nn(projectInfo?.grossSF || projectInfo?.squareFootage || 0);

  // Items with CSI codes
  const codedItems = useMemo(
    () => items.filter(i => i.code && i.code.includes(".")),
    [items],
  );

  // Fetch ROM for a single item
  const handleFetchSingle = useCallback(async (item) => {
    if (!item.code || !metroArea) return;

    setLoadingIds(prev => new Set([...prev, item.id]));

    const params = {
      csi_code_id: item.code,
      metro_area: metroArea,
      project_type_code: projectType,
      building_type_id: buildingType,
      quantity: nn(item.quantity),
      gross_sf: projectSF,
    };

    const result = await fetchRom(params);

    if (result) {
      if (result.display_flag === "no_data") {
        // Fall back to seed data
        const seedResult = buildSeedFallback(item, projectSF, buildingType);
        if (seedResult) {
          setRomResults(prev => ({ ...prev, [item.id]: seedResult }));
        } else {
          setRomResults(prev => ({ ...prev, [item.id]: result }));
        }
      } else {
        setRomResults(prev => ({ ...prev, [item.id]: result }));
      }
    }

    setLoadingIds(prev => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  }, [metroArea, projectType, buildingType, projectSF, fetchRom]);

  // Fetch all coded items (M5: check isCancelledRef before each setState)
  const handleFetchAll = useCallback(async () => {
    isCancelledRef.current = false;
    setFetchAll(true);
    for (const item of codedItems) {
      if (isCancelledRef.current) break;
      if (!romResults[item.id]) {
        await handleFetchSingle(item);
      }
    }
    if (!isCancelledRef.current) {
      setFetchAll(false);
    }
  }, [codedItems, romResults, handleFetchSingle]);

  // Stats
  const fetchedCount = Object.keys(romResults).length;
  const totalCoded = codedItems.length;
  const seedCount = Object.values(romResults).filter(r => r.is_seed_fallback).length;
  const coreCount = fetchedCount - seedCount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: C.text,
              fontFamily: T.font.sans,
            }}
          >
            NOVA Core ROM
          </span>
          <span style={{ fontSize: 10, color: C.textDim }}>
            {totalCoded} items with CSI codes
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Stats badges */}
          {fetchedCount > 0 && (
            <div style={{ display: "flex", gap: 4, fontSize: 9 }}>
              {coreCount > 0 && (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${C.accent}12`,
                    color: C.accent,
                    fontWeight: 600,
                  }}
                >
                  {coreCount} Core
                </span>
              )}
              {seedCount > 0 && (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${C.purple}12`,
                    color: C.purple,
                    fontWeight: 600,
                  }}
                >
                  {seedCount} Seed
                </span>
              )}
            </div>
          )}

          {/* Fetch All button */}
          {totalCoded > 0 && (
            <button
              onClick={handleFetchAll}
              disabled={fetchAll || !metroArea}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 14px",
                fontSize: 10,
                fontWeight: 600,
                color: fetchAll ? C.textDim : "#fff",
                background: fetchAll ? C.bg2 : C.accent,
                border: fetchAll ? `1px solid ${C.border}` : `1px solid ${C.accent}`,
                borderRadius: T.radius.md,
                cursor: fetchAll ? "wait" : metroArea ? "pointer" : "not-allowed",
                transition: "all 0.15s",
                opacity: !metroArea ? 0.5 : 1,
              }}
            >
              <Ic d={I.ai} size={11} color={fetchAll ? C.textDim : "#fff"} />
              {fetchAll ? "Fetching..." : fetchedCount > 0 ? "Refresh All" : "Fetch All ROM"}
            </button>
          )}

          {/* Clear cache */}
          {fetchedCount > 0 && (
            <button
              onClick={() => {
                clearCache();
                setRomResults({});
              }}
              style={{
                padding: "6px 10px",
                fontSize: 9,
                color: C.textDim,
                background: "transparent",
                border: `1px solid ${C.border}`,
                borderRadius: T.radius.sm,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Missing metro warning */}
      {!metroArea && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: T.radius.md,
            background: `${C.orange}08`,
            border: `1px solid ${C.orange}18`,
            fontSize: 11,
            color: C.orange,
          }}
        >
          <Ic d={I.alertTriangle} size={14} color={C.orange} />
          Set a metro area in Project Info to enable NOVA Core ROM lookups.
        </div>
      )}

      {/* Item list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {codedItems.length > 0 ? (
          codedItems.map(item => (
            <RomLineItem
              key={item.id}
              item={item}
              romResult={romResults[item.id]}
              isLoading={loadingIds.has(item.id)}
              error={null}
              onFetch={handleFetchSingle}
              C={C}
              T={T}
            />
          ))
        ) : (
          <div
            style={{
              padding: "32px 20px",
              textAlign: "center",
              borderRadius: T.radius.lg,
              background: C.bg2,
              border: `1px dashed ${C.border}`,
            }}
          >
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>
              No estimate items with CSI codes found.
            </div>
            <div style={{ fontSize: 10, color: C.textDim }}>
              Add CSI codes to your scope items to enable NOVA Core ROM lookups.
            </div>
          </div>
        )}
      </div>

      {/* Pulse animation for loading states */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
