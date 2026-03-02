// Style helper functions — Command Center design system
import { T } from './designTokens';

export const inp = (C, overrides) => {
  const tokens = C.T || T;
  return {
    background: C.isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.45)',
    border: `1px solid ${C.isDark ? (C.glassBorder || C.border) : (tokens.glass?.border || 'rgba(255,255,255,0.55)')}`,
    borderRadius: T.radius.sm,
    color: C.text,
    padding: "7px 14px",
    fontSize: T.fontSize.base,
    fontFamily: "'DM Sans',sans-serif",
    lineHeight: T.lineHeight.normal,
    width: "100%",
    outline: "none",
    transition: T.transition.fast,
    // Liquid Glass v2: recessed field with specular bottom-edge highlight
    ...(!C.isDark && { boxShadow: 'inset 0 0.5px 2px rgba(20,30,80,0.06), 0 0 0 1px rgba(255,255,255,0.25), inset 0 -0.5px 0 rgba(255,255,255,0.80)' }),
    ...overrides,
  };
};

export const nInp = (C, overrides) => inp(C, {
  textAlign: "right",
  fontFamily: "'DM Sans',sans-serif",
  fontSize: T.fontSize.sm,
  ...overrides,
});

export const bt = (C, overrides) => ({
  border: "none",
  borderRadius: T.radius.sm,
  cursor: "pointer",
  fontSize: T.fontSize.sm,
  fontWeight: T.fontWeight.semibold,
  fontFamily: "'DM Sans',sans-serif",
  display: "flex",
  alignItems: "center",
  gap: T.space[2],
  transition: T.transition.fast,
  ...overrides,
});

// Card surface — Liquid Glass card (both modes use translucent glass)
export const card = (C, overrides) => {
  const tokens = C.T || T;
  const glassBg = C.glassBg || (C.isDark ? 'rgba(15,15,30,0.38)' : 'rgba(255,255,255,0.32)');
  const shadow = [
    tokens.glass?.specular,
    tokens.glass?.specularBottom,
    tokens.glass?.innerDepth,
    tokens.shadow.sm,
    tokens.glass?.edge,
    tokens.glass?.refraction,
  ].filter(Boolean).join(', ');
  return {
    background: C.isDark
      ? glassBg
      : `${tokens.glass?.lens || ''}, linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%), ${glassBg}`.replace(/^, /, ''),
    backdropFilter: tokens.glass.blur,
    WebkitBackdropFilter: tokens.glass.blur,
    borderRadius: T.radius.md,
    border: `1px solid ${tokens.glass?.border || (C.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)')}`,
    boxShadow: shadow,
    ...overrides,
  };
};

// Solid card — non-glass fallback (old card behavior)
export const cardSolid = (C, overrides) => {
  const tokens = C.T || T;
  return {
    background: C.bg1,
    borderRadius: T.radius.md,
    border: `1px solid ${C.border}`,
    boxShadow: tokens.shadow.sm,
    ...overrides,
  };
};

// Raised card — elevated shadow (large specular + depth)
export const cardRaised = (C, overrides) => {
  const tokens = C.T || T;
  const shadow = [
    tokens.glass?.specularLg,
    tokens.glass?.specularBottomLg,
    tokens.glass?.innerDepthLg,
    tokens.shadow.md,
    tokens.glass?.edge,
    tokens.glass?.refraction,
  ].filter(Boolean).join(', ');
  return {
    ...card(C),
    boxShadow: shadow,
    ...overrides,
  };
};

// Glass card — large specular + elevated shadow + full depth
export const cardGlass = (C, overrides) => {
  const tokens = C.T || T;
  const glassBg = C.glassBg || (C.isDark ? 'rgba(15,15,30,0.38)' : 'rgba(255,255,255,0.32)');
  const shadow = [
    tokens.glass?.specularLg,
    tokens.glass?.specularBottomLg,
    tokens.glass?.innerDepthLg,
    tokens.shadow.md,
    tokens.glass?.edge,
    tokens.glass?.refraction,
  ].filter(Boolean).join(', ');
  return {
    background: C.isDark
      ? glassBg
      : `${tokens.glass?.lens || ''}, linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%), ${glassBg}`.replace(/^, /, ''),
    backdropFilter: tokens.glass.blur,
    WebkitBackdropFilter: tokens.glass.blur,
    borderRadius: T.radius.md,
    border: `1px solid ${tokens.glass?.border || (C.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)')}`,
    boxShadow: shadow,
    ...overrides,
  };
};

// Section label — uppercase micro text
export const sectionLabel = (C) => ({
  fontSize: T.fontSize.xs,
  fontWeight: T.fontWeight.bold,
  color: C.textDim,
  textTransform: "uppercase",
  letterSpacing: T.tracking.caps,
});

// Monospace shorthand
export const mono = () => ({
  fontFamily: "'DM Sans',sans-serif",
});

// Page container — transparent so gradient shows through
export const pageContainer = (C) => ({
  padding: T.space[8],
  minHeight: "100%",
});

// Gradient accent button — Liquid Glass glow on light
export const accentButton = (C, overrides) => {
  const tokens = C.T || T;
  return {
    ...bt(C),
    background: C.gradient || C.accent,
    color: "#fff",
    padding: "8px 18px",
    fontWeight: T.fontWeight.semibold,
    borderRadius: T.radius.sm,
    boxShadow: C.isDark
      ? '0 0 12px rgba(0,212,255,0.15)'
      : `inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 8px ${C.accent}20, 0 0 0 0.5px ${C.accent}10`,
    ...overrides,
  };
};

// ── Phase 1 "Tighten the Core" Design Primitives ────────────────────

// Unified status badge — one function, consistent everywhere
export const statusBadge = (color, overrides) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: T.fontSize.xs,
  fontWeight: T.fontWeight.semibold,
  fontFamily: "'DM Sans',sans-serif",
  padding: "2px 8px",
  borderRadius: T.radius.full,
  background: `${color}18`,
  color: color,
  lineHeight: 1.4,
  whiteSpace: "nowrap",
  letterSpacing: 0.1,
  ...overrides,
});

// Truncate — ellipsis overflow for any text container
export const truncate = (maxWidth, overrides) => ({
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: maxWidth || "100%",
  ...overrides,
});

// Table column header — consistent across Estimate, Dashboard, Takeoffs
export const colHeader = (C, overrides) => ({
  fontSize: T.fontSize.xs,
  fontWeight: T.fontWeight.semibold,
  color: C.textDim,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  padding: `${T.space[2]}px ${T.space[3]}px`,
  ...overrides,
});

// Table row — alternating, with active/selected states
export const tableRow = (C, { isEven, isSelected, accentColor, overrides } = {}) => ({
  display: "flex",
  alignItems: "center",
  padding: `${T.space[2]}px ${T.space[3]}px`,
  borderBottom: `1px solid ${C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'}`,
  background: isSelected
    ? `${accentColor || C.accent}12`
    : isEven === false
      ? (C.isDark ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.015)')
      : "transparent",
  borderLeft: isSelected ? `3px solid ${accentColor || C.accent}` : "3px solid transparent",
  transition: "background 120ms ease-out",
  cursor: "pointer",
  ...overrides,
});

// Money display — bold when > 0, dim when 0
export const moneyCell = (C, value, overrides) => ({
  fontFamily: T.font.mono,
  fontWeight: value > 0 ? T.fontWeight.bold : T.fontWeight.normal,
  fontSize: T.fontSize.sm,
  color: value > 0 ? C.text : C.textDim,
  fontFeatureSettings: "'tnum'",
  textAlign: "right",
  opacity: value > 0 ? 1 : 0.5,
  ...overrides,
});

// Section header — uniform section dividers app-wide
export const sectionHead = (C, overrides) => ({
  display: "flex",
  alignItems: "center",
  gap: T.space[2],
  fontSize: T.fontSize.xs,
  fontWeight: T.fontWeight.bold,
  color: C.textDim,
  textTransform: "uppercase",
  letterSpacing: T.tracking.caps,
  padding: `${T.space[2]}px 0`,
  marginBottom: T.space[2],
  borderBottom: `1px solid ${C.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
  ...overrides,
});
