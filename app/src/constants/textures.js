/**
 * Background Textures — Output VST-inspired surface patterns.
 *
 * Three texture layers that replace flat dead-black backgrounds:
 *   1. Topographic contours — organic flowing lines (NOVA/dark themes)
 *   2. Dot grid — precision engineering feel (Clarity themes)
 *   3. Noise grain — subtle film grain overlay (all themes, via CSS ::after)
 *
 * Architecture: inline SVG data URLs (same pattern as Nero's carbonTexture).
 * Applied via CSS background-image, composited behind content at low opacity.
 */

// ── Topographic Contour Lines ─────────────────────────────────
// Inspired by Output Thermal's flowing terrain lines.
// Organic concentric curves in ultra-subtle white, ~400x400 tile.
const topoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs><style>path{fill:none;stroke:rgba(255,255,255,0.018);stroke-width:0.6}</style></defs>
  <path d="M-20,200 Q80,120 200,140 T420,200"/>
  <path d="M-20,170 Q100,80 200,110 T420,170"/>
  <path d="M-20,230 Q60,160 200,170 T420,230"/>
  <path d="M-20,140 Q120,40 220,80 T420,140"/>
  <path d="M-20,260 Q40,200 180,200 T420,260"/>
  <path d="M-20,110 Q140,10 240,50 T420,110"/>
  <path d="M-20,290 Q20,240 160,230 T420,290"/>
  <path d="M-20,80 Q160,-20 260,30 T420,80"/>
  <path d="M-20,320 Q10,280 140,260 T420,320"/>
  <path d="M-20,50 Q180,-40 280,10 T420,50"/>
  <path d="M-20,350 Q-10,310 120,290 T420,350"/>
</svg>`;

export const TOPO_TEXTURE = `url("data:image/svg+xml,${encodeURIComponent(topoSvg)}")`;

// ── Dot Grid ──────────────────────────────────────────────────
// Precision engineering dot matrix — evenly spaced 1px dots.
// Clean, minimal, for professional light-ish themes.
const dotSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="0.6" fill="rgba(255,255,255,0.05)"/>
</svg>`;

export const DOT_TEXTURE = `url("data:image/svg+xml,${encodeURIComponent(dotSvg)}")`;

// ── Fine Dot Grid (for dark themes — sparser) ────────────────
const dotSparseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="0.5" fill="rgba(255,255,255,0.04)"/>
</svg>`;

export const DOT_SPARSE_TEXTURE = `url("data:image/svg+xml,${encodeURIComponent(dotSparseSvg)}")`;

// ── Noise Grain ───────────────────────────────────────────────
// Film grain overlay — fractal noise for subtle texture break.
// Applied globally via CSS ::after with mix-blend-mode: overlay.
// Uses feTurbulence SVG filter for true randomized grain.
const grainSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
  <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/></filter>
  <rect width="100%" height="100%" filter="url(#g)" opacity="0.08"/>
</svg>`;

export const NOISE_GRAIN = `url("data:image/svg+xml,${encodeURIComponent(grainSvg)}")`;

// ── Concentric Rings (alternate — like Output Movement) ──────
const ringsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs><style>circle{fill:none;stroke:rgba(255,255,255,0.025);stroke-width:0.5}</style></defs>
  <circle cx="200" cy="200" r="40"/>
  <circle cx="200" cy="200" r="70"/>
  <circle cx="200" cy="200" r="100"/>
  <circle cx="200" cy="200" r="130"/>
  <circle cx="200" cy="200" r="160"/>
  <circle cx="200" cy="200" r="190"/>
  <circle cx="200" cy="200" r="220"/>
  <circle cx="200" cy="200" r="250"/>
</svg>`;

export const RINGS_TEXTURE = `url("data:image/svg+xml,${encodeURIComponent(ringsSvg)}")`;
