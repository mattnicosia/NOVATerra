// Admin Unit Rate Review — queue-based approval of parsed unit rates
// ONLY items with actual unit rates (unit + unitPrice) appear here
// All items must be approved before entering the cost database

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { card } from "@/utils/styles";
import { supabase } from "@/utils/supabase";
import { useDatabaseStore } from "@/stores/databaseStore";
import { saveUserLibrary } from "@/hooks/usePersistence";
import { normalizePerSF } from "@/utils/normalizationEngine";

// ── Title Case: capitalize first letter of each word, except minor words ──
const MINOR_WORDS = new Set(["a","an","and","as","at","but","by","for","from","if","in","into","is","it","no","nor","not","of","on","or","so","the","to","up","vs","via","with","yet"]);
function titleCase(str) {
  if (!str) return "";
  return str.replace(/\w\S*/g, (word, i) => {
    if (i > 0 && MINOR_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function normalizeUnit(u) {
  if (!u) return null;
  const map = { sqft: "SF", lf: "LF", lnft: "LF", "ln ft": "LF", ea: "EA", each: "EA",
    sy: "SY", cy: "CY", yard: "CY", yards: "CY", yd: "CY", ls: "LS", hr: "HR",
    ton: "TON", lb: "LB", lbs: "LB", gal: "GAL", cf: "CF", occurrences: "EA",
    mbf: "MBF", msf: "MSF" };
  return map[u.toLowerCase()] || u.toUpperCase();
}

export default function AdminUnitRatesPage() {
  const C = useTheme();
  const T = C.T;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [csiFilter, setCsiFilter] = useState("all");
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  // Build a lookup from existing DB elements for duplicate detection
  const dbElements = useDatabaseStore(s => s.elements);
  const dbLookup = useMemo(() => {
    const map = {};
    for (const el of dbElements || []) {
      // Key by normalized name + unit for fuzzy matching
      const key = `${(el.name || "").toLowerCase().trim()}|${(el.unit || "").toUpperCase()}`;
      if (!map[key]) map[key] = [];
      map[key].push(el);
      // Also key by CSI code + unit for broader matching
      const csiKey = `${(el.code || "").substring(0, 2)}|${(el.unit || "").toUpperCase()}`;
      if (!map[csiKey]) map[csiKey] = [];
      map[csiKey].push(el);
    }
    return map;
  }, [dbElements]);

  // Find matching DB elements for a given item
  function findDbMatches(label, unit, csiCode, unitPrice) {
    const matches = [];
    // Exact name+unit match
    const exactKey = `${(label || "").toLowerCase().trim()}|${(unit || "").toUpperCase()}`;
    if (dbLookup[exactKey]) {
      for (const el of dbLookup[exactKey]) {
        const elPrice = el.subcontractor || el.material + el.labor + el.equipment || 0;
        matches.push({ ...el, _matchType: "exact", _elPrice: elPrice });
      }
    }
    // CSI code + unit match (broader) — check price proximity (within 40%)
    if (csiCode) {
      const csiKey = `${csiCode}|${(unit || "").toUpperCase()}`;
      const csiMatches = dbLookup[csiKey] || [];
      for (const el of csiMatches) {
        if (matches.some(m => m.id === el.id)) continue; // skip if already exact match
        const elPrice = el.subcontractor || el.material + el.labor + el.equipment || 0;
        if (elPrice > 0 && unitPrice > 0) {
          const ratio = unitPrice / elPrice;
          if (ratio > 0.6 && ratio < 1.4) {
            matches.push({ ...el, _matchType: "similar", _elPrice: elPrice });
          }
        }
      }
    }
    return matches.slice(0, 3); // max 3 matches
  }

  const loadItems = useCallback(async () => {
    setLoading(true);
    const { data: runs, error } = await supabase
      .from("ingestion_runs")
      .select("id, filename, company_name, folder_type, parsed_data, classification, source, uploaded_by")
      .eq("parse_status", "parsed");

    if (error || !runs) { setLoading(false); return; }

    const allItems = [];
    for (const run of runs) {
      const pd = run.parsed_data || {};
      // Try to get ZIP from classification for normalization
      const zip = run.classification?.projectZip || "";
      const laborType = run.classification?.laborType || "open_shop";

      for (const item of pd.lineItems || []) {
        if (!item.description) continue;

        // ONLY include items with a real unit rate: must have unit AND unitPrice > 0
        const unit = item.unit ? normalizeUnit(item.unit) : null;
        const unitPrice = parseFloat(item.unitPrice);
        if (!unit || !unitPrice || unitPrice <= 0) continue;

        // Normalize the unit price to national open-shop baseline
        const norm = normalizePerSF(unitPrice, zip, laborType);

        allItems.push({
          id: `${run.id}:${item.description}:${unitPrice}`,
          runId: run.id,
          filename: run.filename,
          company: run.company_name || run.classification?.companyName || "Unknown",
          folderType: run.folder_type,
          label: titleCase(item.description),
          csiCode: item.csiCode || "",
          costCode: item.csiCode ? `${item.csiCode}.0000` : "",
          unit,
          unitPrice,
          normalizedPrice: norm.normalized,
          locationFactor: norm.combinedFactor,
          quantity: item.quantity || null,
          amount: item.amount || null,
          source: run.source || "batch_parse",
          status: "pending",
        });
      }
    }

    // Restore saved decisions
    const saved = JSON.parse(localStorage.getItem("bldg-unit-rate-approvals") || "{}");
    for (const item of allItems) {
      const s = saved[item.id];
      if (s) {
        item.status = s.status;
        if (s.editedLabel) item.label = s.editedLabel;
        if (s.editedUnit) item.unit = s.editedUnit;
        if (s.editedPrice) item.unitPrice = s.editedPrice;
        if (s.editedCostCode) item.costCode = s.editedCostCode;
      }
    }

    const s = { pending: 0, approved: 0, rejected: 0, pushed: 0, total: allItems.length };
    for (const i of allItems) s[i.status] = (s[i.status] || 0) + 1;
    setStats(s);
    setItems(allItems);
    setLoading(false);
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const saveDecision = (itemId, status, edits = {}) => {
    const saved = JSON.parse(localStorage.getItem("bldg-unit-rate-approvals") || "{}");
    saved[itemId] = { status, ...edits, decidedAt: Date.now() };
    localStorage.setItem("bldg-unit-rate-approvals", JSON.stringify(saved));

    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      return {
        ...i, status,
        ...(edits.editedLabel ? { label: edits.editedLabel } : {}),
        ...(edits.editedUnit ? { unit: edits.editedUnit } : {}),
        ...(edits.editedPrice ? { unitPrice: edits.editedPrice } : {}),
        ...(edits.editedCostCode ? { costCode: edits.editedCostCode } : {}),
      };
    }));

    setStats(prev => {
      const old = items.find(i => i.id === itemId)?.status || "pending";
      return { ...prev, [old]: Math.max(0, prev[old] - 1), [status]: (prev[status] || 0) + 1 };
    });
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditValues({
      label: item.label,
      unit: item.unit,
      price: item.unitPrice,
      costCode: item.costCode,
    });
  };

  const saveEdit = (itemId) => {
    saveDecision(itemId, "pending", {
      editedLabel: editValues.label,
      editedUnit: editValues.unit,
      editedPrice: parseFloat(editValues.price) || 0,
      editedCostCode: editValues.costCode,
    });
    setEditingId(null);
  };

  const pushApprovedToDatabase = async () => {
    const approved = items.filter(i => i.status === "approved");
    if (!approved.length) return alert("No approved items to push.");

    try {
      const store = useDatabaseStore.getState();
      let added = 0;
      let skipped = 0;

      for (const item of approved) {
        // Only check against OTHER batch-approved items to prevent true duplicates
        // Don't skip just because a master item has a similar name — these are different data
        const existing = (store.elements || []).find(e =>
          e.batchApproved &&
          (e.name || "").toLowerCase() === (item.label || "").toLowerCase() &&
          e.unit === item.unit
        );
        if (existing) { skipped++; continue; }

        store.addElement({
          code: item.costCode || (item.csiCode ? `${item.csiCode}.0000` : "00.0000"),
          name: item.label,
          unit: item.unit,
          material: 0,
          labor: 0,
          equipment: 0,
          subcontractor: item.unitPrice,
          trade: "general",
          source: `Batch: ${item.company}`,
          sourceFileName: item.filename,
          pricingBasis: "local",
          batchApproved: true,
          approvedAt: Date.now(),
        });
        added++;
      }

      // Persist to IndexedDB + cloud
      await saveUserLibrary();

      // Move pushed items to "pushed" status so button updates
      const saved = JSON.parse(localStorage.getItem("bldg-unit-rate-approvals") || "{}");
      for (const item of approved) {
        saved[item.id] = { ...saved[item.id], status: "pushed", pushedAt: Date.now() };
      }
      localStorage.setItem("bldg-unit-rate-approvals", JSON.stringify(saved));

      setItems(prev => prev.map(i =>
        i.status === "approved" ? { ...i, status: "pushed" } : i
      ));
      setStats(prev => ({
        ...prev,
        approved: 0,
        pushed: (prev.pushed || 0) + added + skipped,
      }));

      alert(`Added ${added} items to cost database.${skipped > 0 ? ` ${skipped} already existed.` : ""}`);
    } catch (err) {
      console.error("[pushApproved] Error:", err);
      alert("Error pushing to database: " + err.message);
    }
  };

  const filtered = items.filter(i => {
    if (filter !== "all" && i.status !== filter) return false;
    if (csiFilter !== "all" && i.csiCode !== csiFilter) return false;
    if (sourceFilter !== "all" && i.source !== sourceFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const match = (i.label || "").toLowerCase().includes(s) ||
        (i.company || "").toLowerCase().includes(s) ||
        (i.filename || "").toLowerCase().includes(s) ||
        (i.costCode || "").toLowerCase().includes(s) ||
        (i.csiCode || "").includes(s) ||
        (i.unit || "").toLowerCase().includes(s);
      if (!match) return false;
    }
    return true;
  });

  const csiCodes = [...new Set(items.map(i => i.csiCode))].filter(Boolean).sort();

  const inp = {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 6,
    padding: "5px 8px",
    color: "#ffffff",
    fontSize: 12,
    outline: "none",
    fontFamily: "inherit",
    caretColor: "#ffffff",
  };

  const grid = "80px 1fr 50px 75px 75px 170px 90px 140px";

  return (
    <div style={{ padding: 24, maxWidth: 1400, overflow: "auto", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: T?.text, margin: 0 }}>Unit Rate Review</h2>
          <p style={{ fontSize: 13, color: T?.textMuted, margin: "4px 0 0" }}>
            Only items with actual unit rates ($/SF, $/LF, $/EA, etc.) appear here. Approve to add to cost database.
          </p>
        </div>
        <button
          onClick={pushApprovedToDatabase}
          style={{
            padding: "8px 20px", borderRadius: 8,
            background: stats.approved > 0 ? "#22c55e" : "rgba(255,255,255,0.06)",
            color: stats.approved > 0 ? "#000" : T?.textMuted,
            border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
          }}
        >
          Push {stats.approved} Approved to DB
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { key: "all", label: "All", count: stats.total, color: T?.text },
          { key: "pending", label: "Pending", count: stats.pending, color: "#eab308" },
          { key: "approved", label: "Approved", count: stats.approved, color: "#22c55e" },
          { key: "pushed", label: "In DB", count: stats.pushed || 0, color: "#3b82f6" },
          { key: "rejected", label: "Rejected", count: stats.rejected, color: "#ef4444" },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            style={{
              ...card(C), padding: "10px 16px", cursor: "pointer",
              border: filter === s.key ? `2px solid ${s.color}` : `1px solid ${T?.border}`,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.count}</span>
            <span style={{ fontSize: 12, color: T?.textMuted }}>{s.label}</span>
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, company, file..."
          style={{ ...inp, marginLeft: "auto", minWidth: 220 }}
        />
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          style={{ ...inp, minWidth: 120 }}>
          <option value="all">All Sources</option>
          <option value="batch_parse">Batch Parse</option>
          <option value="extraction_pipeline">Extracted</option>
        </select>
        <select value={csiFilter} onChange={e => setCsiFilter(e.target.value)}
          style={{ ...inp, minWidth: 120 }}>
          <option value="all">All Divisions</option>
          {csiCodes.map(c => <option key={c} value={c}>Div {c}</option>)}
        </select>
      </div>

      {loading && <div style={{ color: T?.textMuted, padding: 40, textAlign: "center" }}>Loading unit rates...</div>}

      {/* Table */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Header row */}
        <div style={{
          display: "grid", gridTemplateColumns: grid,
          gap: 8, padding: "8px 12px",
          fontSize: 10, fontWeight: 600, color: T?.textMuted, textTransform: "uppercase", letterSpacing: 0.5,
          borderBottom: `2px solid ${T?.border}`,
        }}>
          <span>Cost Code</span>
          <span>Description / Label</span>
          <span>Unit</span>
          <span>$/Unit</span>
          <span>Normalized</span>
          <span>In DB?</span>
          <span>Source</span>
          <span>Actions</span>
        </div>

        {filtered.slice(0, 300).map(item => {
          const isEditing = editingId === item.id;
          return (
            <div
              key={item.id}
              style={{
                display: "grid", gridTemplateColumns: grid,
                gap: 8, padding: "10px 12px",
                fontSize: 12, color: T?.text,
                background: item.status === "approved" ? "rgba(34,197,94,0.05)" :
                  item.status === "rejected" ? "rgba(239,68,68,0.04)" : "transparent",
                borderBottom: `1px solid ${T?.border || "rgba(255,255,255,0.04)"}`,
                alignItems: "center",
                opacity: item.status === "rejected" ? 0.4 : 1,
              }}
            >
              {/* Cost Code */}
              {isEditing ? (
                <input
                  value={editValues.costCode ?? ""}
                  onChange={e => setEditValues(v => ({ ...v, costCode: e.target.value }))}
                  style={{ ...inp, width: 70, fontFamily: "IBM Plex Mono, monospace", fontSize: 11 }}
                  placeholder="09.2100"
                />
              ) : (
                <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: item.costCode ? T?.text : T?.textMuted }}>
                  {item.costCode || "—"}
                </span>
              )}

              {/* Description / Label — editable */}
              {isEditing ? (
                <input
                  value={editValues.label ?? ""}
                  onChange={e => setEditValues(v => ({ ...v, label: e.target.value }))}
                  style={{ ...inp, width: "100%" }}
                />
              ) : (
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={item.label}>
                  {item.label}
                </span>
              )}

              {/* Unit */}
              {isEditing ? (
                <input
                  value={editValues.unit ?? ""}
                  onChange={e => setEditValues(v => ({ ...v, unit: e.target.value.toUpperCase() }))}
                  style={{ ...inp, width: 50, textAlign: "center" }}
                />
              ) : (
                <span style={{ color: T?.textMuted, fontSize: 11, textAlign: "center" }}>{item.unit}</span>
              )}

              {/* Unit Price */}
              {isEditing ? (
                <input
                  type="number"
                  value={editValues.price ?? ""}
                  onChange={e => setEditValues(v => ({ ...v, price: e.target.value }))}
                  style={{ ...inp, width: 70, fontFamily: "IBM Plex Mono, monospace", fontSize: 11 }}
                />
              ) : (
                <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, fontWeight: 600 }}>
                  ${item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}

              {/* Normalized Price */}
              <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: T?.textMuted }}
                title={`Factor: ${item.locationFactor || 1}`}>
                ${item.normalizedPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "—"}
              </span>

              {/* DB Match */}
              {(() => {
                const matches = findDbMatches(item.label, item.unit, item.csiCode, item.unitPrice);
                if (!matches.length) return <span style={{ fontSize: 10, color: T?.textMuted }}>New</span>;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {matches.map((m, mi) => {
                      const priceDiff = m._elPrice > 0 ? Math.round(((item.unitPrice - m._elPrice) / m._elPrice) * 100) : null;
                      return (
                        <div key={mi} style={{
                          fontSize: 10, lineHeight: 1.3,
                          padding: "2px 6px", borderRadius: 4,
                          background: m._matchType === "exact" ? "rgba(239,68,68,0.1)" : "rgba(234,179,8,0.1)",
                          border: `1px solid ${m._matchType === "exact" ? "rgba(239,68,68,0.25)" : "rgba(234,179,8,0.25)"}`,
                        }}>
                          <div style={{ color: m._matchType === "exact" ? "#ef4444" : "#eab308", fontWeight: 600 }}>
                            {m._matchType === "exact" ? "Exists" : "Similar"}
                          </div>
                          <div style={{ color: T?.text, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}
                            title={m.name}>
                            {m.name}
                          </div>
                          <div style={{ color: T?.textMuted, fontFamily: "IBM Plex Mono, monospace", fontSize: 9 }}>
                            ${m._elPrice?.toFixed(2)}/{m.unit}
                            {priceDiff !== null && (
                              <span style={{ color: priceDiff > 0 ? "#ef4444" : "#22c55e", marginLeft: 4 }}>
                                ({priceDiff > 0 ? "+" : ""}{priceDiff}%)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Source */}
              <span style={{ fontSize: 10, color: T?.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}
                title={`${item.company} — ${item.filename}`}>
                {item.company}
                {item.source === "extraction_pipeline" && (
                  <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: `${C.accent}15`, color: C.accent, fontWeight: 600, marginLeft: 4, flexShrink: 0 }}>
                    EXTRACTED
                  </span>
                )}
              </span>

              {/* Actions */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {isEditing ? (
                  <>
                    <button onClick={() => saveEdit(item.id)}
                      style={{ padding: "3px 10px", borderRadius: 4, background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)}
                      style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: T?.textMuted, border: "none", cursor: "pointer", fontSize: 11 }}>
                      Cancel
                    </button>
                  </>
                ) : item.status === "pending" ? (
                  <>
                    <button onClick={() => saveDecision(item.id, "approved")}
                      style={{ padding: "3px 10px", borderRadius: 4, background: "#22c55e", color: "#000", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                      Approve
                    </button>
                    <button onClick={() => saveDecision(item.id, "rejected")}
                      style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "none", cursor: "pointer", fontSize: 11 }}>
                      Reject
                    </button>
                    <button onClick={() => startEdit(item)}
                      style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: T?.textMuted, border: "none", cursor: "pointer", fontSize: 11 }}>
                      Edit
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => saveDecision(item.id, "pending")}
                      style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: T?.textMuted, border: "none", cursor: "pointer", fontSize: 11 }}>
                      Undo
                    </button>
                    <button onClick={() => startEdit(item)}
                      style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: T?.textMuted, border: "none", cursor: "pointer", fontSize: 11 }}>
                      Edit
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length > 300 && (
          <div style={{ padding: 16, textAlign: "center", color: T?.textMuted, fontSize: 12 }}>
            Showing 300 of {filtered.length}. Use division filter to narrow down.
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: T?.textMuted }}>
            {filter === "pending" ? "No pending unit rates to review." : "No items match this filter."}
          </div>
        )}
      </div>
    </div>
  );
}
