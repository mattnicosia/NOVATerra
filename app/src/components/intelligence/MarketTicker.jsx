// MarketTicker — Scrolling horizontal ticker strip showing material price deltas
import { useTheme } from '@/hooks/useTheme';
import { useIntelligenceStore } from '@/stores/intelligenceStore';
import { FRED_SERIES, MATERIAL_SERIES, computeDeltas } from '@/constants/fredSeries';
import {
  getCompositeIndex, getYoYChange, getAllDivisionIndices, getCurrentYear,
} from '@/constants/constructionCostIndex';

export default function MarketTicker() {
  const C = useTheme();
  const fredData = useIntelligenceStore(s => s.fredData);
  const currentYear = getCurrentYear();

  // Build ticker items from FRED data + internal data
  const items = [];

  // Internal: Construction Cost Index
  const compositeYoY = getYoYChange(currentYear);
  items.push({
    label: "Cost Index",
    value: getCompositeIndex(currentYear).toFixed(1),
    delta: compositeYoY,
    color: C.accent,
  });

  // Internal: hottest division
  const divs = getAllDivisionIndices(currentYear);
  if (divs.length > 0) {
    const hottest = divs.reduce((a, b) => a.yoy > b.yoy ? a : b);
    const divLabel = {
      concrete: "Concrete", metals: "Steel", wood: "Lumber", thermal: "Roofing",
      openings: "Openings", finishes: "Finishes", mechanical: "Mech/Plumb",
      electrical: "Electrical", sitework: "Sitework", general: "Labor",
    }[hottest.category] || hottest.category;
    items.push({
      label: divLabel,
      value: hottest.index.toFixed(1),
      delta: hottest.yoy,
      color: C.orange,
    });
  }

  // FRED series
  Object.entries(FRED_SERIES).forEach(([key, series]) => {
    const obs = fredData[key];
    if (!obs || obs.length < 2) return;
    const { mom, current } = computeDeltas(obs);
    if (mom === null) return;
    const colorMap = { yellow: C.yellow, blue: C.blue, accent: C.accent, green: C.green, orange: C.orange, purple: C.purple };
    items.push({
      label: series.label.split(" ")[0], // Short label
      value: series.unit === '$M' ? `$${Math.round(current / 1000)}B` : current.toFixed(1),
      delta: mom,
      color: colorMap[series.color] || C.accent,
    });
  });

  if (items.length === 0) return null;

  // Duplicate items for seamless scroll
  const allItems = [...items, ...items];

  return (
    <div style={{
      overflow: "hidden", position: "relative",
      background: `${C.bg2}80`,
      borderBottom: `1px solid ${C.border}`,
      padding: "6px 0",
    }}>
      <div style={{
        display: "flex", gap: 28, whiteSpace: "nowrap",
        animation: `tickerScroll ${items.length * 4}s linear infinite`,
      }}>
        {allItems.map((item, i) => {
          const isUp = item.delta > 0;
          const deltaColor = isUp ? C.green : item.delta < 0 ? C.red : C.textDim;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: item.color, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {item.label}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: "'DM Mono',monospace" }}>
                {item.value}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, color: deltaColor, fontFamily: "'DM Mono',monospace" }}>
                {isUp ? "\u25B2" : item.delta < 0 ? "\u25BC" : "\u25CF"}{" "}
                {Math.abs(item.delta)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes kpiPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0.15); }
          50% { box-shadow: 0 0 0 6px rgba(139,92,246,0); }
        }
      `}</style>
    </div>
  );
}
