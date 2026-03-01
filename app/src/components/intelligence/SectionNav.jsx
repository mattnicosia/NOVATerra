// SectionNav — Horizontal tab strip for Intelligence Center sections
import { useTheme } from '@/hooks/useTheme';

const SECTIONS = [
  { key: "overview",    label: "Overview" },
  { key: "markets",     label: "Markets" },
  { key: "benchmarks",  label: "Benchmarks" },
  { key: "portfolio",   label: "Portfolio" },
  { key: "divisions",   label: "Divisions" },
];

export default function SectionNav({ active, onChange }) {
  const C = useTheme();
  const T = C.T;

  return (
    <div style={{
      display: "flex", gap: 4, padding: "4px",
      background: C.bg2, borderRadius: T.radius.md,
      border: `1px solid ${C.border}`,
    }}>
      {SECTIONS.map(s => {
        const isActive = active === s.key;
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            style={{
              flex: 1,
              padding: "8px 14px",
              borderRadius: T.radius.sm,
              border: "none",
              cursor: "pointer",
              fontSize: T.fontSize.sm,
              fontWeight: isActive ? T.fontWeight.bold : T.fontWeight.medium,
              fontFamily: "'DM Sans', sans-serif",
              color: isActive ? C.accent : C.textMuted,
              background: isActive ? `${C.accent}15` : "transparent",
              transition: T.transition.fast,
              whiteSpace: "nowrap",
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
