// NOVATerra Design Tokens — Board Session IV Spec
// Every visual decision in one file. No magic numbers elsewhere.

export const COLORS = {
  bg: {
    primary: '#08090E',    // Blue-black void. Depth, not flatness.
    elevated: '#11111B',   // Warm against cool base. Lit-from-within.
    surface: '#1A1A24',    // Recessed input wells.
  },
  border: {
    subtle: '#25253A',     // Blue-warm tension. 1px only.
    active: '#3D3D56',     // Focused/interactive borders.
  },
  text: {
    primary: '#FAFAFA',    // Headlines, amounts. Used sparingly.
    secondary: '#A1A1AA',  // Labels, descriptions.
    tertiary: '#52525B',   // Timestamps, helper text, disabled.
  },
  accent: {
    DEFAULT: '#7C6BF0',    // Luminous indigo. Brand color.
    hover: '#9B8AFB',      // Lighter, maintains warmth.
    muted: 'rgba(124,107,240,0.10)', // Ghostly backgrounds.
    glow: 'rgba(124,107,240,0.3)',   // Text shadow on data values.
    shadow: 'rgba(124,107,240,0.25)', // Button hover shadow.
    proximity: 'rgba(124,107,240,0.015)', // Cursor proximity light.
  },
  semantic: {
    green: '#22C55E',      // On track, complete, positive.
    amber: '#F59E0B',      // Attention, approaching deadline.
    red: '#EF4444',        // Overdue, error, critical.
  },
};

export const TYPOGRAPHY = {
  display: { size: 22, weight: 500, lineHeight: 28, letterSpacing: '0.02em' },
  heading: { size: 16, weight: 600, lineHeight: 22, letterSpacing: '0' },
  body: { size: 14, weight: 400, lineHeight: 20, letterSpacing: '0' },
  bodyStrong: { size: 14, weight: 600, lineHeight: 20, letterSpacing: '0' },
  caption: { size: 12, weight: 500, lineHeight: 16, letterSpacing: '0.02em' },
  novaReadout: { size: 15, weight: 400, lineHeight: 20, letterSpacing: '0' },
};

export const SPACING = {
  grid: 8, // Base grid unit
  rail: 48, // Nav rail width
  header: 48, // Header height
  cardRadius: 12,
  buttonRadius: 10,
  inputRadius: 8,
  cardPadding: 16,
};

export const MOTION = {
  fast: '80ms',
  normal: '120ms',
  medium: '150ms',
  slow: '200ms',
  modal: '200ms',
  toast: '250ms',
  sentence: '300ms',
  pulse: '600ms',
  shimmer: '1500ms',
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
};

// SVG noise texture for card surfaces (2% opacity, overlay blend)
export const NOISE_TEXTURE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.02'/%3E%3C/svg%3E")`;

// Card type indicators (left bar colors)
export const CARD_TYPE_COLORS = {
  estimate: COLORS.accent.DEFAULT,
  inbox: COLORS.semantic.amber,
  resource: COLORS.semantic.green,
  alert: COLORS.semantic.red,
  default: COLORS.border.subtle,
};

// Button specs
export const BUTTON = {
  primary: {
    bg: COLORS.accent.DEFAULT,
    bgHover: COLORS.accent.hover,
    bgPress: '#6358D4',
    text: '#FFFFFF',
    border: 'rgba(255,255,255,0.1)',
    shadowHover: `0 4px 12px ${COLORS.accent.shadow}`,
  },
  secondary: {
    bg: 'transparent',
    bgHover: 'rgba(124,107,240,0.04)',
    border: COLORS.border.subtle,
    borderHover: COLORS.border.active,
    text: COLORS.text.secondary,
    textHover: COLORS.text.primary,
  },
  ghost: {
    bg: 'transparent',
    text: COLORS.text.tertiary,
    textHover: COLORS.text.secondary,
  },
  destructive: {
    borderHover: COLORS.semantic.red,
    textHover: COLORS.semantic.red,
  },
};

// Skeleton shimmer for loading states
export const SKELETON = {
  gradient: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)`,
  duration: '1.5s',
};
