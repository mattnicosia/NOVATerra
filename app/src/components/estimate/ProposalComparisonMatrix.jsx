import { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import Modal from '@/components/shared/Modal';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { analyzeGaps, normalizeCSI } from '@/utils/scopeGapEngine';
import { CSI } from '@/constants/csi';

const fmt = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);

export default function ProposalComparisonMatrix({ bidPackage, proposals, estimateItems, onClose }) {
  const C = useTheme();

  // Build comparison data
  const matrix = useMemo(() => {
    if (!proposals || proposals.length === 0 || !estimateItems?.length) return null;

    // Get all divisions from estimate items
    const estimateDivisions = {};
    let estimateGrandTotal = 0;
    for (const item of estimateItems.filter(i => !i.bidContext || i.bidContext === 'base')) {
      const div = normalizeCSI(item.code) || normalizeCSI(item.division) || '00';
      if (!estimateDivisions[div]) {
        estimateDivisions[div] = { items: [], total: 0 };
      }
      const qty = Number(item.quantity) || 0;
      const m = Number(item.material) || 0;
      const l = Number(item.labor) || 0;
      const e = Number(item.equipment) || 0;
      const sub = Number(item.subcontractor) || 0;
      const itemTotal = qty * (m + l + e + sub);
      estimateDivisions[div].items.push(item);
      estimateDivisions[div].total += itemTotal;
      estimateGrandTotal += itemTotal;
    }

    const divisions = Object.keys(estimateDivisions).sort();

    // Analyze each proposal
    const subColumns = proposals.map(p => {
      const pd = p.parsedData || {};
      const report = analyzeGaps(estimateItems, pd);
      const missingDivs = new Set(report.missingFromProposal.map(m => m.division));
      const matchedDivs = new Set(report.matched.map(m => m.division));

      // Build division-level coverage map
      const divCoverage = {};
      for (const div of divisions) {
        if (missingDivs.has(div)) {
          divCoverage[div] = 'missing';
        } else if (matchedDivs.has(div)) {
          const hasQtyMismatch = report.quantityMismatches.some(q => q.division === div);
          divCoverage[div] = hasQtyMismatch ? 'mismatch' : 'covered';
        } else {
          divCoverage[div] = 'none';
        }
      }

      const totalBid = pd.totalBid || 0;
      const totalExposure = report.totalExposure;
      const adjustedCost = totalBid + totalExposure;

      return {
        name: pd.subcontractorName || p.subCompany || 'Unknown',
        totalBid,
        coverageScore: report.coverageScore,
        exclusionCount: report.exclusionConflicts.length,
        totalExposure,
        adjustedCost,
        divCoverage,
      };
    });

    // Determine NOVA Recommends — lowest adjusted cost among subs with >=60% coverage
    let recommendedIdx = -1;
    let bestAdjusted = Infinity;
    for (let i = 0; i < subColumns.length; i++) {
      const sub = subColumns[i];
      if (sub.totalBid > 0 && sub.coverageScore >= 60 && sub.adjustedCost < bestAdjusted) {
        bestAdjusted = sub.adjustedCost;
        recommendedIdx = i;
      }
    }

    return { divisions, estimateDivisions, estimateGrandTotal, subColumns, recommendedIdx };
  }, [proposals, estimateItems]);

  if (!matrix) {
    return (
      <Modal onClose={onClose} extraWide>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: C.textMuted, fontSize: 13 }}>
          Need at least one parsed proposal and estimate items to compare.
        </div>
      </Modal>
    );
  }

  const { divisions, estimateDivisions, estimateGrandTotal, subColumns, recommendedIdx } = matrix;
  const cellColors = {
    covered: { bg: 'rgba(48,209,88,0.12)', border: 'rgba(48,209,88,0.25)', text: '#30D158' },
    mismatch: { bg: 'rgba(255,159,10,0.12)', border: 'rgba(255,159,10,0.25)', text: '#FF9F0A' },
    missing: { bg: 'rgba(255,69,58,0.10)', border: 'rgba(255,69,58,0.20)', text: '#FF453A' },
    none: { bg: 'transparent', border: `${C.border}40`, text: C.textDim },
  };

  return (
    <Modal onClose={onClose} extraWide>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(124,92,252,0.2), rgba(191,90,242,0.1))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Ic d={I.report} size={18} color={C.accent} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: 0 }}>
            Proposal Comparison
          </h3>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
            {bidPackage?.name || 'Bid Package'} — {subColumns.length} proposal{subColumns.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, color: C.textMuted }}>
        {[
          { label: 'Covered', color: '#30D158' },
          { label: 'Qty Mismatch', color: '#FF9F0A' },
          { label: 'Missing', color: '#FF453A' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: `${l.color}30`, border: `1px solid ${l.color}50` }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Matrix Grid */}
      <div style={{ maxHeight: 480, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{
                ...headerStyle(C), textAlign: 'left', minWidth: 160,
                position: 'sticky', top: 0, background: C.bg || '#1C1C1E', zIndex: 2,
              }}>
                Division
              </th>
              <th style={{
                ...headerStyle(C), minWidth: 80,
                position: 'sticky', top: 0, background: C.bg || '#1C1C1E', zIndex: 2,
              }}>
                Est Total
              </th>
              {subColumns.map((sub, i) => (
                <th key={i} style={{
                  ...headerStyle(C), minWidth: 120,
                  position: 'sticky', top: 0, background: C.bg || '#1C1C1E', zIndex: 2,
                }}>
                  <div style={{ color: C.text, fontWeight: 600, fontSize: 12 }}>
                    {sub.name}
                    {i === recommendedIdx && (
                      <div style={{
                        background: 'linear-gradient(135deg, #7C5CFC, #BF5AF2)',
                        color: '#fff', padding: '1px 6px', borderRadius: 4,
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: 0.5, marginTop: 3, display: 'inline-block',
                      }}>
                        NOVA Recommends
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 }}>
                    <span style={{
                      color: sub.coverageScore >= 80 ? '#30D158' : sub.coverageScore >= 60 ? '#FF9F0A' : '#FF453A',
                      fontWeight: 700,
                    }}>
                      {sub.coverageScore}%
                    </span>
                    {sub.exclusionCount > 0 && (
                      <span style={{ color: '#FF9F0A', fontSize: 10 }}>
                        {sub.exclusionCount} excl
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {divisions.map(div => {
              const divData = estimateDivisions[div];
              const divName = CSI[div]?.name || `Division ${div}`;
              return (
                <tr key={div}>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}15`, color: C.text }}>
                    <span style={{
                      background: `${C.accent}15`, color: C.accent,
                      padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600, marginRight: 6,
                    }}>
                      {div}
                    </span>
                    {divName}
                  </td>
                  <td style={{
                    padding: '8px 10px', borderBottom: `1px solid ${C.border}15`,
                    textAlign: 'right', color: C.textMuted, fontFamily: 'monospace', fontSize: 11,
                  }}>
                    {fmt(Math.round(divData.total))}
                  </td>
                  {subColumns.map((sub, i) => {
                    const status = sub.divCoverage[div] || 'none';
                    const cc = cellColors[status];
                    return (
                      <td key={i} style={{
                        padding: '8px 10px', borderBottom: `1px solid ${C.border}15`,
                        textAlign: 'center',
                      }}>
                        <div style={{
                          display: 'inline-block',
                          padding: '3px 10px', borderRadius: 6,
                          background: cc.bg, border: `1px solid ${cc.border}`,
                          color: cc.text, fontWeight: 600, fontSize: 11,
                        }}>
                          {status === 'covered' ? 'OK' : status === 'mismatch' ? 'QTY' : status === 'missing' ? 'GAP' : '—'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Total Bid Row */}
            <tr style={{ borderTop: `2px solid ${C.border}` }}>
              <td style={{ padding: '10px', color: C.text, fontWeight: 700, fontSize: 13 }}>
                Total Bid
              </td>
              <td style={{ padding: '10px', textAlign: 'right', color: C.textMuted, fontWeight: 600, fontSize: 12 }}>
                {estimateGrandTotal > 0 ? fmt(Math.round(estimateGrandTotal)) : '—'}
              </td>
              {subColumns.map((sub, i) => (
                <td key={i} style={{ padding: '10px', textAlign: 'center' }}>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
                    {sub.totalBid ? fmt(sub.totalBid) : '—'}
                  </div>
                </td>
              ))}
            </tr>

            {/* Exposure Row */}
            <tr>
              <td style={{ padding: '6px 10px', color: C.textMuted, fontSize: 12 }}>
                Scope Exposure
              </td>
              <td style={{ padding: '6px 10px' }} />
              {subColumns.map((sub, i) => (
                <td key={i} style={{ padding: '6px 10px', textAlign: 'center' }}>
                  {sub.totalExposure > 0 ? (
                    <span style={{ color: '#FF453A', fontSize: 12, fontWeight: 600 }}>
                      +{fmt(sub.totalExposure)}
                    </span>
                  ) : (
                    <span style={{ color: '#30D158', fontSize: 11 }}>None</span>
                  )}
                </td>
              ))}
            </tr>

            {/* Adjusted Cost Row — the number that matters */}
            <tr style={{ background: 'rgba(124,92,252,0.04)' }}>
              <td style={{ padding: '10px', color: C.accent, fontWeight: 700, fontSize: 13 }}>
                Adjusted Cost
              </td>
              <td style={{ padding: '10px', textAlign: 'right', color: C.textDim, fontSize: 11 }}>
                Bid + Exposure
              </td>
              {subColumns.map((sub, i) => (
                <td key={i} style={{ padding: '10px', textAlign: 'center' }}>
                  <div style={{
                    color: i === recommendedIdx ? C.accent : C.text,
                    fontWeight: 700, fontSize: 15,
                  }}>
                    {sub.totalBid ? fmt(sub.adjustedCost) : '—'}
                  </div>
                  {i === recommendedIdx && sub.totalBid > 0 && (
                    <div style={{
                      color: C.accent, fontSize: 10, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2,
                    }}>
                      Best Value
                    </div>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: `1px solid ${C.border}`,
            color: C.textMuted, borderRadius: 8, padding: '8px 20px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

const headerStyle = (C) => ({
  padding: '8px 10px', textAlign: 'center',
  fontSize: 10, fontWeight: 600, color: C.textDim,
  textTransform: 'uppercase', letterSpacing: 0.3,
  borderBottom: `1px solid ${C.border}`,
});
