// ============================================================
// NOVA Core — Impact Counters
// Public component for novaterra.ai/impact
// Animated tree counter, CO2e tonnes, named groves, timestamp
// Style: Between Stars and Stone — dark, teal accent
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';

const TEAL = '#2DD4BF';
const TEAL_DIM = 'rgba(45,212,191,0.15)';
const TEAL_GLOW = 'rgba(45,212,191,0.25)';
const BG = '#06060C';
const CARD = '#0C0B14';
const CARD_BORDER = 'rgba(45,212,191,0.12)';
const TEXT = '#EEEDF5';
const TEXT_MUTED = 'rgba(238,237,245,0.5)';

// ── Animated count-up hook ──
function useCountUp(target, duration = 2000) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (target <= 0) { setValue(0); return; }

    const start = performance.now();
    const from = 0;

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

// ── Stat card ──
function StatCard({ label, value, unit, icon }) {
  return (
    <div style={{
      background: CARD,
      border: `1px solid ${CARD_BORDER}`,
      borderRadius: 16,
      padding: '32px 28px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      flex: '1 1 240px',
      minWidth: 200,
    }}>
      <span style={{ fontSize: 28, lineHeight: 1 }}>{icon}</span>
      <span style={{
        fontFamily: 'Switzer, system-ui, sans-serif',
        fontSize: 48,
        fontWeight: 700,
        color: TEAL,
        letterSpacing: '-0.02em',
        lineHeight: 1.1,
        textShadow: `0 0 40px ${TEAL_GLOW}`,
      }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span style={{ fontSize: 20, fontWeight: 500, color: TEXT_MUTED, marginLeft: 6 }}>{unit}</span>}
      </span>
      <span style={{
        fontFamily: 'Switzer, system-ui, sans-serif',
        fontSize: 14,
        fontWeight: 500,
        color: TEXT_MUTED,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </div>
  );
}

// ── Grove pill ──
function GrovePill({ grove }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      background: TEAL_DIM,
      border: `1px solid ${CARD_BORDER}`,
      borderRadius: 100,
      padding: '8px 18px 8px 14px',
    }}>
      <span style={{ fontSize: 16 }}>🌲</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{
          fontFamily: 'Switzer, system-ui, sans-serif',
          fontSize: 14,
          fontWeight: 600,
          color: TEXT,
        }}>
          {grove.grove_name}
        </span>
        <span style={{
          fontFamily: 'Switzer, system-ui, sans-serif',
          fontSize: 11,
          color: TEXT_MUTED,
        }}>
          {grove.org_name} — {grove.trees} tree{grove.trees !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

// ── Main component ──
export default function ImpactCounters() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/nova-core/impact');
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch (e) {
      console.error('[ImpactCounters] fetch failed:', e);
      setError('Unable to load impact data');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const animatedTrees = useCountUp(data?.total_trees || 0, 2400);
  const co2eTonnes = data?.total_co2e_avoided ? Math.round(data.total_co2e_avoided / 1000 * 10) / 10 : 0;
  const animatedCO2e = useCountUp(Math.round(co2eTonnes * 10), 2400);

  const lastUpdated = data?.last_updated
    ? new Date(data.last_updated).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <section style={{
      background: BG,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 24px',
      fontFamily: 'Switzer, system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 56, maxWidth: 640 }}>
        <h1 style={{
          fontSize: 40,
          fontWeight: 700,
          color: TEXT,
          margin: 0,
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
        }}>
          Between Stars <span style={{ color: TEAL }}>&</span> Stone
        </h1>
        <p style={{
          fontSize: 16,
          color: TEXT_MUTED,
          marginTop: 12,
          lineHeight: 1.6,
        }}>
          Every estimate on NOVATerra measures carbon impact. Every milestone plants real trees.
          This is the living ledger of our collective footprint.
        </p>
      </div>

      {/* Loading / Error */}
      {error && (
        <p style={{ color: '#FB7185', fontSize: 14 }}>{error}</p>
      )}

      {!data && !error && (
        <p style={{ color: TEXT_MUTED, fontSize: 14 }}>Loading impact data...</p>
      )}

      {/* Stat cards */}
      {data && (
        <>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            justifyContent: 'center',
            maxWidth: 720,
            width: '100%',
            marginBottom: 48,
          }}>
            <StatCard
              icon="🌳"
              label="Trees Planted"
              value={animatedTrees}
            />
            <StatCard
              icon="🌍"
              label="CO₂e Avoided"
              value={animatedCO2e / 10}
              unit="tonnes"
            />
          </div>

          {/* Groves */}
          {data.groves && data.groves.length > 0 && (
            <div style={{ textAlign: 'center', marginBottom: 40, maxWidth: 640 }}>
              <h2 style={{
                fontSize: 18,
                fontWeight: 600,
                color: TEXT,
                marginBottom: 16,
                letterSpacing: '-0.01em',
              }}>
                Named Groves
              </h2>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                justifyContent: 'center',
              }}>
                {data.groves.map((g, i) => (
                  <GrovePill key={`${g.grove_name}-${i}`} grove={g} />
                ))}
              </div>
            </div>
          )}

          {/* Carbon pioneers */}
          {data.carbon_pioneer_orgs && data.carbon_pioneer_orgs.length > 0 && (
            <div style={{ textAlign: 'center', marginBottom: 40, maxWidth: 640 }}>
              <h2 style={{
                fontSize: 18,
                fontWeight: 600,
                color: TEXT,
                marginBottom: 12,
                letterSpacing: '-0.01em',
              }}>
                Carbon Pioneers
              </h2>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
              }}>
                {data.carbon_pioneer_orgs.map((o, i) => (
                  <span key={i} style={{
                    fontFamily: 'Switzer, system-ui, sans-serif',
                    fontSize: 13,
                    fontWeight: 500,
                    color: TEAL,
                    background: TEAL_DIM,
                    border: `1px solid ${CARD_BORDER}`,
                    borderRadius: 100,
                    padding: '6px 16px',
                  }}>
                    {o.org_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Timestamp */}
          {lastUpdated && (
            <p style={{
              fontSize: 12,
              color: TEXT_MUTED,
              marginTop: 16,
              opacity: 0.7,
            }}>
              Last updated {lastUpdated}
            </p>
          )}
        </>
      )}
    </section>
  );
}
