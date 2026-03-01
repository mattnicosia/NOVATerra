// PortfolioIntelligence — User's win rate, pipeline, clients, calibration health
import { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useScanStore } from '@/stores/scanStore';
import { getBuildingTypeLabel } from '@/constants/constructionTypes';
import { mapStatusToOutcome } from '@/utils/costHistoryMigration';
import { Ring, GradientBar } from './PureCSSChart';

const fmtCost = (n) => {
  if (!n && n !== 0) return "\u2014";
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  return "$" + Math.round(n).toLocaleString();
};

export default function PortfolioIntelligence() {
  const C = useTheme();
  const T = C.T;
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const historicalProposals = useMasterDataStore(s => s.masterData.historicalProposals || []);
  const learningRecords = useScanStore(s => s.learningRecords);
  const calibrationFactors = useScanStore.getState().getCalibrationFactors();

  const stats = useMemo(() => {
    // Unified entries
    const all = [
      ...estimatesIndex.map(e => ({
        ...e, outcome: mapStatusToOutcome(e.status),
        totalCost: e.grandTotal || 0, projectSF: e.projectSF || 0,
      })),
      ...historicalProposals.map(p => ({
        ...p, outcome: p.outcome || "pending",
        totalCost: p.totalCost || 0, projectSF: p.projectSF || 0,
      })),
    ];

    const won = all.filter(e => e.outcome === "won");
    const lost = all.filter(e => e.outcome === "lost");
    const pending = all.filter(e => e.outcome === "pending");
    const decided = won.length + lost.length;
    const winRate = decided > 0 ? Math.round((won.length / decided) * 100) : null;

    // Win rate by building type
    const winByType = {};
    all.forEach(e => {
      if (!e.buildingType || (e.outcome !== "won" && e.outcome !== "lost")) return;
      if (!winByType[e.buildingType]) winByType[e.buildingType] = { won: 0, total: 0 };
      winByType[e.buildingType].total += 1;
      if (e.outcome === "won") winByType[e.buildingType].won += 1;
    });
    const winRateByType = Object.entries(winByType)
      .map(([key, { won: w, total: t }]) => ({
        key, label: getBuildingTypeLabel(key), rate: Math.round((w / t) * 100), won: w, total: t,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    // $/SF by building type
    const perSFByType = {};
    all.filter(e => e.totalCost > 0 && e.projectSF > 0).forEach(e => {
      if (!e.buildingType) return;
      if (!perSFByType[e.buildingType]) perSFByType[e.buildingType] = { total: 0, count: 0 };
      perSFByType[e.buildingType].total += e.totalCost / e.projectSF;
      perSFByType[e.buildingType].count += 1;
    });
    const avgPerSFByType = Object.entries(perSFByType)
      .map(([key, { total, count }]) => ({ key, label: getBuildingTypeLabel(key), avg: Math.round(total / count), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Top clients
    const clientMap = {};
    all.forEach(e => {
      const name = e.client;
      if (!name) return;
      if (!clientMap[name]) clientMap[name] = { count: 0, totalValue: 0, won: 0, lost: 0 };
      clientMap[name].count += 1;
      clientMap[name].totalValue += e.totalCost || 0;
      if (e.outcome === "won") clientMap[name].won += 1;
      if (e.outcome === "lost") clientMap[name].lost += 1;
    });
    const topClients = Object.entries(clientMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 6);

    // Pipeline
    const pipelineValue = pending.reduce((s, e) => s + (e.totalCost || 0), 0);

    // Calibration health
    const calFactors = Object.values(calibrationFactors);
    const avgDeviation = calFactors.length > 0
      ? Math.round(calFactors.reduce((s, f) => s + Math.abs(f - 1), 0) / calFactors.length * 100)
      : null;

    return {
      total: all.length, wonCount: won.length, lostCount: lost.length,
      pendingCount: pending.length, winRate, pipelineValue,
      winRateByType, avgPerSFByType, topClients,
      calCount: calFactors.length, avgDeviation, recordCount: learningRecords.length,
    };
  }, [estimatesIndex, historicalProposals, learningRecords, calibrationFactors]);

  if (stats.total === 0) {
    return (
      <div style={{ padding: 30, textAlign: "center", border: `1px dashed ${C.border}`, borderRadius: 10 }}>
        <div style={{ fontSize: 12, color: C.textDim }}>Portfolio analytics will appear as you build estimates and track outcomes.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 14 }}>
      {/* Win/Loss Ring */}
      <div style={{
        padding: "14px 16px", borderRadius: T.radius.md,
        background: C.glassBg || 'rgba(18,21,28,0.55)',
        backdropFilter: T.glass.blur, WebkitBackdropFilter: T.glass.blur,
        border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
          Outcomes
        </div>
        <Ring
          segments={[
            { value: stats.wonCount, color: C.green, label: "Won" },
            { value: stats.lostCount, color: C.red, label: "Lost" },
            { value: stats.pendingCount, color: C.blue, label: "Pending" },
          ]}
          size={90}
          thickness={10}
          centerValue={stats.winRate !== null ? `${stats.winRate}%` : "\u2014"}
          centerLabel="Win Rate"
        />
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          {[
            { label: "Won", count: stats.wonCount, color: C.green },
            { label: "Lost", count: stats.lostCount, color: C.red },
            { label: "Pending", count: stats.pendingCount, color: C.blue },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9 }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: s.color }} />
              <span style={{ color: C.textDim }}>{s.label}</span>
              <span style={{ fontWeight: 700, color: C.text }}>{s.count}</span>
            </div>
          ))}
        </div>
        {stats.pipelineValue > 0 && (
          <div style={{ fontSize: 10, color: C.blue, fontWeight: 600, marginTop: 8 }}>
            Pipeline: {fmtCost(stats.pipelineValue)}
          </div>
        )}
      </div>

      {/* Win rate by type + $/SF by type */}
      <div style={{
        padding: "14px 16px", borderRadius: T.radius.md,
        background: C.glassBg || 'rgba(18,21,28,0.55)',
        backdropFilter: T.glass.blur, WebkitBackdropFilter: T.glass.blur,
        border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          Win Rate by Type
        </div>
        {stats.winRateByType.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {stats.winRateByType.map(t => (
              <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 9, color: C.textDim, width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                <GradientBar pct={t.rate} color={t.rate >= 50 ? C.green : C.orange} />
                <span style={{ fontSize: 10, fontWeight: 700, color: t.rate >= 50 ? C.green : C.orange, fontFamily: "'DM Mono',monospace", minWidth: 28, textAlign: "right" }}>{t.rate}%</span>
                <span style={{ fontSize: 8, color: C.textDim }}>({t.won}/{t.total})</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: C.textDim }}>Track outcomes to see win rates.</div>
        )}
      </div>

      {/* Top Clients */}
      <div style={{
        padding: "14px 16px", borderRadius: T.radius.md,
        background: C.glassBg || 'rgba(18,21,28,0.55)',
        backdropFilter: T.glass.blur, WebkitBackdropFilter: T.glass.blur,
        border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          Top Clients by Volume
        </div>
        {stats.topClients.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {stats.topClients.map(cl => {
              const maxVal = Math.max(...stats.topClients.map(x => x.totalValue));
              const wr = (cl.won + cl.lost) > 0 ? Math.round((cl.won / (cl.won + cl.lost)) * 100) : null;
              return (
                <div key={cl.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: C.textDim, width: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cl.name}</span>
                  <GradientBar pct={maxVal > 0 ? (cl.totalValue / maxVal) * 100 : 0} color={C.blue} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: C.text, fontFamily: "'DM Mono',monospace", minWidth: 45, textAlign: "right" }}>{fmtCost(cl.totalValue)}</span>
                  {wr !== null && <span style={{ fontSize: 8, color: wr >= 50 ? C.green : C.orange, fontWeight: 600 }}>{wr}%</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: C.textDim }}>Add clients to your projects to see analytics.</div>
        )}
      </div>
    </div>
  );
}
