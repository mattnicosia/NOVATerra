// CoreCostData — Cost data management tab
// Shows user-created cost database elements + import modals

import { useMemo, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useDatabaseStore } from '@/stores/databaseStore';
import { useUiStore } from '@/stores/uiStore';
import CsvImportModal from '@/components/import/CsvImportModal';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { TRADE_GROUPINGS } from '@/constants/tradeGroupings';

const nn = (n) => typeof n === 'number' ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

export default function CoreCostData() {
  const C = useTheme();
  const T = C.T;
  const showToast = useUiStore(s => s.showToast);
  const elements = useDatabaseStore(s => s.elements);
  const assemblies = useDatabaseStore(s => s.assemblies);

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [expandedTrade, setExpandedTrade] = useState(null);

  // User-created elements only (not seeds)
  const userElements = useMemo(() =>
    elements.filter(e => !e.id?.startsWith('s')),
  [elements]);

  // Group by trade
  const groupedByTrade = useMemo(() => {
    const groups = {};
    userElements.forEach(el => {
      const trade = el.trade || 'uncategorized';
      if (!groups[trade]) groups[trade] = [];
      groups[trade].push(el);
    });
    // Sort by trade name
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [userElements]);

  const tradeLabel = (key) => {
    const t = TRADE_GROUPINGS?.find(tg => tg.key === key);
    return t ? t.label : key.charAt(0).toUpperCase() + key.slice(1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", gap: 20 }}>
          <div>
            <span style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
              {userElements.length}
            </span>
            <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6 }}>user elements</span>
          </div>
          <div>
            <span style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
              {assemblies.length}
            </span>
            <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6 }}>assemblies</span>
          </div>
          <div>
            <span style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
              {groupedByTrade.length}
            </span>
            <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6 }}>trades</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowCsvModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: T.radius.md,
              background: C.bg2, border: `1px solid ${C.border}`,
              cursor: "pointer", color: C.text,
              fontSize: 11.5, fontWeight: 500, transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent + '50'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
          >
            <Ic d={I.layers} size={13} color={C.textMuted} />
            Import CSV / Excel
          </button>
        </div>
      </div>

      {/* Context banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", borderRadius: T.radius.md,
        background: `linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(59,130,246,0.02) 100%)`,
        border: `1px solid rgba(59,130,246,0.12)`,
      }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d={I.database} />
        </svg>
        <span style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>
          User-created cost items and imports are auto-embedded into NOVA's intelligence. Items from the seed database are not shown here.
        </span>
      </div>

      {/* Grouped elements */}
      {groupedByTrade.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {groupedByTrade.map(([trade, items]) => (
            <div key={trade} style={{
              borderRadius: T.radius.md,
              border: `1px solid ${C.border}`,
              overflow: "hidden",
            }}>
              {/* Trade header */}
              <button
                onClick={() => setExpandedTrade(expandedTrade === trade ? null : trade)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 16px", border: "none", cursor: "pointer",
                  background: expandedTrade === trade ? `${C.accent}08` : C.bg2,
                  color: C.text, transition: "background 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round"
                    style={{ transform: expandedTrade === trade ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{tradeLabel(trade)}</span>
                </div>
                <span style={{ fontSize: 11, color: C.textDim, fontFamily: "'DM Sans', sans-serif" }}>
                  {items.length} item{items.length !== 1 ? 's' : ''}
                </span>
              </button>

              {/* Items list */}
              {expandedTrade === trade && (
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {/* Header row */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "80px 1fr 60px 80px 80px 80px",
                    padding: "6px 16px", gap: 8,
                    fontSize: 9, fontWeight: 600, color: C.textDim,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                  }}>
                    <span>Code</span>
                    <span>Description</span>
                    <span>Unit</span>
                    <span style={{ textAlign: "right" }}>Material</span>
                    <span style={{ textAlign: "right" }}>Labor</span>
                    <span style={{ textAlign: "right" }}>Total</span>
                  </div>
                  {items.map(el => (
                    <div key={el.id} style={{
                      display: "grid", gridTemplateColumns: "80px 1fr 60px 80px 80px 80px",
                      padding: "7px 16px", gap: 8,
                      fontSize: 11.5, color: C.text,
                      borderTop: `1px solid ${C.border}08`,
                    }}>
                      <span style={{ color: C.textMuted, fontFamily: "'DM Sans', sans-serif", fontSize: 10.5 }}>{el.code || "—"}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{el.name || "Untitled"}</span>
                      <span style={{ color: C.textDim, fontSize: 10.5 }}>{el.unit || "—"}</span>
                      <span style={{ textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontSize: 10.5 }}>${nn(el.material)}</span>
                      <span style={{ textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontSize: 10.5 }}>${nn(el.labor)}</span>
                      <span style={{ textAlign: "right", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", fontSize: 10.5 }}>
                        ${nn((el.material || 0) + (el.labor || 0) + (el.equipment || 0))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: "40px 24px", borderRadius: T.radius.lg,
          background: C.bg2, border: `1px dashed ${C.border}`,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: "0 0 6px" }}>
            No user cost data yet
          </h3>
          <p style={{ fontSize: 11.5, color: C.textMuted, margin: "0 0 14px" }}>
            Import CSV files or add items from the Cost Database to build your custom cost data.
          </p>
          <button
            onClick={() => setShowCsvModal(true)}
            style={{
              padding: "8px 18px", borderRadius: T.radius.md,
              background: C.accent, border: "none", cursor: "pointer",
              color: "#fff", fontSize: 12, fontWeight: 600,
            }}
          >
            Import CSV / Excel
          </button>
        </div>
      )}

      {/* Modals */}
      {showCsvModal && <CsvImportModal onClose={() => setShowCsvModal(false)} />}
    </div>
  );
}
