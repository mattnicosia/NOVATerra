// Style helper functions — Command Center design system
import { T } from "./designTokens";

// ── Nero Nemesis: Dual Material System ──
// Two distinct materials: Black Glass (floating surfaces) vs Matte Carbon (structural).
// Glass surfaces: translucent, specular, deep shadows, NO carbon texture.
// Carbon surfaces: opaque, textured, flat, NO glass treatment.

// neroCarbon: Matte carbon fiber texture on structural surfaces (sidebar, header, toolbars)
const neroCarbon = (C, bg) => `${C.carbonTexture || ""}, ${bg}`.replace(/^, /, "");

// neroGlassStyle: Full 5-layer Apple glass stack from tier tokens (sm/md/lg/xl)
// Layer 1: Shadow + edge (depth)
// Layer 2: Material (blur + translucency)
// Layer 3: Specular (inset highlights)
// Layer 4: Content (rendered by React)
// Layer 5: Illumination (hover glow — applied via CSS)
const neroGlassStyle = (C, tier = "md") => {
  const tokens = C.T || T;
  const ng = tokens.neroGlass?.[tier] || tokens.neroGlass?.md || {};
  const shadow = [ng.specular, ng.specularBottom, ng.innerDepth, ng.shadow, ng.edge].filter(Boolean).join(", ");
  return {
    background: ng.bg || "rgba(255,255,255,0.08)",
    backdropFilter: ng.blur || "blur(16px) saturate(150%)",
    WebkitBackdropFilter: ng.blur || "blur(16px) saturate(150%)",
    borderRadius: T.radius.md,
    border: `1px solid ${ng.border || "rgba(255,255,255,0.12)"}`,
    boxShadow: shadow,
    transition: tokens.neroGlass?.spring || "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
  };
};

// Export for direct use in components
export { neroGlassStyle, neroCarbon };

export const inp = (C, overrides) => {
  const tokens = C.T || T;
  return {
    background: C.neroMode ? "rgba(0,0,0,0.35)" : C.isDark ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.45)",
    border: `1px solid ${C.isDark ? C.glassBorder || C.border : tokens.glass?.border || "rgba(255,255,255,0.55)"}`,
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
    ...(!C.isDark && {
      boxShadow:
        "inset 0 0.5px 2px rgba(20,30,80,0.06), 0 0 0 1px rgba(255,255,255,0.25), inset 0 -0.5px 0 rgba(255,255,255,0.80)",
    }),
    ...overrides,
  };
};

export const nInp = (C, overrides) =>
  inp(C, {
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

  // ── NO GLASS: Solid opaque card — zero blur, zero transparency ──
  if (C.noGlass) {
    return cardSolid(C, overrides);
  }

  const glassBg = C.glassBg || (C.isDark ? "rgba(15,15,30,0.38)" : "rgba(255,255,255,0.32)");

  // ── NERO: Black Glass (md tier) — floating translucent, NO carbon texture ──
  if (C.neroMode) {
    return {
      ...neroGlassStyle(C, "md"),
      ...overrides,
    };
  }

  const shadow = [
    tokens.glass?.specular,
    tokens.glass?.specularBottom,
    tokens.glass?.innerDepth,
    tokens.shadow.sm,
    tokens.glass?.edge,
    tokens.glass?.refraction,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    background: C.isDark
      ? glassBg
      : `${tokens.glass?.lens || ""}, linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%), ${glassBg}`.replace(
          /^, /,
          "",
        ),
    backdropFilter: tokens.glass.blur,
    WebkitBackdropFilter: tokens.glass.blur,
    borderRadius: T.radius.md,
    border: `1px solid ${tokens.glass?.border || (C.isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.55)")}`,
    boxShadow: shadow,
    ...overrides,
  };
};

// Solid card — non-glass fallback (old card behavior)
export const cardSolid = (C, overrides) => {
  const tokens = C.T || T;

  // ── NERO: Matte Carbon — structural surface, NO glass treatment ──
  if (C.neroMode) {
    return {
      background: neroCarbon(C, C.bg1),
      borderRadius: T.radius.md,
      border: `1px solid rgba(255,255,255,0.06)`,
      boxShadow: `${tokens.shadow.sm}, 0 0 0 0.5px rgba(255,255,255,0.04)`,
      ...overrides,
    };
  }

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

  // ── NO GLASS: Solid raised card ──
  if (C.noGlass) {
    return {
      ...cardSolid(C),
      boxShadow: tokens.shadow.md,
      ...overrides,
    };
  }

  // ── NERO: Black Glass (lg tier) — elevated floating surface ──
  if (C.neroMode) {
    return {
      ...neroGlassStyle(C, "lg"),
      ...overrides,
    };
  }

  const shadow = [
    tokens.glass?.specularLg,
    tokens.glass?.specularBottomLg,
    tokens.glass?.innerDepthLg,
    tokens.shadow.md,
    tokens.glass?.edge,
    tokens.glass?.refraction,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    ...card(C),
    boxShadow: shadow,
    ...overrides,
  };
};

// Glass card — large specular + elevated shadow + full depth
export const cardGlass = (C, overrides) => {
  const tokens = C.T || T;

  // ── NO GLASS: Solid card with medium shadow ──
  if (C.noGlass) {
    return {
      ...cardSolid(C),
      boxShadow: tokens.shadow.md,
      ...overrides,
    };
  }

  const glassBg = C.glassBg || (C.isDark ? "rgba(15,15,30,0.38)" : "rgba(255,255,255,0.32)");

  // ── NERO: Black Glass (lg tier) — max glass + SVG refraction ──
  if (C.neroMode) {
    return {
      ...neroGlassStyle(C, "lg"),
      // className 'glass-refract' activates SVG displacement filter via CSS
      ...overrides,
    };
  }

  const shadow = [
    tokens.glass?.specularLg,
    tokens.glass?.specularBottomLg,
    tokens.glass?.innerDepthLg,
    tokens.shadow.md,
    tokens.glass?.edge,
    tokens.glass?.refraction,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    background: C.isDark
      ? glassBg
      : `${tokens.glass?.lens || ""}, linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%), ${glassBg}`.replace(
          /^, /,
          "",
        ),
    backdropFilter: tokens.glass.blur,
    WebkitBackdropFilter: tokens.glass.blur,
    borderRadius: T.radius.md,
    border: `1px solid ${tokens.glass?.border || (C.isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.55)")}`,
    boxShadow: shadow,
    ...overrides,
  };
};

// Section label — uppercase micro text
export const sectionLabel = C => ({
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
export const pageContainer = C => ({
  padding: T.space[8],
  minHeight: "100%",
});

// Gradient accent button — Liquid Glass glow on light
export const accentButton = (C, overrides) => {
  const tokens = C.T || T;

  // ── NERO: Accent glow + sm-tier glass specular ──
  if (C.neroMode) {
    const ng = (C.T || T).neroGlass?.sm || {};
    return {
      ...bt(C),
      background: C.gradient || C.accent,
      color: "#fff",
      padding: "8px 18px",
      fontWeight: T.fontWeight.semibold,
      borderRadius: T.radius.sm,
      boxShadow: [
        ng.specular || "inset 0 0.5px 0 rgba(255,255,255,0.15)",
        `0 0 20px ${C.accent}40`,
        `0 0 40px ${C.accent}18`,
        ng.edge || "0 0 0 0.5px rgba(255,255,255,0.06)",
      ].join(", "),
      transition: (C.T || T).neroGlass?.spring || "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
      ...overrides,
    };
  }

  return {
    ...bt(C),
    background: C.gradient || C.accent,
    color: "#fff",
    padding: "8px 18px",
    fontWeight: T.fontWeight.semibold,
    borderRadius: T.radius.sm,
    boxShadow: C.isDark
      ? "0 0 12px rgba(0,212,255,0.15)"
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
export const tableRow = (C, { isEven, isSelected, accentColor, overrides } = {}) => {
  const base = {
    display: "flex",
    alignItems: "center",
    padding: `${T.space[2]}px ${T.space[3]}px`,
    borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
    background: isSelected
      ? `${accentColor || C.accent}12`
      : isEven === false
        ? C.isDark
          ? "rgba(255,255,255,0.018)"
          : "rgba(0,0,0,0.015)"
        : "transparent",
    borderLeft: isSelected ? `3px solid ${accentColor || C.accent}` : "3px solid transparent",
    transition: "background 120ms ease-out",
    cursor: "pointer",
    ...overrides,
  };

  // ── NERO: selected rows get accent glow on left border ──
  if (C.neroMode && isSelected) {
    base.boxShadow = `inset 3px 0 12px ${accentColor || C.accent}25`;
  }

  return base;
};

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
  borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
  ...overrides,
});
