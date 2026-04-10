// CoreExplorer.jsx — Visual data explorer for NOVA CORE
// Matt-only tool to understand the entire data architecture.
// 12 data nodes, 3 drill-down levels, searchable detail panel.

import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { TRADE_GROUPINGS } from "@/constants/tradeGroupings";
import { METRO_AREAS } from "@/constants/locationFactors";
import { MATERIAL_CATEGORIES, MATERIAL_CATALOG } from "@/constants/materialCatalog";
import { SUBDIVISION_BENCHMARKS } from "@/constants/subdivisionBenchmarks";
import { SEED_ELEMENTS } from "@/constants/seedAssemblies";

// ── Node definitions ──
const NODES = [
  { id: "costdb", label: "Cost Database", icon: "M12 2C6.48 2 2 4 2 6.5S6.48 11 12 11s10-2 10-4.5S17.52 2 12 2zM2 6.5v5c0 2.48 4.48 4.5 10 4.5s10-2 10-4.5v-5M2 11.5v5c0 2.48 4.48 4.5 10 4.5s10-2 10-4.5v-5", desc: "Master items + user overrides. M/L/E/S per unit." },
  { id: "trades", label: "Trade Bundles", icon: "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z", desc: "23 trade groupings mapped to CSI divisions." },
  { id: "rom", label: "ROM Benchmarks", icon: "M2 12l3-4 3 2 3-5 3 4M2 14h12M14 2v10", desc: "$/SF ranges per division × 9 building types." },
  { id: "proposals", label: "Proposals", icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8", desc: "Historical proposals with outcomes + calibration." },
  { id: "learning", label: "Learning Records", icon: "M22 12h-4l-3 9L9 3l-3 9H2", desc: "Predicted vs actual → calibration factors." },
  { id: "subs", label: "Subcontractors", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75", desc: "Companies, trades, certs, markets." },
  { id: "materials", label: "Material Catalog", icon: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z", desc: "100+ materials with visual + cost + schedule data." },
  { id: "location", label: "Location Factors", icon: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 7a3 3 0 100 6 3 3 0 000-6z", desc: "70+ metros with M/L/E multipliers." },
  { id: "contacts", label: "Contacts", icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z", desc: "Clients, architects, engineers, estimators." },
  { id: "subdivisions", label: "Subdivisions", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z", desc: "Sub-line % breakdowns per CSI division." },
  { id: "estimates", label: "Estimates", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", desc: "All estimates with project parameters." },
  { id: "assemblies", label: "Seed Assemblies", icon: "M4 4h16v16H4zM4 9h16M9 4v16", desc: "~801 pre-built cost items (national avg)." },
];

const EMPTY_NODE_DATA = { count: 0, summary: "", records: [] };

// ── Data resolver ──
function resolveNodeData(nodeId, { elements, masterData, proposals, learningRecords, estimatesIndex }) {
  switch (nodeId) {
      case "costdb": {
        const merged = elements || [];
        const master = merged.filter(e => e.source === "master");
        const user = merged.filter(e => e.source === "user");
        return {
          count: merged.length,
          summary: `${master.length} master + ${user.length} user items`,
          records: merged.map(e => ({
            id: e.id,
            primary: `${e.code} — ${e.name}`,
            secondary: `${e.unit} | M:$${e.material || 0} L:$${e.labor || 0} E:$${e.equipment || 0} S:$${e.subcontractor || 0}`,
            badge: e.trade,
            raw: e,
          })),
        };
      }
      case "trades":
        return {
          count: TRADE_GROUPINGS.length,
          summary: "23 trade bundles → CSI division mappings",
          records: TRADE_GROUPINGS.map(t => ({
            id: t.key,
            primary: t.label,
            secondary: `Divisions: ${t.divisions?.join(", ") || "code-based"}`,
            badge: `Sort ${t.sort}`,
            raw: t,
          })),
        };
      case "rom":
        return {
          count: "9 types × 31 divs",
          summary: "$/SF benchmarks: low / mid / high per division",
          records: [
            "commercial-office", "retail", "healthcare", "education", "industrial",
            "residential-multi", "hospitality", "residential-single", "mixed-use",
          ].map(t => ({
            id: t,
            primary: t.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
            secondary: "31 division benchmarks with $/SF ranges",
            badge: "ROM",
            raw: { type: t },
          })),
        };
      case "proposals":
        return {
          count: proposals.length,
          summary: `${proposals.length} imported proposals`,
          records: proposals.map(p => ({
            id: p.id,
            primary: p.projectName || p.name || "(unnamed)",
            secondary: `${p.projectSF ? p.projectSF.toLocaleString() + " SF" : ""} | $${(p.totalCost || p.proposalCost || 0).toLocaleString()} | ${p.outcome || "pending"}`,
            badge: p.outcome || "pending",
            raw: p,
          })),
        };
      case "learning":
        return {
          count: learningRecords.length,
          summary: `${learningRecords.length} calibration records`,
          records: learningRecords.map((r, i) => ({
            id: r.estimateId || i,
            primary: `Record ${i + 1} — ${r.buildingType || "unknown"}`,
            secondary: `${Object.keys(r.calibration || {}).length} division factors`,
            badge: r.buildingType || "—",
            raw: r,
          })),
        };
      case "subs": {
        const subs = masterData?.subcontractors || [];
        return {
          count: subs.length,
          summary: `${subs.length} subcontractors`,
          records: subs.map(s => ({
            id: s.id,
            primary: s.name,
            secondary: `${(s.trades || []).join(", ")} | ${s.email || ""}`,
            badge: s.preferred ? "★" : "",
            raw: s,
          })),
        };
      }
      case "materials":
        return {
          count: MATERIAL_CATALOG.length,
          summary: `${MATERIAL_CATALOG.length} materials in ${MATERIAL_CATEGORIES.length} categories`,
          records: MATERIAL_CATALOG.map(m => ({
            id: m.slug,
            primary: m.name,
            secondary: `${m.category} | $${m.cost?.totalPerUnit || 0}/${m.cost?.unit || "SF"} | ${m.manufacturer || ""}`,
            badge: m.category,
            raw: m,
          })),
        };
      case "location":
        return {
          count: METRO_AREAS.length,
          summary: `${METRO_AREAS.length} metro areas with pricing multipliers`,
          records: METRO_AREAS.map(m => ({
            id: m.id,
            primary: m.label,
            secondary: `Mat: ${m.mat}x | Lab: ${m.lab}x | Equip: ${m.equip}x`,
            badge: m.mat > 1.05 ? "High" : m.mat < 0.95 ? "Low" : "Avg",
            raw: m,
          })),
        };
      case "contacts": {
        const cats = ["clients", "architects", "engineers", "estimators"];
        const all = cats.flatMap(c => (masterData?.[c] || []).map(r => ({ ...r, _type: c })));
        return {
          count: all.length,
          summary: cats.map(c => `${(masterData?.[c] || []).length} ${c}`).join(" | "),
          records: all.map(r => ({
            id: r.id,
            primary: r.name || "(unnamed)",
            secondary: `${r._type} | ${r.email || ""} | ${r.phone || ""}`,
            badge: r._type,
            raw: r,
          })),
        };
      }
      case "subdivisions": {
        const divs = Object.entries(SUBDIVISION_BENCHMARKS || {});
        return {
          count: divs.length,
          summary: `${divs.length} divisions with sub-line breakdowns`,
          records: divs.map(([code, subs]) => ({
            id: code,
            primary: `Division ${code}`,
            secondary: `${Object.keys(subs || {}).length} sub-lines`,
            badge: code,
            raw: { code, subdivisions: subs },
          })),
        };
      }
      case "estimates":
        return {
          count: estimatesIndex.length,
          summary: `${estimatesIndex.length} estimates`,
          records: estimatesIndex.map(e => ({
            id: e.id,
            primary: e.projectName || e.name || "(unnamed)",
            secondary: `${e.status || "Draft"} | ${e.client || ""} | ${e.estimateNumber || ""}`,
            badge: e.status || "Draft",
            raw: e,
          })),
        };
      case "assemblies":
        return {
          count: SEED_ELEMENTS.length,
          summary: `${SEED_ELEMENTS.length} seed items (national average basis)`,
          records: SEED_ELEMENTS.slice(0, 200).map(e => ({
            id: e.id,
            primary: `${e.code} — ${e.name}`,
            secondary: `${e.unit} | M:$${e.material || 0} L:$${e.labor || 0} E:$${e.equipment || 0}`,
            badge: e.trade,
            raw: e,
          })),
        };
      default:
        return { count: 0, summary: "", records: [] };
    }
}

// ── Detail View for a single record ──
function RecordDetail({ record, C }) {
  if (!record?.raw) return null;
  const entries = Object.entries(record.raw).filter(([k]) => !k.startsWith("_"));
  return (
    <div style={{ padding: "12px 0" }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>{record.primary}</h4>
      <div style={{ display: "grid", gap: 6 }}>
        {entries.map(([key, val]) => (
          <div key={key} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.5 }}>
            <span style={{ color: C.textMuted, minWidth: 120, fontWeight: 500 }}>{key}</span>
            <span style={{ color: C.text, wordBreak: "break-all" }}>
              {val === null ? "—" : typeof val === "object" ? JSON.stringify(val, null, 1).slice(0, 300) : String(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CoreExplorer() {
  const C = useTheme();
  const T = C.T;
  const elements = useDatabaseStore(s => s.elements);
  const masterData = useMasterDataStore(s => s.masterData);
  const proposals = useMasterDataStore(s => s.masterData?.historicalProposals || []);
  const learningRecords = useDrawingPipelineStore(s => s.learningRecords || []);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex || []);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [search, setSearch] = useState("");

  const nodeDataById = useMemo(() => {
    const dataSources = { elements, masterData, proposals, learningRecords, estimatesIndex };
    return Object.fromEntries(NODES.map(node => [node.id, resolveNodeData(node.id, dataSources)]));
  }, [elements, masterData, proposals, learningRecords, estimatesIndex]);

  const nodeData = useMemo(
    () => (selectedNode ? (nodeDataById[selectedNode] || EMPTY_NODE_DATA) : EMPTY_NODE_DATA),
    [selectedNode, nodeDataById]
  );

  const filteredRecords = useMemo(() => {
    if (!nodeData?.records) return [];
    if (!search.trim()) return nodeData.records;
    const q = search.toLowerCase();
    return nodeData.records.filter(
      r => r.primary?.toLowerCase().includes(q) || r.secondary?.toLowerCase().includes(q)
    );
  }, [nodeData, search]);

  const nodeDef = NODES.find(n => n.id === selectedNode);

  return (
    <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0 }}>
      {/* ── Left: Node Map ── */}
      <div style={{
        flex: "0 0 55%", display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
        alignContent: "start", overflowY: "auto", padding: "4px 4px 4px 0",
      }}>
        {NODES.map(node => {
          const active = selectedNode === node.id;
          const data = nodeDataById[node.id] || { count: 0 };
          return (
            <button
              key={node.id}
              onClick={() => { setSelectedNode(node.id); setSelectedRecord(null); setSearch(""); }}
              style={{
                display: "flex", flexDirection: "column", gap: 8,
                padding: "16px 14px", borderRadius: T.radius.lg,
                border: `1px solid ${active ? C.accent + "60" : C.border}`,
                background: active ? C.accentBg : C.bg1,
                cursor: "pointer", textAlign: "left",
                boxShadow: active ? `0 0 12px ${C.accent}20` : "none",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                  stroke={active ? C.accent : C.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={node.icon} />
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600, color: active ? C.accent : C.text }}>
                  {node.label}
                </span>
                <span style={{
                  marginLeft: "auto", fontSize: 10, fontWeight: 700,
                  padding: "2px 6px", borderRadius: 8,
                  background: active ? C.accent + "22" : C.bg2,
                  color: active ? C.accent : C.textMuted,
                }}>
                  {data.count}
                </span>
              </div>
              <p style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4, margin: 0 }}>
                {node.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* ── Right: Detail Panel ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        background: C.bg1, borderRadius: T.radius.lg,
        border: `1px solid ${C.border}`, overflow: "hidden",
      }}>
        {!selectedNode ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 13 }}>
            Select a data source to explore
          </div>
        ) : selectedRecord ? (
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <button
              onClick={() => setSelectedRecord(null)}
              style={{
                background: "none", border: "none", color: C.accent,
                fontSize: 12, cursor: "pointer", marginBottom: 8,
                padding: 0, fontWeight: 500,
              }}
            >
              ← Back to {nodeDef?.label}
            </button>
            <RecordDetail record={selectedRecord} C={C} />
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                  stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={nodeDef?.icon} />
                </svg>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>{nodeDef?.label}</h3>
                <span style={{ fontSize: 11, color: C.textMuted }}>{nodeData.summary}</span>
              </div>
              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${nodeDef?.label}...`}
                style={{
                  width: "100%", padding: "6px 10px", fontSize: 12,
                  background: C.bg2, border: `1px solid ${C.border}`,
                  borderRadius: T.radius.sm, color: C.text, outline: "none",
                  marginTop: 6,
                }}
              />
            </div>
            {/* Records list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
              {filteredRecords.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: C.textMuted, fontSize: 12 }}>
                  {search ? "No matches" : "No records"}
                </div>
              ) : (
                filteredRecords.map(rec => (
                  <button
                    key={rec.id}
                    onClick={() => setSelectedRecord(rec)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "8px 16px", border: "none",
                      background: "transparent", cursor: "pointer", textAlign: "left",
                      borderBottom: `1px solid ${C.border}08`,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.bg2; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rec.primary}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rec.secondary}
                      </div>
                    </div>
                    {rec.badge && (
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: "2px 6px",
                        borderRadius: 6, background: C.accentBg, color: C.accent,
                        whiteSpace: "nowrap", flexShrink: 0,
                      }}>
                        {rec.badge}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
