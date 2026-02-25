// Style helper functions — Command Center design system
import { T } from './designTokens';

export const inp = (C, overrides) => ({
  background: C.isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.5)',
  border: `1px solid ${C.glassBorder || C.border}`,
  borderRadius: T.radius.sm,
  color: C.text,
  padding: "7px 14px",
  fontSize: T.fontSize.base,
  fontFamily: "'DM Sans',sans-serif",
  lineHeight: T.lineHeight.normal,
  width: "100%",
  outline: "none",
  transition: T.transition.fast,
  ...overrides,
});

export const nInp = (C, overrides) => inp(C, {
  textAlign: "right",
  fontFamily: "'DM Mono',monospace",
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

// Card surface — glass card with backdrop blur
export const card = (C, overrides) => ({
  background: C.glassBg || 'rgba(18,21,28,0.55)',
  backdropFilter: T.glass.blur,
  WebkitBackdropFilter: T.glass.blur,
  borderRadius: T.radius.md,
  border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`,
  boxShadow: T.shadow.sm,
  ...overrides,
});

// Solid card — non-glass fallback (old card behavior)
export const cardSolid = (C, overrides) => ({
  background: C.bg1,
  borderRadius: T.radius.md,
  border: `1px solid ${C.border}`,
  boxShadow: T.shadow.sm,
  ...overrides,
});

// Raised card — prominent elevation with subtle glow
export const cardRaised = (C, overrides) => ({
  ...card(C),
  boxShadow: T.shadow.md,
  ...overrides,
});

// Glass card — frosted dark surface
export const cardGlass = (C, overrides) => ({
  background: C.glassBg || 'rgba(18,21,28,0.55)',
  backdropFilter: T.glass.blur,
  WebkitBackdropFilter: T.glass.blur,
  borderRadius: T.radius.md,
  border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`,
  boxShadow: T.shadow.md,
  ...overrides,
});

// Section label — uppercase micro text
export const sectionLabel = (C) => ({
  fontSize: T.fontSize.xs,
  fontWeight: T.fontWeight.semibold,
  color: C.textDim,
  textTransform: "uppercase",
  letterSpacing: T.tracking.caps,
});

// Monospace shorthand
export const mono = () => ({
  fontFamily: "'DM Mono',monospace",
});

// Page container — transparent so gradient shows through
export const pageContainer = (C) => ({
  padding: T.space[7],
  minHeight: "100%",
});

// Gradient accent button
export const accentButton = (C, overrides) => ({
  ...bt(C),
  background: C.gradient || C.accent,
  color: "#fff",
  padding: "8px 18px",
  fontWeight: T.fontWeight.semibold,
  borderRadius: T.radius.sm,
  boxShadow: '0 0 12px rgba(0,212,255,0.15)',
  ...overrides,
});
