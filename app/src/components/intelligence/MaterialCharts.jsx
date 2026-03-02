// MaterialCharts — Full commodity price charts + Construction Activity
import { useTheme } from '@/hooks/useTheme';
import { useIntelligenceStore } from '@/stores/intelligenceStore';
import { useUiStore } from '@/stores/uiStore';
import { FRED_SERIES, computeDeltas } from '@/constants/fredSeries';
import { BarChart } from './PureCSSChart';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

function ChartCard({ seriesKey, data, series }) {
  const C = useTheme();
  const T = C.T;
  const colorMap = { yellow: C.yellow, blue: C.blue, accent: C.accent, green: C.green, orange: C.orange, purple: C.purple };
  const color = colorMap[series.color] || C.accent;
  const { mom, yoy, current, currentDate } = computeDeltas(data);

  // Prepare chart data — last 36 months for readability
  const chartData = data.slice(-36).map(d => {
    const month = d.date.split("-").slice(1, 2)[0];
    const year = d.date.split("-")[0].slice(-2);
    return { label: `${month}/${year}`, value: d.value, color };
  });

  return (
    <div style={{
      padding: "12px 14px", borderRadius: T.radius.md,
      background: C.glassBg || 'rgba(18,21,28,0.55)',
      backdropFilter: T.glass.blur, WebkitBackdropFilter: T.glass.blur,
      border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {series.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: "'DM Sans',sans-serif" }}>
              {series.unit === '$M' ? `$${Math.round(current).toLocaleString()}M` : current?.toFixed(1)}
            </span>
            <span style={{ fontSize: 9, color: C.textDim }}>{series.unit}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {mom !== null && (
            <div style={{
              padding: "3px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
              fontFamily: "'DM Sans',sans-serif",
              background: `${mom >= 0 ? C.green : C.red}15`,
              color: mom >= 0 ? C.green : C.red,
            }}>
              MoM {mom >= 0 ? "+" : ""}{mom}%
            </div>
          )}
          {yoy !== null && (
            <div style={{
              padding: "3px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
              fontFamily: "'DM Sans',sans-serif",
              background: `${yoy >= 0 ? C.green : C.red}15`,
              color: yoy >= 0 ? C.green : C.red,
            }}>
              YoY {yoy >= 0 ? "+" : ""}{yoy}%
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <BarChart
        data={chartData}
        height={70}
        showLabels={false}
        barColor={color}
        animate={true}
      />

      {/* Date range */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 7, color: C.textDim }}>{data[data.length - 36]?.date || data[0]?.date}</span>
        <span style={{ fontSize: 7, color: C.textDim }}>{currentDate}</span>
      </div>
    </div>
  );
}

export default function MaterialCharts() {
  const C = useTheme();
  const T = C.T;
  const fredData = useIntelligenceStore(s => s.fredData);
  const fetchFredData = useIntelligenceStore(s => s.fetchFredData);
  const fredApiKey = useUiStore(s => s.appSettings.fredApiKey);

  const hasFredData = Object.entries(FRED_SERIES).some(([key]) =>
    fredData[key] && fredData[key].length > 0
  );

  if (!fredApiKey) {
    return (
      <div style={{
        padding: "30px 20px", borderRadius: T.radius.md,
        border: `1px dashed ${C.accent}40`, textAlign: "center",
        background: `${C.accent}05`,
      }}>
        <Ic d={I.intelligence} size={32} color={C.accent} />
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 10 }}>
          Connect to Market Data
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, maxWidth: 380, margin: "6px auto 0" }}>
          Add your free FRED API key in Settings to see live material prices, construction spending, and housing starts.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
          <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noopener"
            style={{
              padding: "6px 12px", borderRadius: 5, fontSize: 10, fontWeight: 600,
              background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent,
              textDecoration: "none", cursor: "pointer",
            }}>
            Get Free Key
          </a>
        </div>
      </div>
    );
  }

  if (fredData.loading) {
    return (
      <div style={{ padding: 30, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: C.textDim }}>Loading market data...</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {Object.entries(FRED_SERIES).map(([key, series]) => {
        const data = fredData[key];
        if (!data || data.length < 2) return null;
        return <ChartCard key={key} seriesKey={key} data={data} series={series} />;
      })}
    </div>
  );
}
