import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';

/* ---------- Data ---------- */
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

const TICKERS = [
  ['Lumber 2\u00d74', '$0.42/LF', 'up', '\u25b21.2%'],
  ['Copper Wire', '$4.82/lb', 'dn', '\u25bc0.9%'],
  ['Concrete 4K', '$188/CY', 'up', '\u25b23.2%'],
  ['Rebar #4', '$0.72/lb', 'fl', '\u2014'],
  ['Drywall 5/8', '$14.20/sh', 'up', '\u25b20.4%'],
  ['Insulation R-19', '$1.08/SF', 'dn', '\u25bc1.1%'],
  ['PVC 4"', '$6.40/LF', 'fl', '\u2014'],
  ['Steel HSS', '$0.84/lb', 'dn', '\u25bc0.8%'],
  ['Glass IG', '$32/SF', 'up', '\u25b22.1%'],
  ['Paint Int', '$0.58/SF', 'fl', '\u2014'],
];

const BADGE_STYLES = {
  up: { color: '#34D399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.2)' },
  down: { color: '#FB7185', bg: 'rgba(251,113,133,0.1)', border: 'rgba(251,113,133,0.2)' },
};

const TICKER_COLORS = {
  up: '#34D399',
  dn: '#FB7185',
  fl: 'rgba(238,237,245,0.35)',
};

/* ---------- Keyframes (injected once) ---------- */
let stylesInjected = false;
function injectKeyframes() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeRight {
      from { opacity: 0; transform: translateX(24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
  `;
  document.head.appendChild(style);
}

/* ========== Component ========== */
export default function DashboardRightPanel() {
  injectKeyframes();

  const C = useTheme();
  const T = C.T;
  const font = T.font.display;
  const isDk = C.isDark;
  const ov = (a) => isDk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;

  /* ---- Ticker scroll ---- */
  const scrollRef = useRef(null);
  const offsetRef = useRef(0);
  const rafRef = useRef(null);

  const tick = useCallback(() => {
    const el = scrollRef.current;
    if (!el) { rafRef.current = requestAnimationFrame(tick); return; }
    offsetRef.current += 0.15;
    const halfHeight = el.scrollHeight / 2;
    if (offsetRef.current >= halfHeight) {
      offsetRef.current -= halfHeight;
    }
    el.style.transform = `translateY(-${offsetRef.current}px)`;
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [tick]);

  /* ---- Tab + Hover state ---- */
  const [activeTab, setActiveTab] = useState('Materials');
  const [activePeriod, setActivePeriod] = useState('QoQ');
  const [hoveredCard, setHoveredCard] = useState(null);
  const MARKET_CARDS = MARKET_DATA[activeTab]?.[activePeriod] || MARKET_DATA.Materials.QoQ;

  /* ---------- Styles ---------- */
  const panelStyle = {
    width: T.dashboard.rightPanel,
    minWidth: T.dashboard.rightPanel,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 16px 16px',
    background: C.noGlass ? C.bg1 : `linear-gradient(225deg, ${C.glassBgDark} 0%, ${C.glassBg} 50%, transparent 100%)`,
    backdropFilter: C.noGlass ? 'none' : 'blur(32px) saturate(1.4)',
    boxShadow: C.noGlass ? `inset 1px 0 0 ${C.border}` : `inset 1px 0 0 ${C.glassBorder}`,
    animation: 'fadeRight 0.8s cubic-bezier(0.16,1,0.3,1) 0.7s both',
    fontFamily: font,
    boxSizing: 'border-box',
    overflow: 'hidden',
  };

  const sectionLabelStyle = {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: C.textDim,
    fontFamily: font,
    margin: 0,
  };

  const glassCardStyle = C.noGlass ? {
    background: C.bg2,
    borderRadius: 10,
    position: 'relative',
    border: `1px solid ${C.border}`,
  } : {
    background: C.glassBg,
    borderRadius: 10,
    position: 'relative',
    boxShadow: isDk
      ? `0 2px 12px rgba(0,0,0,0.3), 0 1px 0 ${C.glassBorder} inset`
      : `0 2px 8px rgba(0,0,0,0.06), 0 1px 0 ${C.glassBorder} inset`,
    border: `1px solid ${C.glassBorder}`,
  };

  /* ---- Doubled ticker data for seamless loop ---- */
  const doubledTickers = [...TICKERS, ...TICKERS];

  return (
    <div style={panelStyle}>
      {/* Section Header + Category Tabs */}
      <div style={{ marginBottom: 6, padding: '0 4px' }}>
        <span style={sectionLabelStyle}>MARKET INTEL</span>
        <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
          {INTEL_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '5px 0', border: 'none', borderRadius: 6,
                fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                fontFamily: font, cursor: 'pointer', transition: 'all 0.2s ease',
                background: activeTab === tab ? `${C.accent}1F` : ov(0.03),
                color: activeTab === tab ? C.accent : C.textDim,
                outline: 'none',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Period Tabs (YoY / MoM / QoQ) */}
        <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
          {PERIOD_TABS.map(period => (
            <button
              key={period}
              onClick={() => setActivePeriod(period)}
              style={{
                flex: 1, padding: '4px 0', border: 'none', borderRadius: 5,
                fontSize: 8.5, fontWeight: 600, letterSpacing: '0.06em',
                fontFamily: font, cursor: 'pointer', transition: 'all 0.2s ease',
                background: activePeriod === period ? ov(0.08) : 'transparent',
                color: activePeriod === period ? C.text : C.textDim,
                outline: 'none',
              }}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Market Intelligence Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MARKET_CARDS.map((card, i) => {
          const bs = card.trend === 'up' ? BADGE_STYLES.up : BADGE_STYLES.down;
          const isHovered = hoveredCard === i;
          return (
            <div
              key={i}
              onMouseEnter={() => setHoveredCard(i)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                ...glassCardStyle,
                padding: '10px 14px',
                transition: 'all 200ms ease-out',
                ...(isHovered && {
                  transform: 'translateY(-1px)',
                  boxShadow: `0 6px 24px rgba(0,0,0,${isDk ? 0.4 : 0.1}), 0 1px 0 ${ov(0.08)} inset`,
                }),
              }}
            >
              {/* Label row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ ...sectionLabelStyle, letterSpacing: '0.14em' }}>
                  {card.label}
                </span>
                {/* Badge pill */}
                <span style={{
                  fontSize: 8.5,
                  fontWeight: 600,
                  fontFamily: font,
                  color: bs.color,
                  background: bs.bg,
                  border: `1px solid ${bs.border}`,
                  borderRadius: 20,
                  padding: '2px 7px',
                  minWidth: 38,
                  textAlign: 'center',
                  lineHeight: '14px',
                }}>
                  {card.badge}
                </span>
              </div>

              {/* Value */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 2 }}>
                <span style={{ fontSize: 22, fontWeight: 300, color: C.text, fontFamily: font, lineHeight: 1 }}>
                  {card.value}
                </span>
                <span style={{ fontSize: 11, fontWeight: 400, color: C.textDim, fontFamily: font }}>
                  {card.unit}
                </span>
              </div>

              {/* Sub-label */}
              <span style={{ fontSize: 9.5, fontWeight: 400, color: C.textMuted, fontFamily: font }}>
                {card.sub}
              </span>
            </div>
          );
        })}
      </div>

      {/* Live Material Feed */}
      <div style={{
        ...glassCardStyle,
        marginTop: 8,
        flex: 1,
        minHeight: 180,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: 0,
      }}>
        {/* Internal header */}
        <div style={{ padding: '12px 14px 8px', flexShrink: 0 }}>
          <span style={sectionLabelStyle}>LIVE MATERIAL FEED</span>
        </div>

        {/* Scrolling ticker area */}
        <div style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          padding: '0 10px',
        }}>
          {/* Fade top */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, height: 24,
            background: `linear-gradient(to bottom, ${C.bg1}F2, ${C.bg1}80, transparent)`,
            zIndex: 1, pointerEvents: 'none',
          }} />

          {/* Scrolling content */}
          <div ref={scrollRef} style={{ willChange: 'transform' }}>
            {doubledTickers.map(([name, price, trend, change], i) => {
              const pillColor = trend === 'up' ? '#34D399' : trend === 'dn' ? '#FB7185' : C.textMuted;
              const pillBg = trend === 'up'
                ? 'rgba(52,211,153,0.08)'
                : trend === 'dn'
                  ? 'rgba(251,113,133,0.08)'
                  : ov(0.04);

              return (
                <div key={i} style={{
                  height: 33,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderBottom: `1px solid ${C.borderLight}`,
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 400,
                    color: C.textMuted,
                    fontFamily: font, flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {name}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 500,
                    color: C.text,
                    fontFamily: font, flexShrink: 0,
                  }}>
                    {price}
                  </span>
                  <span style={{
                    fontSize: 8.5, fontWeight: 600, fontFamily: font,
                    color: pillColor,
                    background: pillBg,
                    border: `1px solid ${trend === 'up' ? 'rgba(52,211,153,0.15)' : trend === 'dn' ? 'rgba(251,113,133,0.15)' : C.borderLight}`,
                    borderRadius: 20,
                    padding: '1px 6px',
                    minWidth: 32, textAlign: 'center',
                    lineHeight: '14px', flexShrink: 0,
                  }}>
                    {change}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Fade bottom */}
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0, height: 24,
            background: `linear-gradient(to top, ${C.bg1}F2, ${C.bg1}80, transparent)`,
            zIndex: 1, pointerEvents: 'none',
          }} />
        </div>
      </div>
    </div>
  );
}
