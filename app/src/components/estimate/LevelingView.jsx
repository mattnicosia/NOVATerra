import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import { useProjectStore } from "@/stores/projectStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
// styles utils available if needed: inp, nInp, bt
import { nn, fmt, pct } from "@/utils/format";
import { TRADE_MAP } from "@/constants/tradeGroupings";
import { useLevelingBids } from "@/hooks/useLevelingBids";

/* ─── Cell status definitions ─── */
const CELL_STATUSES = [
  { key: "lumpsum", label: "Lump Sum", icon: I.dollar, shortLabel: "LS" },
  { key: "unitrate", label: "Unit Rate", icon: I.hash, shortLabel: "UR" },
  { key: "carried", label: "Carried", icon: I.layers, shortLabel: "CR" },
  { key: "blank", label: "Clear", icon: I.x, shortLabel: "" },
];

/* ─── Context Menu — pricing method picker (right-click on cell) ─── */
function CellContextMenu({ pos, item, currentStatus, getItemTotal, onSelect, onClose, C }) {
  const T = C.T;
  const ref = useRef(null);
  const dk = C.isDark !== false;

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  useEffect(() => {
    const handler = e => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Bounds check to prevent right-edge overflow
  const x = Math.min(pos.x, window.innerWidth - 180);
  const y = Math.min(pos.y, window.innerHeight - 200);

  return (
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 1000,
        background: dk
          ? "linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)"
          : "linear-gradient(145deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.92) 100%)",
        backdropFilter: "blur(40px) saturate(1.8)",
        WebkitBackdropFilter: "blur(40px) saturate(1.8)",
        border: `1px solid ${dk ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`,
        borderRadius: 10,
        padding: "6px 4px",
        boxShadow: dk
          ? "0 12px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)"
          : "0 4px 16px rgba(0,0,0,0.10), 0 12px 40px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)",
        minWidth: 155,
      }}
    >
      <div
        style={{
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: C.textDim,
          padding: "2px 8px 4px",
          fontFamily: T.font.sans,
        }}
      >
        Pricing Method
      </div>
      {CELL_STATUSES.map(s => {
        const isActive = s.key === currentStatus || (s.key === "lumpsum" && currentStatus === "amount");
        const hoverBg = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
        return (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "6px 8px",
              borderRadius: 7,
              border: "none",
              background: isActive ? `${C.accent}15` : "transparent",
              cursor: "pointer",
              textAlign: "left",
              fontSize: 11,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? C.accent : C.text,
              fontFamily: T.font.sans,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.background = hoverBg;
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.background = isActive ? `${C.accent}15` : "transparent";
            }}
          >
            <Ic d={s.icon} size={13} color={isActive ? C.accent : C.textDim} sw={1.8} />
            <span style={{ flex: 1 }}>{s.label}</span>
            {/* Show quantity hint for unit rate */}
            {s.key === "unitrate" && nn(item.quantity) > 0 && (
              <span style={{ fontSize: 9, color: C.textDim }}>
                ×{nn(item.quantity)} {item.unit || ""}
              </span>
            )}
            {/* Show internal total hint for carried */}
            {s.key === "carried" && <span style={{ fontSize: 9, color: C.textDim }}>{fmt(getItemTotal(item))}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Sub Autocomplete — CRM-backed search with inline add ─── */
function SubAutocomplete({ newSubName, setNewSubName, newSubRef, onSelect, onCancel, C }) {
  const T = C.T;
  const masterSubs = useMasterDataStore(s => s.masterData.subcontractors);
  const addMasterItem = useMasterDataStore(s => s.addMasterItem);
  const [showDropdown, setShowDropdown] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSub, setNewSub] = useState({ company: "", trades: [], contact: "", email: "", phone: "" });
  const dropRef = useRef(null);

  // Filter subs by search term
  const filtered = useMemo(() => {
    const list = masterSubs || [];
    if (!newSubName.trim()) return list.slice(0, 8);
    const q = newSubName.toLowerCase();
    return list
      .filter(
        s =>
          (s.company || "").toLowerCase().includes(q) ||
          (s.trades || []).some(
            tk => tk.toLowerCase().includes(q) || (TRADE_MAP[tk]?.label || "").toLowerCase().includes(q),
          ) ||
          (s.contact || "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [newSubName, masterSubs]);

  const handleSelectExisting = sub => {
    onSelect(sub.company);
    setShowDropdown(false);
  };

  const handleAddNewSub = () => {
    if (!newSub.company.trim()) return;
    addMasterItem("subcontractors", { ...newSub });
    onSelect(newSub.company);
    setShowNewForm(false);
  };

  if (showNewForm) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.accent }}>New Subcontractor</span>
          <span style={{ fontSize: 8, color: C.textDim }}>Added to your CRM</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
          {[
            { key: "company", label: "Company *", ph: "Company name" },
            { key: "trade", label: "Trade", ph: "e.g., Electrical" },
            { key: "contact", label: "Contact", ph: "Contact name" },
            { key: "email", label: "Email", ph: "email@example.com" },
            { key: "phone", label: "Phone", ph: "(555) 555-5555" },
          ].map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 8, fontWeight: 600, color: C.textDim, marginBottom: 2 }}>{f.label}</div>
              <input
                value={newSub[f.key]}
                onChange={e => setNewSub(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.ph}
                autoFocus={f.key === "company"}
                onKeyDown={e => {
                  if (e.key === "Enter") handleAddNewSub();
                  if (e.key === "Escape") {
                    setShowNewForm(false);
                    onCancel();
                  }
                }}
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  fontSize: 11,
                  border: `1px solid ${f.key === "company" ? C.accent + "60" : C.border}`,
                  borderRadius: 4,
                  outline: "none",
                  background: C.bg,
                  color: C.text,
                  fontFamily: T.font.sans,
                  boxSizing: "border-box",
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={handleAddNewSub}
            disabled={!newSub.company.trim()}
            style={{
              padding: "4px 12px",
              fontSize: 10,
              fontWeight: 700,
              border: "none",
              borderRadius: 4,
              background: C.accent,
              color: "#fff",
              cursor: newSub.company.trim() ? "pointer" : "not-allowed",
              opacity: newSub.company.trim() ? 1 : 0.5,
            }}
          >
            Add & Select
          </button>
          <button
            onClick={() => {
              setShowNewForm(false);
              onCancel();
            }}
            style={{
              padding: "4px 8px",
              fontSize: 10,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              background: "transparent",
              color: C.textDim,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.accent }}>Add sub:</span>
        <input
          ref={newSubRef}
          value={newSubName}
          onChange={e => {
            setNewSubName(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={e => {
            if (e.key === "Enter" && newSubName.trim()) onSelect(newSubName);
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Search subcontractors..."
          style={{
            flex: 1,
            maxWidth: 250,
            padding: "3px 8px",
            fontSize: 11,
            border: `1px solid ${C.accent}40`,
            borderRadius: 4,
            outline: "none",
            background: C.bg,
            color: C.text,
            fontFamily: T.font.sans,
          }}
        />
        <button
          onClick={onCancel}
          style={{
            padding: "3px 8px",
            fontSize: 10,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            background: "transparent",
            color: C.textDim,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
      {showDropdown && (
        <div
          ref={dropRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 60,
            zIndex: 100,
            marginTop: 2,
            width: 280,
            maxHeight: 240,
            overflowY: "auto",
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            padding: 4,
          }}
        >
          {filtered.length > 0 && (
            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: C.textDim,
                padding: "2px 8px 4px",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              From Contacts
            </div>
          )}
          {filtered.map(s => (
            <div
              key={s.id}
              onClick={() => handleSelectExisting(s)}
              style={{
                padding: "5px 8px",
                borderRadius: 5,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.accent + "12")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: `${C.accent}18`,
                  border: `1px solid ${C.accent}25`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 700,
                  color: C.accent,
                  flexShrink: 0,
                }}
              >
                {(s.company || "?")[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.company || "Unnamed"}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: C.textDim,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {[(s.trades || []).map(tk => TRADE_MAP[tk]?.label || tk).join(", "), s.contact]
                    .filter(Boolean)
                    .join(" · ") || "No details"}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && newSubName.trim() && (
            <div style={{ padding: "8px", fontSize: 10, color: C.textDim, textAlign: "center" }}>
              No matching subcontractors
            </div>
          )}
          {/* Add new sub option */}
          <div
            style={{
              marginTop: 2,
              padding: "6px 8px",
              borderTop: `1px solid ${C.border}`,
              borderRadius: "0 0 6px 6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "background 0.1s",
            }}
            onClick={() => {
              setShowNewForm(true);
              setNewSub(prev => ({ ...prev, company: newSubName }));
              setShowDropdown(false);
            }}
            onMouseEnter={e => (e.currentTarget.style.background = C.accent + "12")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: `${C.green || C.accent}15`,
                border: `1px dashed ${C.green || C.accent}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                color: C.green || C.accent,
              }}
            >
              +
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.green || C.accent }}>Add New Subcontractor</div>
              <div style={{ fontSize: 8, color: C.textDim }}>Create in CRM & add to leveling</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Inline-editable cell with status differentiation ─── */
function BidCell({ value, status, item, onSave, onContextMenu, getItemTotal, highlight, C, T }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const handleContextMenu = e => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e);
  };

  // ── Editing mode (lumpsum or unitrate) ──
  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          onSave(draft);
          setEditing(false);
        }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            onSave(draft);
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
        onContextMenu={handleContextMenu}
        style={{
          width: "100%",
          padding: "2px 6px",
          fontSize: 11,
          fontWeight: 600,
          fontFamily: T.font.sans,
          textAlign: "right",
          border: `1.5px solid ${C.accent}`,
          borderRadius: 3,
          outline: "none",
          background: C.bg,
          color: C.text,
          boxSizing: "border-box",
        }}
      />
    );
  }

  // ── Computed display value ──
  const computedVal = (() => {
    if (status === "blank") return 0;
    if (status === "lumpsum" || status === "amount") return nn(value);
    if (status === "unitrate") return nn(value) * nn(item.quantity);
    if (status === "carried") return getItemTotal(item);
    return 0;
  })();

  // ── Highlight colors (low/high among subs) ──
  const bg = highlight === "low" ? `${C.green}12` : highlight === "high" ? `${C.red || C.orange}12` : "transparent";
  const baseColor =
    highlight === "low"
      ? C.green
      : highlight === "high"
        ? C.red || C.orange
        : status === "blank"
          ? C.textDim
          : status === "carried"
            ? C.accent
            : C.text;

  const handleClick = e => {
    if (status === "carried") return; // Carried cells are auto-filled, not editable
    if (status === "blank") {
      // Blank cells: show pricing method picker on regular click
      e.preventDefault();
      onContextMenu(e);
      return;
    }
    setDraft(String(value || ""));
    setEditing(true);
  };

  const titleText =
    status === "blank"
      ? "Click to set pricing method"
      : status === "unitrate"
        ? `Unit Rate: ${fmt(nn(value))}/${item.unit || "ea"} × ${nn(item.quantity)} = ${fmt(computedVal)}`
        : status === "carried"
          ? `Carried from internal: ${fmt(computedVal)}`
          : `Lump Sum: ${fmt(computedVal)}`;

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={titleText}
      style={{
        padding: "2px 4px",
        fontSize: 11,
        fontWeight: status === "blank" ? 400 : 600,
        fontFamily: T.font.sans,
        fontFeatureSettings: "'tnum'",
        textAlign: "right",
        cursor: status === "carried" ? "default" : "pointer",
        minHeight: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 3,
        background: bg,
        color: baseColor,
        borderRadius: 2,
        transition: "background 0.1s",
        ...(status === "carried" ? { borderLeft: `2px solid ${C.accent}25` } : {}),
      }}
    >
      {/* Status badge */}
      {(status === "lumpsum" || status === "amount") && computedVal > 0 && (
        <span style={{ fontSize: 7, fontWeight: 700, opacity: 0.4, letterSpacing: 0.5 }}>LS</span>
      )}
      {status === "unitrate" && computedVal > 0 && (
        <span style={{ fontSize: 7, fontWeight: 700, opacity: 0.4, letterSpacing: 0.5 }}>UR</span>
      )}
      {status === "carried" && <Ic d={I.layers} size={8} color={C.accent} sw={2} />}

      {/* Main value */}
      {status === "blank" ? <span style={{ opacity: 0.35 }}>—</span> : <span>{fmt(computedVal)}</span>}

      {/* Unit rate breakdown */}
      {status === "unitrate" && nn(value) > 0 && (
        <span style={{ fontSize: 8, color: C.textDim, fontWeight: 500, whiteSpace: "nowrap" }}>
          ({fmt(nn(value))}/{item.unit || "ea"})
        </span>
      )}
    </div>
  );
}

/* ─── Variance badge — % diff from internal ─── */
function VarianceBadge({ subTotal, internalTotal, C, fontSize = 8 }) {
  const T = C.T;
  if (!internalTotal || internalTotal <= 0 || !subTotal || subTotal <= 0) return null;
  const variance = ((subTotal - internalTotal) / internalTotal) * 100;
  const color = variance <= 0 ? C.green : C.red || C.orange;
  const sign = variance > 0 ? "+" : "";
  return (
    <span
      style={{
        fontSize,
        fontWeight: 600,
        color,
        fontFamily: T.font.sans,
        fontFeatureSettings: "'tnum'",
      }}
    >
      {sign}
      {pct(variance)}
    </span>
  );
}

/* ─── Import Proposals Popover ─── */
function ImportProposalsPopover({ onClose, onImport, C }) {
  const T = C.T;
  const ref = useRef(null);
  const dk = C.isDark !== false;
  const bidPackages = useBidManagementStore(s => s.bidPackages);
  const invitations = useBidManagementStore(s => s.invitations);
  const proposals = useBidManagementStore(s => s.proposals);
  const linkedSubs = useBidManagementStore(s => s.linkedSubs);

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  useEffect(() => {
    const handler = e => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Count parsed proposals per package
  const pkgStats = bidPackages.map(pkg => {
    const invites = invitations[pkg.id] || [];
    const parsedCount = invites.filter(inv => proposals[inv.id]?.parsedData).length;
    // Check if already imported (by matching sub names)
    const importedNames = new Set(linkedSubs.filter(ls => ls.source === "portal").map(ls => ls.name));
    const alreadyImported =
      parsedCount > 0 &&
      invites.every(inv => {
        const p = proposals[inv.id];
        if (!p?.parsedData) return true; // skip non-parsed
        const name = inv.subCompany || inv.subContact || "";
        return importedNames.has(name);
      });
    return { pkg, parsedCount, alreadyImported };
  });

  const hasAnyParsed = pkgStats.some(s => s.parsedCount > 0);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        right: 0,
        top: "100%",
        marginTop: 6,
        zIndex: 100,
        background: dk
          ? "linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)"
          : "linear-gradient(145deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.92) 100%)",
        backdropFilter: "blur(40px) saturate(1.8)",
        WebkitBackdropFilter: "blur(40px) saturate(1.8)",
        border: `1px solid ${dk ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`,
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: dk
          ? "0 12px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)"
          : "0 4px 16px rgba(0,0,0,0.10), 0 12px 40px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)",
        minWidth: 220,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.text,
          marginBottom: 8,
          fontFamily: T.font.sans,
        }}
      >
        Import Bid Proposals
      </div>
      {!hasAnyParsed && (
        <div style={{ fontSize: 10, color: C.textDim, padding: "8px 0" }}>
          No parsed proposals available. Parse proposals in Bid Packages first.
        </div>
      )}
      {pkgStats.map(({ pkg, parsedCount, alreadyImported }) => {
        if (parsedCount === 0) return null;
        return (
          <div
            key={pkg.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 8px",
              borderRadius: 6,
              background: alreadyImported ? `${C.green}08` : `${C.text}04`,
              marginBottom: 4,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text, fontFamily: T.font.sans }}>
                {pkg.name || "Unnamed Package"}
              </div>
              <div style={{ fontSize: 9, color: C.textDim }}>
                {parsedCount} proposal{parsedCount !== 1 ? "s" : ""} parsed
              </div>
            </div>
            {alreadyImported ? (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: C.green,
                  padding: "3px 8px",
                  borderRadius: 4,
                }}
              >
                Imported
              </span>
            ) : (
              <button
                onClick={() => onImport(pkg.id)}
                style={{
                  padding: "4px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                  border: "none",
                  borderRadius: 5,
                  background: C.accent,
                  color: "#fff",
                  cursor: "pointer",
                  fontFamily: T.font.sans,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
              >
                Import
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function LevelingView() {
  const C = useTheme();
  const T = C.T;
  const items = useItemsStore(s => s.items);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const activeCodes = useProjectStore(s => s.getActiveCodes)();

  const subBidSubs = useBidManagementStore(s => s.subBidSubs);
  const bidTotals = useBidManagementStore(s => s.bidTotals);
  const setBidTotals = useBidManagementStore(s => s.setBidTotals);

  const [collapsed, setCollapsed] = useState({});
  const [addSubSk, setAddSubSk] = useState(null);
  const [newSubName, setNewSubName] = useState("");
  const newSubRef = useRef(null);
  const [cellMenu, setCellMenu] = useState(null); // { x, y, itemId, subId, item }
  const [showImportPopover, setShowImportPopover] = useState(false);

  // ── Import handler: bridge bid packages → leveling grid ──
  const handleImportProposals = useCallback(packageId => {
    const { generateLevelingData } = useBidManagementStore.getState();
    const { importParsedProposals } = useBidManagementStore.getState();
    const currentItems = useItemsStore.getState().items;
    const levelingData = generateLevelingData(packageId, currentItems);
    importParsedProposals(levelingData);
    setShowImportPopover(false);
  }, []);

  // Group items by subdivision
  const getSubKey = item => {
    const code = item.code || "";
    const sk = code.includes(".")
      ? code.split(".").slice(0, 2).join(".")
      : (item.division || "Unassigned").split(" - ")[0] || "00";
    return sk.includes(".") ? sk : `${sk}.00`;
  };

  const subdivisions = useMemo(() => {
    const groups = {};
    items.forEach(item => {
      const sk = getSubKey(item);
      if (!groups[sk]) groups[sk] = { sk, items: [], total: 0 };
      groups[sk].items.push(item);
      groups[sk].total += getItemTotal(item);
    });
    return Object.values(groups).sort((a, b) => a.sk.localeCompare(b.sk));
    // getItemTotal is a stable Zustand selector
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Collect ALL subs across all subdivisions for column headers
  const allSubs = useMemo(() => {
    const map = new Map();
    Object.entries(subBidSubs).forEach(([, subs]) => {
      (subs || []).forEach(s => {
        if (!map.has(s.id)) map.set(s.id, s);
      });
    });
    return Array.from(map.values());
  }, [subBidSubs]);

  const getSubSubs = sk => subBidSubs[sk] || [];
  const addSubBidSub = (sk, name) => {
    const current = useBidManagementStore.getState().subBidSubs;
    const subs = [...(current[sk] || []), { id: `sub_${Date.now()}`, name: name || "" }];
    useBidManagementStore.getState().setSubBidSubs({ ...current, [sk]: subs });
  };
  const updateSubBidSubName = (sk, subId, name) => {
    const current = useBidManagementStore.getState().subBidSubs;
    useBidManagementStore
      .getState()
      .setSubBidSubs({ ...current, [sk]: (current[sk] || []).map(s => (s.id === subId ? { ...s, name } : s)) });
  };

  // ── Bid cell operations, selection logic, computed totals (extracted) ──
  const {
    bidCells, bidSelections, linkedSubs, subKeyLabels,
    getCell, getCellComputedValue, saveCellWithStatus, saveCell, autoCarry,
    getSkSubTotal, getBidSelection, setBidSelection, getSelectedBidValue,
    getSubLabel, totalBidValue,
  } = useLevelingBids({ items, getItemTotal, subdivisions, activeCodes });

  const internalGrandTotal = useMemo(() => subdivisions.reduce((sum, s) => sum + s.total, 0), [subdivisions]);

  // Get highlight for a cell (lowest/highest among subs for a given item)
  const getHighlight = (item, subId, sk) => {
    const subs = getSubSubs(sk);
    if (subs.length < 2) return null;
    const values = subs
      .map(s => {
        const cell = getCell(item.id, s.id);
        return { id: s.id, val: getCellComputedValue(item, cell), blank: cell.status === "blank" };
      })
      .filter(v => !v.blank && v.val > 0);
    if (values.length < 2) return null;
    const min = Math.min(...values.map(v => v.val));
    const max = Math.max(...values.map(v => v.val));
    const thisCell = getCell(item.id, subId);
    const thisVal = getCellComputedValue(item, thisCell);
    if (thisCell.status === "blank" || thisVal === 0) return null;
    if (thisVal === min && min !== max) return "low";
    if (thisVal === max && min !== max) return "high";
    return null;
  };

  // Focus new sub input when addSubSk changes
  useEffect(() => {
    if (addSubSk && newSubRef.current) newSubRef.current.focus();
  }, [addSubSk]);

  const subColWidth = 120;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Summary bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 16px",
          flexShrink: 0,
          background: `${C.green}08`,
          borderBottom: `1px solid ${C.green}30`,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>
          Bid Leveling — {subdivisions.length} subdivisions · {items.length} items
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Import Proposals Button */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowImportPopover(v => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                fontSize: 10,
                fontWeight: 600,
                border: `1px solid ${C.accent}40`,
                borderRadius: 5,
                background: showImportPopover ? `${C.accent}12` : "transparent",
                color: C.accent,
                cursor: "pointer",
                fontFamily: T.font.sans,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => {
                if (!showImportPopover) e.currentTarget.style.background = `${C.accent}08`;
              }}
              onMouseLeave={e => {
                if (!showImportPopover) e.currentTarget.style.background = "transparent";
              }}
            >
              <Ic d={I.download} size={11} color={C.accent} sw={2} />
              Import
            </button>
            {showImportPopover && (
              <ImportProposalsPopover
                onClose={() => setShowImportPopover(false)}
                onImport={handleImportProposals}
                C={C}
              />
            )}
          </div>
          <span style={{ fontSize: 10, color: C.textDim }}>Internal: {fmt(internalGrandTotal)}</span>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: C.green,
              fontFamily: T.font.sans,
              fontFeatureSettings: "'tnum'",
            }}
          >
            {fmt(totalBidValue)}
          </span>
        </div>
      </div>

      {/* Spreadsheet grid */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 11,
            fontFamily: T.font.sans,
            tableLayout: "auto",
          }}
        >
          <thead>
            <tr style={{ position: "sticky", top: 0, zIndex: 10, background: C.bg }}>
              <th style={{ ...thStyle(C), width: 30, textAlign: "center" }}>#</th>
              <th style={{ ...thStyle(C), width: 70 }}>Code</th>
              <th style={{ ...thStyle(C), minWidth: 180 }}>Description</th>
              <th style={{ ...thStyle(C), width: 60, textAlign: "right" }}>Qty</th>
              <th style={{ ...thStyle(C), width: 40, textAlign: "center" }}>Unit</th>
              <th
                style={{
                  ...thStyle(C),
                  width: subColWidth,
                  textAlign: "right",
                  color: C.accent,
                  borderLeft: `2px solid ${C.accent}30`,
                }}
              >
                Internal
              </th>
              {allSubs.map(sub => {
                const sel = Object.entries(bidSelections).some(([, v]) => v.source === sub.id);
                return (
                  <th
                    key={sub.id}
                    style={{
                      ...thStyle(C),
                      width: subColWidth,
                      textAlign: "right",
                      borderLeft: sel ? `2px solid ${C.green}` : `1px solid ${C.border}`,
                      color: sel ? C.green : C.text,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                      <input
                        value={sub.name}
                        onChange={e => {
                          Object.entries(subBidSubs).forEach(([sk, subs]) => {
                            if (subs.some(s => s.id === sub.id)) updateSubBidSubName(sk, sub.id, e.target.value);
                          });
                        }}
                        placeholder="Sub name"
                        style={{
                          background: "transparent",
                          border: "none",
                          fontSize: 10,
                          fontWeight: 700,
                          color: sel ? C.green : C.text,
                          textAlign: "right",
                          width: "100%",
                          outline: "none",
                          padding: 0,
                          fontFamily: T.font.sans,
                        }}
                      />
                    </div>
                  </th>
                );
              })}
              <th style={{ ...thStyle(C), width: 36 }}>{/* Add sub button placeholder */}</th>
            </tr>
          </thead>
          <tbody>
            {subdivisions.map((sub, subIdx) => {
              const subs = getSubSubs(sub.sk);
              const sel = getBidSelection(sub.sk);
              const isCollapsed = collapsed[sub.sk];
              const skLinked = linkedSubs.filter(ls => (ls.subKeys || []).includes(sub.sk));

              return (
                <SubdivisionGroup
                  key={sub.sk}
                  sub={sub}
                  subIdx={subIdx}
                  subs={subs}
                  allSubs={allSubs}
                  sel={sel}
                  isCollapsed={isCollapsed}
                  C={C}
                  T={T}
                  subColWidth={subColWidth}
                  getCell={getCell}
                  getCellComputedValue={getCellComputedValue}
                  saveCell={saveCell}
                  saveCellWithStatus={saveCellWithStatus}
                  setCellMenu={setCellMenu}
                  getHighlight={getHighlight}
                  getItemTotal={getItemTotal}
                  getSubLabel={getSubLabel}
                  getSkSubTotal={getSkSubTotal}
                  getSelectedBidValue={getSelectedBidValue}
                  setBidSelection={setBidSelection}
                  setBidTotals={setBidTotals}
                  bidTotals={bidTotals}
                  autoCarry={autoCarry}
                  onToggle={() => setCollapsed(c => ({ ...c, [sub.sk]: !c[sub.sk] }))}
                  onAddSub={() => {
                    setAddSubSk(sub.sk);
                    setNewSubName("");
                  }}
                  addSubSk={addSubSk}
                  newSubName={newSubName}
                  setNewSubName={setNewSubName}
                  newSubRef={newSubRef}
                  onConfirmAddSub={name => {
                    addSubBidSub(sub.sk, name || newSubName);
                    setAddSubSk(null);
                    setNewSubName("");
                  }}
                  onCancelAddSub={() => {
                    setAddSubSk(null);
                    setNewSubName("");
                  }}
                  skLinked={skLinked}
                  linkedSubs={linkedSubs}
                />
              );
            })}

            {/* ─── Grand Total Row ─── */}
            <tr
              style={{
                position: "sticky",
                bottom: 0,
                zIndex: 9,
                background: C.bg,
              }}
            >
              <td
                colSpan={5}
                style={{
                  padding: "8px 10px",
                  fontWeight: 800,
                  fontSize: 13,
                  color: C.green,
                  borderTop: `3px solid ${C.green}`,
                  fontFamily: T.font.sans,
                }}
              >
                GRAND TOTAL
              </td>
              <td
                style={{
                  padding: "8px 8px",
                  textAlign: "right",
                  fontWeight: 800,
                  fontSize: 13,
                  color: C.accent,
                  borderLeft: `2px solid ${C.accent}30`,
                  borderTop: `3px solid ${C.green}`,
                  fontFamily: T.font.sans,
                  fontFeatureSettings: "'tnum'",
                }}
              >
                {fmt(internalGrandTotal)}
              </td>
              {allSubs.map(s => {
                const subGrandTotal = subdivisions.reduce((sum, sub) => {
                  const sks = getSubSubs(sub.sk);
                  if (!sks.some(ss => ss.id === s.id)) return sum;
                  return sum + getSkSubTotal(sub.sk, s.id);
                }, 0);

                return (
                  <td
                    key={s.id}
                    style={{
                      padding: "8px 8px",
                      textAlign: "right",
                      fontWeight: 800,
                      fontSize: 13,
                      color: C.text,
                      borderLeft: `1px solid ${C.border}`,
                      borderTop: `3px solid ${C.green}`,
                      fontFamily: T.font.sans,
                      fontFeatureSettings: "'tnum'",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                      <span>{fmt(subGrandTotal)}</span>
                      <VarianceBadge subTotal={subGrandTotal} internalTotal={internalGrandTotal} C={C} fontSize={9} />
                    </div>
                  </td>
                );
              })}
              <td style={{ borderTop: `3px solid ${C.green}` }} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* ─── Cell Context Menu (rendered at root level) ─── */}
      {cellMenu && (
        <CellContextMenu
          pos={{ x: cellMenu.x, y: cellMenu.y }}
          item={cellMenu.item}
          currentStatus={getCell(cellMenu.itemId, cellMenu.subId).status}
          getItemTotal={getItemTotal}
          onSelect={newStatus => {
            if (newStatus === "blank") {
              saveCellWithStatus(cellMenu.itemId, cellMenu.subId, "blank", "");
            } else if (newStatus === "carried") {
              saveCellWithStatus(cellMenu.itemId, cellMenu.subId, "carried", "");
            } else {
              // For lumpsum/unitrate, keep existing value but change status
              const existing = getCell(cellMenu.itemId, cellMenu.subId);
              saveCellWithStatus(cellMenu.itemId, cellMenu.subId, newStatus, existing.value);
            }
            setCellMenu(null);
          }}
          onClose={() => setCellMenu(null)}
          C={C}
        />
      )}
    </div>
  );
}

/* ─── Subdivision group (header + items + subtotal) ─── */
function SubdivisionGroup({
  sub,
  subIdx,
  subs,
  allSubs,
  sel,
  isCollapsed,
  C,
  T,
  _subColWidth,
  getCell,
  _getCellComputedValue,
  saveCell,
  _saveCellWithStatus,
  setCellMenu,
  getHighlight,
  getItemTotal,
  getSubLabel,
  getSkSubTotal,
  getSelectedBidValue,
  setBidSelection,
  _setBidTotals,
  _bidTotals,
  autoCarry,
  onToggle,
  onAddSub,
  addSubSk,
  newSubName,
  setNewSubName,
  newSubRef,
  onConfirmAddSub,
  onCancelAddSub,
  skLinked,
  _linkedSubs,
}) {
  const selVal = getSelectedBidValue(sub.sk);
  const totalCols = 6 + allSubs.length + 1; // fixed + internal + subs + add btn

  return (
    <>
      {/* ─── Subdivision header row ─── */}
      <tr
        onClick={onToggle}
        style={{
          background: sel.source ? `${C.green}06` : C.bg2,
          cursor: "pointer",
        }}
      >
        <td
          colSpan={5}
          style={{
            padding: "6px 10px",
            fontWeight: 700,
            fontSize: 12,
            color: C.text,
            borderBottom: `1px solid ${C.border}`,
            borderTop: subIdx > 0 ? `2px solid ${C.border}` : `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.textMuted}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {getSubLabel(sub.sk)}
            <span style={{ fontSize: 9, color: C.textDim, fontWeight: 500 }}>({sub.items.length} items)</span>
          </div>
        </td>
        <td
          style={{
            padding: "6px 8px",
            textAlign: "right",
            fontWeight: 700,
            fontSize: 11,
            color: C.accent,
            borderBottom: `1px solid ${C.border}`,
            borderLeft: `2px solid ${C.accent}30`,
            borderTop: subIdx > 0 ? `2px solid ${C.border}` : `1px solid ${C.border}`,
            fontFamily: T.font.sans,
            fontFeatureSettings: "'tnum'",
          }}
        >
          {fmt(sub.total)}
        </td>
        {allSubs.map(s => {
          const isSk = subs.some(ss => ss.id === s.id);
          const subTotal = isSk ? getSkSubTotal(sub.sk, s.id) : 0;
          const isSelected = sel.source === s.id;
          return (
            <td
              key={s.id}
              style={{
                padding: "6px 8px",
                textAlign: "right",
                fontWeight: 700,
                fontSize: 11,
                color: isSelected ? C.green : isSk ? C.text : C.textDim,
                borderBottom: `1px solid ${C.border}`,
                borderLeft: isSelected ? `2px solid ${C.green}` : `1px solid ${C.border}`,
                borderTop: subIdx > 0 ? `2px solid ${C.border}` : `1px solid ${C.border}`,
                fontFamily: T.font.sans,
                fontFeatureSettings: "'tnum'",
                background: isSelected ? `${C.green}08` : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                  <span>{isSk ? fmt(subTotal) : "—"}</span>
                  {isSk && <VarianceBadge subTotal={subTotal} internalTotal={sub.total} C={C} />}
                </div>
                {/* Auto-carry button */}
                {isSk && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      autoCarry(sub.sk, s.id);
                    }}
                    title={`Auto-carry all ${sub.items.length} items from internal`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      flexShrink: 0,
                      border: `1px solid ${C.accent}25`,
                      background: "transparent",
                      cursor: "pointer",
                      padding: 0,
                      opacity: 0.45,
                      transition: "opacity 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "0.45")}
                  >
                    <Ic d={I.layers} size={8} color={C.accent} sw={2} />
                  </button>
                )}
              </div>
            </td>
          );
        })}
        <td
          style={{
            padding: "6px 4px",
            textAlign: "center",
            borderBottom: `1px solid ${C.border}`,
            borderTop: subIdx > 0 ? `2px solid ${C.border}` : `1px solid ${C.border}`,
          }}
        >
          <button
            onClick={e => {
              e.stopPropagation();
              onAddSub();
            }}
            title="Add subcontractor to this trade"
            style={{
              width: 22,
              height: 22,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ic d={I.plus} size={10} color={C.accent} sw={2} />
          </button>
        </td>
      </tr>

      {/* Add sub inline form — CRM-backed autocomplete */}
      {addSubSk === sub.sk && (
        <tr>
          <td
            colSpan={totalCols}
            style={{ padding: "4px 10px", borderBottom: `1px solid ${C.border}`, background: `${C.accent}06` }}
          >
            <SubAutocomplete
              newSubName={newSubName}
              setNewSubName={setNewSubName}
              newSubRef={newSubRef}
              onSelect={name => {
                onConfirmAddSub(name);
              }}
              onCancel={onCancelAddSub}
              C={C}
            />
          </td>
        </tr>
      )}

      {/* ─── Item rows (hidden when collapsed) ─── */}
      {!isCollapsed &&
        sub.items.map((item, rowIdx) => {
          return (
            <tr key={item.id} style={{ background: rowIdx % 2 === 0 ? "transparent" : `${C.text}03` }}>
              <td style={{ ...tdStyle(C), textAlign: "center", color: C.textDim, fontSize: 9 }}>{rowIdx + 1}</td>
              <td style={{ ...tdStyle(C), fontSize: 10, color: C.textMuted, fontWeight: 600 }}>{item.code || "—"}</td>
              <td style={{ ...tdStyle(C), fontSize: 11, color: C.text, fontWeight: 500 }}>
                <div
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}
                  title={item.description}
                >
                  {item.description || "Untitled"}
                </div>
              </td>
              <td
                style={{
                  ...tdStyle(C),
                  textAlign: "right",
                  fontFamily: T.font.sans,
                  fontFeatureSettings: "'tnum'",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {nn(item.quantity) || "—"}
              </td>
              <td style={{ ...tdStyle(C), textAlign: "center", fontSize: 9, color: C.textDim }}>{item.unit || "—"}</td>
              <td
                style={{
                  ...tdStyle(C),
                  textAlign: "right",
                  fontFamily: T.font.sans,
                  fontFeatureSettings: "'tnum'",
                  color: C.accent,
                  fontWeight: 600,
                  borderLeft: `2px solid ${C.accent}30`,
                  fontSize: 10,
                }}
              >
                {fmt(getItemTotal ? getItemTotal(item) : 0)}
              </td>
              {allSubs.map(s => {
                const isSk = subs.some(ss => ss.id === s.id);
                if (!isSk) {
                  return (
                    <td
                      key={s.id}
                      style={{
                        ...tdStyle(C),
                        textAlign: "center",
                        color: `${C.textDim}60`,
                        fontSize: 9,
                        borderLeft: `1px solid ${C.border}`,
                      }}
                    >
                      ·
                    </td>
                  );
                }
                const cell = getCell(item.id, s.id);
                const highlight = getHighlight(item, s.id, sub.sk);
                const isSelected = sel.source === s.id;
                return (
                  <td
                    key={s.id}
                    style={{
                      ...tdStyle(C),
                      padding: "1px 2px",
                      borderLeft: isSelected ? `2px solid ${C.green}` : `1px solid ${C.border}`,
                      background: isSelected ? `${C.green}04` : undefined,
                    }}
                  >
                    <BidCell
                      value={cell.value}
                      status={cell.status}
                      item={item}
                      onSave={val => saveCell(item.id, s.id, val)}
                      onContextMenu={e =>
                        setCellMenu({
                          x: e.clientX,
                          y: e.clientY,
                          itemId: item.id,
                          subId: s.id,
                          item,
                        })
                      }
                      getItemTotal={getItemTotal}
                      highlight={highlight}
                      C={C}
                      T={T}
                    />
                  </td>
                );
              })}
              <td style={{ ...tdStyle(C), width: 36 }} />
            </tr>
          );
        })}

      {/* ─── Selection / subtotal row ─── */}
      <tr style={{ background: sel.source ? `${C.green}08` : C.bg2 }}>
        <td
          colSpan={5}
          style={{
            padding: "5px 10px",
            borderBottom: `2px solid ${sel.source ? C.green : C.border}`,
            fontSize: 10,
            fontWeight: 700,
            color: sel.source ? C.green : C.textMuted,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Ic d={I.check} size={12} color={sel.source ? C.green : C.textDim} />
            <select
              value={sel.source}
              onChange={e => {
                e.stopPropagation();
                setBidSelection(sub.sk, { source: e.target.value });
              }}
              onClick={e => e.stopPropagation()}
              style={{
                padding: "3px 6px",
                fontSize: 10,
                fontWeight: 600,
                border: `1px solid ${sel.source ? C.green + "60" : C.border}`,
                borderRadius: 4,
                background: C.bg,
                color: sel.source ? C.green : C.textMuted,
                cursor: "pointer",
                outline: "none",
                fontFamily: T.font.sans,
              }}
            >
              <option value="">Select winner...</option>
              <option value="internal">Internal ({fmt(sub.total)})</option>
              {subs.map(s => {
                const st = getSkSubTotal(sub.sk, s.id);
                return (
                  <option key={s.id} value={s.id}>
                    {s.name || "Unnamed"} ({st > 0 ? fmt(st) : "—"})
                  </option>
                );
              })}
              {skLinked.map(ls => (
                <option key={ls.id} value={`linked_${ls.id}`}>
                  {ls.name || "Linked"} ({fmt(nn(ls.totalBid))})
                </option>
              ))}
              <option value="custom">Custom...</option>
            </select>
            {sel.source === "custom" && (
              <input
                type="number"
                value={sel.customValue || ""}
                onChange={e => setBidSelection(sub.sk, { customValue: e.target.value })}
                onClick={e => e.stopPropagation()}
                placeholder="$0"
                style={{
                  width: 80,
                  padding: "3px 6px",
                  fontSize: 11,
                  fontWeight: 700,
                  border: `1px solid ${C.green}`,
                  borderRadius: 4,
                  background: C.bg,
                  color: C.green,
                  textAlign: "right",
                  outline: "none",
                  fontFamily: T.font.sans,
                }}
              />
            )}
            {sel.source && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.green,
                  fontFamily: T.font.sans,
                  fontFeatureSettings: "'tnum'",
                }}
              >
                → {fmt(selVal)}
              </span>
            )}
          </div>
        </td>
        <td
          style={{
            padding: "5px 8px",
            textAlign: "right",
            fontWeight: 700,
            fontSize: 11,
            borderBottom: `2px solid ${sel.source ? C.green : C.border}`,
            borderLeft: `2px solid ${C.accent}30`,
            color: sel.source === "internal" ? C.green : C.accent,
            fontFamily: T.font.sans,
            fontFeatureSettings: "'tnum'",
            background: sel.source === "internal" ? `${C.green}12` : undefined,
          }}
        >
          {fmt(sub.total)}
        </td>
        {allSubs.map(s => {
          const isSk = subs.some(ss => ss.id === s.id);
          const subTotal = isSk ? getSkSubTotal(sub.sk, s.id) : 0;
          const isSelected = sel.source === s.id;
          return (
            <td
              key={s.id}
              style={{
                padding: "5px 8px",
                textAlign: "right",
                fontWeight: 700,
                fontSize: 11,
                borderBottom: `2px solid ${sel.source ? C.green : C.border}`,
                borderLeft: isSelected ? `2px solid ${C.green}` : `1px solid ${C.border}`,
                color: isSelected ? C.green : isSk ? C.text : C.textDim,
                fontFamily: T.font.sans,
                fontFeatureSettings: "'tnum'",
                background: isSelected ? `${C.green}12` : undefined,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                <span>{isSk ? fmt(subTotal) : "—"}</span>
                {isSk && <VarianceBadge subTotal={subTotal} internalTotal={sub.total} C={C} />}
              </div>
            </td>
          );
        })}
        <td style={{ borderBottom: `2px solid ${sel.source ? C.green : C.border}` }} />
      </tr>
    </>
  );
}

/* ─── Style helpers ─── */
function thStyle(C) {
  return {
    padding: "6px 8px",
    fontSize: 9,
    fontWeight: 700,
    color: C.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: `2px solid ${C.border}`,
    position: "sticky",
    top: 0,
    background: C.bg,
    zIndex: 10,
    whiteSpace: "nowrap",
    fontFamily: C.T.font.sans,
  };
}

function tdStyle(C) {
  return {
    padding: "3px 8px",
    borderBottom: `1px solid ${C.border}40`,
    verticalAlign: "middle",
  };
}
