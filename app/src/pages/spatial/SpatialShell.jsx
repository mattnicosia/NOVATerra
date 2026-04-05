// SpatialShell.jsx — The spatial-first NOVATerra interface
// Inspired by Epichust Smart Workshop + AIOT Smart Park
// The 3D building model IS the dashboard. Data panels float on top.
//
// Architecture:
//   Layer 1: Dark matte background (the void)
//   Layer 2: 3D scene (the building model) — 60-70% of viewport
//   Layer 3: Floating panels (floor selector, data panels, metrics)
//   Bottom bar: Persistent navigation + live metrics

import { useState, useCallback, useMemo, useEffect, Suspense, lazy } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { loadEstimate } from "@/hooks/usePersistence";

// ── Color tokens (Epichust-inspired dark steel palette) ──
const C = {
  void: "#181B20",
  scene: "#1E2228",
  panel: "rgba(37,42,50,0.88)",
  panelSolid: "#252A32",
  panelHover: "#2C323B",
  input: "#1A1E24",
  borderSubtle: "rgba(255,255,255,0.06)",
  borderVisible: "rgba(255,255,255,0.12)",
  borderActive: "rgba(0,212,170,0.4)",
  textPrimary: "rgba(255,255,255,0.92)",
  textSecondary: "rgba(255,255,255,0.55)",
  textDim: "rgba(255,255,255,0.28)",
  accent: "#00D4AA",
  accentGlow: "rgba(0,212,170,0.15)",
  accentBright: "#3BDFCF",
  statusSafe: "#00D4AA",
  statusWarn: "#FFB020",
  statusAlert: "#FF4757",
  statusInfo: "#4DA6FF",
  safetyOrange: "#FF8C00",
  steelBlue: "#5B7A99",
};

// ── Typography ──
const FONT = {
  condensed: "'Barlow Condensed', 'Barlow', sans-serif",
  body: "'Barlow', -apple-system, sans-serif",
  mono: "'IBM Plex Mono', 'SF Mono', monospace",
};

// ── Spatial modes ──
const MODES = [
  { key: "overview", label: "Overview", icon: "🏗" },
  { key: "planroom", label: "Plan Room", icon: "📐" },
  { key: "estimate", label: "Estimate", icon: "📊" },
  { key: "takeoff", label: "Takeoffs", icon: "🔍" },
  { key: "settings", label: "Settings", icon: "⚙" },
];

// Lazy load the 3D scene
const SpatialScene = lazy(() => import("@/components/spatial/SpatialScene"));

/* ═══════════════════════════════════════════════════════════════════
   FLOOR SELECTOR — vertical strip on the left
   ═══════════════════════════════════════════════════════════════════ */
function FloorSelector({ floors, activeFloor, onSelect }) {
  if (!floors?.length) return null;
  return (
    <div style={{
      position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
      zIndex: 20, display: "flex", flexDirection: "column", gap: 2,
    }}>
      {floors.map(f => {
        const isActive = f.id === activeFloor;
        return (
          <button
            key={f.id}
            onClick={() => onSelect(f.id)}
            style={{
              width: 40, height: 32,
              background: isActive ? C.accentGlow : "transparent",
              border: `1px solid ${isActive ? C.accent : C.borderSubtle}`,
              borderRadius: 4,
              color: isActive ? C.accent : C.textSecondary,
              fontFamily: FONT.mono, fontSize: 11, fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s cubic-bezier(0.25,1,0.5,1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   RIGHT PANEL — contextual data (estimate summary, room detail, etc)
   ═══════════════════════════════════════════════════════════════════ */
function RightPanel({ selectedRoom, estimate, mode }) {
  return (
    <div style={{
      position: "absolute", right: 16, top: 16, bottom: 72,
      width: 340, zIndex: 20,
      display: "flex", flexDirection: "column", gap: 12,
      animation: "spatialPanelIn 0.4s cubic-bezier(0.16,1,0.3,1) both",
    }}>
      {/* Summary card */}
      <div style={{
        background: C.panel, backdropFilter: "blur(12px)",
        border: `1px solid ${C.borderSubtle}`,
        borderTop: `2px solid ${C.accent}`,
        borderRadius: 4, padding: 20,
      }}>
        <div style={{
          fontFamily: FONT.condensed, fontSize: 11, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.08em",
          color: C.textSecondary, marginBottom: 12,
        }}>
          {selectedRoom ? "Room Detail" : "Project Summary"}
        </div>

        {selectedRoom ? (
          <div>
            <div style={{ fontFamily: FONT.body, fontSize: 18, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>
              {selectedRoom.name || "Unnamed Room"}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 24, fontWeight: 700, color: C.accent, marginBottom: 8 }}>
              {selectedRoom.area ? `${selectedRoom.area.toLocaleString()} SF` : "—"}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 14, color: C.textSecondary }}>
              {selectedRoom.wallLF ? `${selectedRoom.wallLF.toLocaleString()} LF walls` : ""}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontFamily: FONT.body, fontSize: 18, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>
              {estimate?.name || "No Project Selected"}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 28, fontWeight: 700, color: C.accent }}>
              {estimate?.totalCost ? `$${(estimate.totalCost / 1000).toFixed(0)}K` : "$0"}
            </div>
          </div>
        )}
      </div>

      {/* Takeoff items / Line items */}
      <div style={{
        flex: 1, overflow: "auto",
        background: C.panel, backdropFilter: "blur(12px)",
        border: `1px solid ${C.borderSubtle}`,
        borderRadius: 4, padding: 16,
      }}>
        <div style={{
          fontFamily: FONT.condensed, fontSize: 11, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.08em",
          color: C.textSecondary, marginBottom: 12,
        }}>
          {mode === "estimate" ? "Line Items" : mode === "takeoff" ? "Measurements" : "Activity"}
        </div>
        <div style={{ fontFamily: FONT.body, fontSize: 13, color: C.textDim, textAlign: "center", padding: "40px 0" }}>
          {selectedRoom ? "Select a trade to view details" : "Click a room in the model"}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   BOTTOM BAR — persistent navigation + live metrics
   ═══════════════════════════════════════════════════════════════════ */
function BottomBar({ mode, onModeChange, metrics }) {
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, height: 64,
      zIndex: 30,
      background: C.panelSolid,
      borderTop: `1px solid ${C.borderSubtle}`,
      display: "flex", alignItems: "center",
      padding: "0 24px",
      gap: 0,
    }}>
      {/* Nav modes — left side */}
      <div style={{ display: "flex", gap: 4 }}>
        {MODES.map(m => {
          const isActive = m.key === mode;
          return (
            <button
              key={m.key}
              onClick={() => onModeChange(m.key)}
              style={{
                background: isActive ? C.accentGlow : "transparent",
                border: `1px solid ${isActive ? C.borderActive : "transparent"}`,
                borderRadius: 4,
                padding: "8px 14px",
                color: isActive ? C.accent : C.textSecondary,
                fontFamily: FONT.condensed, fontSize: 11, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.08em",
                cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.25,1,0.5,1)",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>{m.icon}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Metrics — right side */}
      <div style={{ display: "flex", gap: 32 }}>
        {[
          { label: "Total Est.", value: metrics?.totalCost ? `$${(metrics.totalCost / 1000).toFixed(0)}K` : "$0" },
          { label: "Cost/SF", value: metrics?.costPerSF ? `$${metrics.costPerSF.toFixed(2)}` : "—" },
          { label: "Estimated", value: metrics?.pctEstimated ? `${metrics.pctEstimated}%` : "0%" },
          { label: "Trades", value: metrics?.tradeCount?.toString() || "0" },
        ].map(m => (
          <div key={m.label} style={{ textAlign: "right" }}>
            <div style={{
              fontFamily: FONT.mono, fontSize: 18, fontWeight: 700,
              color: C.textPrimary, lineHeight: 1,
            }}>
              {m.value}
            </div>
            <div style={{
              fontFamily: FONT.condensed, fontSize: 9, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.1em",
              color: C.textDim, marginTop: 2,
            }}>
              {m.label}
            </div>
          </div>
        ))}
      </div>

      {/* Back to classic link */}
      <div style={{ marginLeft: 24, borderLeft: `1px solid ${C.borderSubtle}`, paddingLeft: 16 }}>
        <a
          href="/"
          style={{
            fontFamily: FONT.condensed, fontSize: 10, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.08em",
            color: C.textDim, textDecoration: "none",
          }}
        >
          Classic View →
        </a>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SPATIAL SHELL — the main layout
   ═══════════════════════════════════════════════════════════════════ */
export default function SpatialShell() {
  const [mode, setMode] = useState("overview");
  const [activeFloor, setActiveFloor] = useState("01");
  const [selectedRoom, setSelectedRoom] = useState(null);

  // Pull data from existing stores
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const activeEstimate = estimatesIndex?.find(e => e.id === activeEstimateId);
  const [loading, setLoading] = useState(false);

  // Load a project by ID
  const handleLoadProject = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    console.log(`[Spatial] Loading project ${id}...`);
    try {
      await loadEstimate(id);
      console.log(`[Spatial] Project loaded`);
    } catch (err) {
      console.error(`[Spatial] Failed to load project:`, err);
    }
    setLoading(false);
  }, []);

  // Auto-load the first estimate if none is active
  useEffect(() => {
    if (!activeEstimateId && estimatesIndex?.length > 0 && !loading) {
      const first = estimatesIndex[0];
      console.log(`[Spatial] No active estimate — auto-loading "${first.name}" (${first.id})`);
      handleLoadProject(first.id);
    }
  }, [activeEstimateId, estimatesIndex, loading, handleLoadProject]);

  // Mock floors for now — will come from floorAssignment.js
  const floors = useMemo(() => [
    { id: "rf", label: "RF" },
    { id: "02", label: "02" },
    { id: "01", label: "01" },
    { id: "b1", label: "B1" },
  ], []);

  // Mock metrics — will come from estimate data
  const metrics = useMemo(() => ({
    totalCost: activeEstimate?.value || 0,
    costPerSF: 0,
    pctEstimated: 0,
    tradeCount: 0,
  }), [activeEstimate]);

  const handleRoomSelect = useCallback((room) => {
    setSelectedRoom(room);
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: C.void,
      overflow: "hidden",
      fontFamily: FONT.body,
    }}>
      {/* Google Fonts */}
      <link
        href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800&family=Barlow:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* CSS animations */}
      <style>{`
        @keyframes spatialPanelIn {
          from { opacity: 0; transform: translateX(20px); filter: blur(3px); }
          to { opacity: 1; transform: translateX(0); filter: blur(0); }
        }
        @keyframes spatialFadeIn {
          from { opacity: 0; filter: blur(4px); }
          to { opacity: 1; filter: blur(0); }
        }
      `}</style>

      {/* Top-left branding + project selector */}
      <div style={{
        position: "absolute", top: 16, left: 16, zIndex: 25,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          fontFamily: FONT.condensed, fontSize: 15, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.12em",
          color: C.textPrimary,
        }}>
          NOVA<span style={{ color: C.accent }}>TERRA</span>
        </div>
        <div style={{
          fontFamily: FONT.condensed, fontSize: 9, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.1em",
          color: C.textDim,
          borderLeft: `1px solid ${C.borderSubtle}`,
          paddingLeft: 10,
        }}>
          Spatial
        </div>
        {/* Project selector */}
        {estimatesIndex?.length > 0 && (
          <select
            value={activeEstimateId || ""}
            onChange={e => { if (e.target.value) handleLoadProject(e.target.value); }}
            style={{
              marginLeft: 12,
              background: C.panelSolid,
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 4,
              color: C.textPrimary,
              fontFamily: FONT.condensed, fontSize: 12, fontWeight: 500,
              padding: "6px 10px",
              cursor: "pointer",
              maxWidth: 220,
            }}
          >
            <option value="" disabled>Select Project</option>
            {estimatesIndex.filter(e => e.status !== "Trash").map(e => (
              <option key={e.id} value={e.id}>{e.name || "Untitled"}</option>
            ))}
          </select>
        )}
      </div>

      {/* Top nav — mode tabs (Epichust style) */}
      <div style={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
        zIndex: 25, display: "flex", gap: 0,
      }}>
        {MODES.slice(0, 4).map(m => {
          const isActive = m.key === mode;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${isActive ? C.accent : "transparent"}`,
                padding: "8px 20px 12px",
                color: isActive ? C.textPrimary : C.textSecondary,
                fontFamily: FONT.condensed, fontSize: 13, fontWeight: isActive ? 700 : 500,
                textTransform: "uppercase", letterSpacing: "0.06em",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* 3D Scene — Layer 2 */}
      <div style={{
        position: "absolute", inset: 0, bottom: 64,
        animation: "spatialFadeIn 0.6s cubic-bezier(0.16,1,0.3,1) both",
      }}>
        <Suspense fallback={
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.textDim, fontFamily: FONT.condensed, fontSize: 13,
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            Loading spatial engine...
          </div>
        }>
          <SpatialScene
            activeFloor={activeFloor}
            selectedRoom={selectedRoom}
            onRoomSelect={handleRoomSelect}
            mode={mode}
          />
        </Suspense>
      </div>

      {/* Floor Selector — Layer 3 */}
      <FloorSelector
        floors={floors}
        activeFloor={activeFloor}
        onSelect={setActiveFloor}
      />

      {/* Right Panel — Layer 3 */}
      <RightPanel
        selectedRoom={selectedRoom}
        estimate={activeEstimate}
        mode={mode}
      />

      {/* Bottom Bar — Layer 3 */}
      <BottomBar
        mode={mode}
        onModeChange={setMode}
        metrics={metrics}
      />
    </div>
  );
}
