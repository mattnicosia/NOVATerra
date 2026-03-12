import React, { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';

/* ────────────────────────────────────────────────────────
   MarketIntelWidget — market intel tabs + cards
   ──────────────────────────────────────────────────────── */

const INTEL_TABS = ['Materials', 'Labor', 'Equipment'];
const PERIOD_TABS = ['MoM', 'QoQ', 'YoY'];

const MARKET_DATA = {
  Materials: {
    MoM: [
      { label: 'Concrete \u00b7 NYC Metro', value: '$188', unit: '/CY', sub: 'Ready-mix 4000 PSI', badge: '\u25b2 1.4%', trend: 'up' },
      { label: 'Steel \u00b7 HSS Tube', value: '$0.84', unit: '/lb', sub: 'Commodity market', badge: '\u25bc 0.3%', trend: 'down' },
      { label: 'Lumber \u00b7 2x4 SPF', value: '$0.42', unit: '/LF', sub: 'Framing grade', badge: '\u25b2 0.8%', trend: 'up' },
    ],
    QoQ: [
      { label: 'Concrete \u00b7 NYC Metro', value: '$188', unit: '/CY', sub: 'Ready-mix 4000 PSI', badge: '\u25b2 3.2%', trend: 'up' },
      { label: 'Steel \u00b7 HSS Tube', value: '$0.84', unit: '/lb', sub: 'Commodity market', badge: '\u25bc 0.8%', trend: 'down' },
      { label: 'Lumber \u00b7 2x4 SPF', value: '$0.42', unit: '/LF', sub: 'Framing grade', badge: '\u25b2 1.2%', trend: 'up' },
    ],
    YoY: [
      { label: 'Concrete \u00b7 NYC Metro', value: '$188', unit: '/CY', sub: 'Ready-mix 4000 PSI', badge: '\u25b2 8.4%', trend: 'up' },
      { label: 'Steel \u00b7 HSS Tube', value: '$0.84', unit: '/lb', sub: 'Commodity market', badge: '\u25bc 3.1%', trend: 'down' },
      { label: 'Lumber \u00b7 2x4 SPF', value: '$0.42', unit: '/LF', sub: 'Framing grade', badge: '\u25b2 12.6%', trend: 'up' },
    ],
  },
  Labor: {
    MoM: [
      { label: 'Carpenter \u00b7 Journeyman', value: '$92', unit: '/hr', sub: 'BLS prevailing wage', badge: '\u25b2 0.4%', trend: 'up' },
      { label: 'Electrician \u00b7 Journeyman', value: '$108', unit: '/hr', sub: 'IBEW scale', badge: '\u25b2 0.6%', trend: 'up' },
      { label: 'Laborer \u00b7 General', value: '$62', unit: '/hr', sub: 'Davis-Bacon rate', badge: '\u25b2 0.2%', trend: 'up' },
    ],
    QoQ: [
      { label: 'Carpenter \u00b7 Journeyman', value: '$92', unit: '/hr', sub: 'BLS prevailing wage', badge: '\u25b2 1.1%', trend: 'up' },
      { label: 'Electrician \u00b7 Journeyman', value: '$108', unit: '/hr', sub: 'IBEW scale', badge: '\u25b2 2.4%', trend: 'up' },
      { label: 'Laborer \u00b7 General', value: '$62', unit: '/hr', sub: 'Davis-Bacon rate', badge: '\u25b2 0.6%', trend: 'up' },
    ],
    YoY: [
      { label: 'Carpenter \u00b7 Journeyman', value: '$92', unit: '/hr', sub: 'BLS prevailing wage', badge: '\u25b2 4.2%', trend: 'up' },
      { label: 'Electrician \u00b7 Journeyman', value: '$108', unit: '/hr', sub: 'IBEW scale', badge: '\u25b2 5.8%', trend: 'up' },
      { label: 'Laborer \u00b7 General', value: '$62', unit: '/hr', sub: 'Davis-Bacon rate', badge: '\u25b2 3.5%', trend: 'up' },
    ],
  },
  Equipment: {
    MoM: [
      { label: 'Excavator \u00b7 CAT 320', value: '$485', unit: '/day', sub: 'Rental rate w/ operator', badge: '\u25b2 0.5%', trend: 'up' },
      { label: 'Crane \u00b7 50-ton', value: '$1,200', unit: '/day', sub: 'Mobile hydraulic', badge: '\u25bc 0.1%', trend: 'down' },
      { label: 'Concrete Pump', value: '$2.80', unit: '/CY', sub: 'Boom pump 42m', badge: '\u25b2 0.3%', trend: 'up' },
    ],
    QoQ: [
      { label: 'Excavator \u00b7 CAT 320', value: '$485', unit: '/day', sub: 'Rental rate w/ operator', badge: '\u25b2 1.8%', trend: 'up' },
      { label: 'Crane \u00b7 50-ton', value: '$1,200', unit: '/day', sub: 'Mobile hydraulic', badge: '\u25bc 0.3%', trend: 'down' },
      { label: 'Concrete Pump', value: '$2.80', unit: '/CY', sub: 'Boom pump 42m', badge: '\u25b2 0.9%', trend: 'up' },
    ],
    YoY: [
      { label: 'Excavator \u00b7 CAT 320', value: '$485', unit: '/day', sub: 'Rental rate w/ operator', badge: '\u25b2 6.2%', trend: 'up' },
      { label: 'Crane \u00b7 50-ton', value: '$1,200', unit: '/day', sub: 'Mobile hydraulic', badge: '\u25b2 2.1%', trend: 'up' },
      { label: 'Concrete Pump', value: '$2.80', unit: '/CY', sub: 'Boom pump 42m', badge: '\u25b2 4.4%', trend: 'up' },
    ],
  },
};

export default function MarketIntelWidget() {
  const C = useTheme();
  const T = C.T;
  const font = T.font.display;
  const isDk = C.isDark;
  const ov = (a) => isDk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
  const BADGE_STYLES = {
    up: { color: C.green, bg: `${C.green}1A`, border: `${C.green}33` },
    down: { color: C.red, bg: `${C.red}1A`, border: `${C.red}33` },
  };

  const [activeTab, setActiveTab] = useState('Materials');
  const [activePeriod, setActivePeriod] = useState('QoQ');
  const [hoveredCard, setHoveredCard] = useState(null);
  const cards = MARKET_DATA[activeTab]?.[activePeriod] || MARKET_DATA.Materials.QoQ;

  const sectionLabelStyle = {
    fontSize: 9, fontWeight: 600, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: C.textDim, fontFamily: font, margin: 0,
  };

  const glassCardStyle = C.noGlass
    ? { background: C.bg2, borderRadius: 10, position: 'relative', border: `1px solid ${C.border}`, boxShadow: 'none' }
    : {
        background: C.glassBg, borderRadius: 10, position: 'relative',
        boxShadow: isDk
          ? `0 2px 12px rgba(0,0,0,0.3), 0 1px 0 ${C.glassBorder} inset`
          : `0 2px 8px rgba(0,0,0,0.06), 0 1px 0 ${C.glassBorder} inset`,
        border: `1px solid ${C.glassBorder}`,
      };

  return (
    <div style={{ fontFamily: font, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header + Tabs */}
      <div style={{ marginBottom: 6 }}>
        <span style={sectionLabelStyle}>MARKET INTEL</span>
        <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
          {INTEL_TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '5px 0', border: 'none', borderRadius: 6,
              fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
              fontFamily: font, cursor: 'pointer', transition: 'all 0.2s ease',
              background: activeTab === tab ? `${C.accent}1F` : ov(0.03),
              color: activeTab === tab ? C.accent : C.textDim, outline: 'none',
            }}>{tab}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
          {PERIOD_TABS.map(period => (
            <button key={period} onClick={() => setActivePeriod(period)} style={{
              flex: 1, padding: '4px 0', border: 'none', borderRadius: 5,
              fontSize: 8.5, fontWeight: 600, letterSpacing: '0.06em',
              fontFamily: font, cursor: 'pointer', transition: 'all 0.2s ease',
              background: activePeriod === period ? ov(0.08) : 'transparent',
              color: activePeriod === period ? C.text : C.textDim, outline: 'none',
            }}>{period}</button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'auto' }}>
        {cards.map((card, i) => {
          const bs = card.trend === 'up' ? BADGE_STYLES.up : BADGE_STYLES.down;
          const isHovered = hoveredCard === i;
          return (
            <div key={i}
              onMouseEnter={() => setHoveredCard(i)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                ...glassCardStyle, padding: '10px 14px',
                transition: 'all 200ms ease-out',
                ...(isHovered && {
                  transform: 'translateY(-1px)',
                  boxShadow: `0 6px 24px rgba(0,0,0,${isDk ? 0.4 : 0.1}), 0 1px 0 ${ov(0.08)} inset`,
                }),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ ...sectionLabelStyle, letterSpacing: '0.14em' }}>{card.label}</span>
                <span style={{
                  fontSize: 8.5, fontWeight: 600, fontFamily: font,
                  color: bs.color, background: bs.bg, border: `1px solid ${bs.border}`,
                  borderRadius: 20, padding: '2px 7px', minWidth: 38, textAlign: 'center', lineHeight: '14px',
                }}>{card.badge}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 2 }}>
                <span style={{ fontSize: 22, fontWeight: 300, color: C.text, fontFamily: font, lineHeight: 1 }}>{card.value}</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: C.textDim, fontFamily: font }}>{card.unit}</span>
              </div>
              <span style={{ fontSize: 9.5, fontWeight: 400, color: C.textMuted, fontFamily: font }}>{card.sub}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
