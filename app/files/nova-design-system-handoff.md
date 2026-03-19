# Nova — Complete Design System Handoff
**Version 19 · Dashboard + Orb + Cursor + Create Estimate**
*For full-codebase implementation by a new Claude session*
*Reference file: `nova-dashboard-v19.html`*

---

## Table of Contents

1. Layout Blueprint
2. Sections & Components
3. Create Estimate — Full Spec
4. Intelligence Center Integration
5. What Moves / What's New / What Goes
6. Navigation & Interaction
7. Style & Design Tokens
8. **Nova Orb — Full Specification**
9. **Custom Cursor & Mouse System — Full Specification**
10. **Ambient Background System — Full Specification**
11. Audio System
12. Animation Principles

---

## 1. Layout Blueprint

### Grid

The dashboard is a **full-viewport locked grid** — `overflow: hidden` on both `html` and `body`. No page scroll. Everything visible simultaneously. This is a command center, not a document.

```
grid-template-columns: 256px 1fr 280px
grid-template-rows:     60px  1fr  52px
```

| Region | Grid Position | Role |
|---|---|---|
| Header | col 1–3, row 1 | Identity · Navigation · Global actions |
| Left Panel | col 1, row 2 | Projects · Create Estimate · Benchmarks |
| Center Panel | col 2, row 2 | Nova orb · Status · Ask · Estimate · Charts |
| Right Panel | col 3, row 2 | Market intelligence · Live material feed |
| Footer | col 1–3, row 3 | Status meta · Secondary actions |

### Fixed vs Scrollable

- Every region is `overflow: hidden`. Nothing scrolls except:
- **Live Material Feed** (`#ticker-inner`) — internal scroll via `translateY` on a child div (`#ticker-scroll`). The parent and label stay anchored; only `#ticker-scroll` moves via `requestAnimationFrame`.

### Minimum Viewport

**1440 × 900px.** Desktop-only for v1. No responsive breakpoints.

### Layer Stack

```
z-index  0    bg-canvas        (star field, nebulas — Canvas 2D)
         1    particle-canvas  (orb click particles — Canvas 2D)
         2    ambient blobs    (ghost nebulas, CSS divs)
         3    vignette         (radial darkening, fixed div)
         4    grain            (film grain SVG texture, fixed div)
        10    #app             (all UI — grid container)
      9998    #cursor-ring     (lerp-following ring)
      9999    #cursor          (precise dot)
```

### Spatial Depth Model

Three perceived planes — do not flatten them:

- **Background** — star field, nebulas, grain, vignette. Parallaxes ±3px with mouse.
- **Panels** — left and right wings recede slightly. Their inner edges (facing center) carry a faint violet bleed: `inset ±40px 0 80px rgba(109,40,217,.04)` — the orb casting light through the composition.
- **Center** — transparent background, no panel color. The orb floats forward. `filter: drop-shadow()` on `#nova-core` creates a real shadow on the layer below.

---

## 2. Sections & Components

### 2.1 Header

**Purpose:** Application chrome only. No data lives here.

**Height:** 60px, full width.

**Background:** `linear-gradient(180deg, rgba(12,11,20,.96) 0%, rgba(8,8,16,.55) 100%)`, `backdrop-filter: blur(28px)`. Bottom edge: `1px solid rgba(255,255,255,.05)`, shadow `0 1px 0 rgba(255,255,255,.07)`.

**Entrance:** `opacity: 0 → 1`, `translateY(12px → 0)`, delay `.25s`, duration `.9s`, `cubic-bezier(.16,1,.3,1)`.

**Left — Logo:**
- 28×28px canvas mini-orb (see §8 for orb spec — logo orb is a simplified 2-arm version)
- `box-shadow: 0 0 12px rgba(139,92,246,.3), 0 0 24px rgba(109,40,217,.15)` halo around logo canvas
- Wordmark: "NOVA" — Outfit weight-400, 13px, `letter-spacing: .32em`, uppercase. The `v` character: `color: #A78BFA`, `font-weight: 500`. Orb leads, wordmark follows.
- Live status dot: 5px circle, `background: #34D399`, `box-shadow: 0 0 7px rgba(52,211,153,.9)`, `animation: pulseDot 2.5s ease-in-out infinite` (opacity 1 → 0.3 → 1), `margin-left: 4px`

**Center — Primary Navigation:**
- Five items: **Dashboard · Inbox · Database · People · Settings**
- Layout: `display: flex`, `gap: 2px`
- Each item: icon (15×15 custom SVG) stacked above label (8.5px, weight-500, tracking `.1em`, uppercase). `padding: 6px 18px`, `border-radius: 8px`.
- **Default:** `color: rgba(238,237,245,.38)`, `border: 1px solid transparent`
- **Hover:** `color: rgba(238,237,245,.72)`, `background: rgba(255,255,255,.04)`, `border-color: rgba(255,255,255,.06)`
- **Active:** `color: rgba(238,237,245,.9)`, `background: rgba(139,92,246,.07)`, `border-color: rgba(139,92,246,.18)`. Plus: a 24px wide gradient glow line via `::after` at `bottom: -1px` — `background: linear-gradient(90deg, transparent, #A78BFA, transparent)`, `box-shadow: 0 0 8px #A78BFA`
- **Inbox badge:** 5px violet dot, `top: 4px; right: 12px`, `background: #A78BFA`, `box-shadow: 0 0 6px rgba(167,139,250,.8)`

**Right — Global Actions:**
- Search icon button (32×32, magnifying glass SVG)
- Notifications icon button (32×32, bell SVG) with 5px violet badge dot, `border: 1px solid rgba(6,6,12,.9)` (prevents color bleed into background)
- 1px divider: `height: 18px`, `background: rgba(255,255,255,.07)`, `margin: 0 4px`
- User avatar: 28px circle, `linear-gradient(135deg, #6D28D9 → #4C1D95)`, `border: 1px solid rgba(139,92,246,.4)`, initials 10px weight-600. Hover: `border-color: rgba(167,139,250,.65)`, `box-shadow: 0 0 16px rgba(109,40,217,.4)`
- All icon buttons: `border: 1px solid transparent` at rest → `rgba(255,255,255,.07)` hover, `background: transparent` → `rgba(255,255,255,.05)` hover

---

### 2.2 Left Panel — Projects Section

**Width:** 256px. **Background:** `linear-gradient(135deg, rgba(16,14,24,.88) → rgba(10,9,18,.82) → rgba(7,7,13,.6))`, `backdrop-filter: blur(32px) saturate(1.4)`. Right edge separator: `inset -1px 0 0 rgba(255,255,255,.04)`.

**Entrance:** `opacity: 0 → 1`, `translateX(-16px → 0)`, delay `.7s`, duration `.8s`.

**Section Header Row:**
- Label: "PROJECTS" — 9px, weight-600, tracking `.2em`, uppercase, `color: rgba(238,237,245,.38)`
- Right-aligned icon shortcut button: 24×24px, `border-radius: 7px`, `background: rgba(139,92,246,.1)`, `border: 1px solid rgba(139,92,246,.22)`. Houses the same composed estimate icon (document + pen nib + spark). Hover: scale 1.08, brighter border, brighter glow. This is a *shortcut* — the full CTA is the button below.

**Project List Card:**
All five project items live inside a single glass card — see §7 Glass Material System for the recipe. `padding: 6px`, `border-radius: 10px`.

Each project item: `padding: 10px 12px`, `border-radius: 8px`, `border: 1px solid transparent`.

- **Project name:** 12px, weight-600. Right-aligned **status dot** (5px) in the same flex row:
  - Active: `#34D399` with emerald glow
  - Bidding: `#F59E0B` with amber glow
  - Review: `rgba(238,237,245,.4)`, no glow
- **Meta row:** type description left + dollar value right (`color: #A78BFA`, weight-500), both 10px weight-400
- **Hover:** `border-color: rgba(255,255,255,.08)`. Radial violet glow fires from left edge via `::after` (`opacity: 0 → 1`)
- **Active item:** `border-color: rgba(139,92,246,.22)`, violet gradient background, name gains `text-shadow: 0 0 14px rgba(167,139,250,.35)`

**Click behavior:** `switchProject()` — orb intensity shifts per project value, cost bars wipe then refill sequentially, estimate number counts up (1100ms cubic ease), delta updates, Nova status updates.

---

### 2.3 Left Panel — Create Estimate Button

*(Full specification in §3)*

Positioned between the project list card and the benchmarks card. Full-width. This is the primary action in the left panel.

---

### 2.4 Left Panel — Benchmarks

**Position:** `margin-top: auto` — anchors to the bottom of the left panel.

Glass card, same material as project list. `padding: 12px`.

Four rows: **Cost / SF · Win Rate · Avg. Margin · Open Bids**

Each row: label (10px, `.48` opacity, flex-1) + 36×2px mini bar track + value (11px, weight-600, right-aligned, min-width 36px).

Mini bar gradients:
- Cost/SF: `#6D28D9 → #A78BFA` (violet)
- Win Rate: `#065F46 → #34D399` (emerald), value `color: #34D399` with glow
- Avg. Margin: `#92400E → #F59E0B` (amber), value `color: #F59E0B` with glow
- Open Bids: `rgba(255,255,255,.2) → rgba(255,255,255,.5)` (white)

Bar fill width = metric value as % of meaningful range. Fill transition: `1.4s cubic-bezier(.16,1,.3,1)` on mount.

---

### 2.5 Center Panel — Nova Orb

*(Full specification in §8)*

---

### 2.6 Center Panel — Nova Status + Subtle Ask

**Status line:** 10px, weight-300, italic, tracking `.09em`, `color: rgba(238,237,245,.55)`. Updates on every meaningful event. States include:
- `Intelligence online · Awaiting query` (idle)
- `Processing estimate…` (switching projects)
- `Estimate complete · Confidence 94%` (after switch)
- `Nova is listening…` (orb click)
- `Processing your query…` (ask submit)
- `Complete · Confidence 94%` (after response)

**Subtle ask input — 260px pill:**
- Rest: `border: 1px solid rgba(255,255,255,.07)`, `background: rgba(255,255,255,.025)` — barely there
- Focus: `border-color: rgba(139,92,246,.4)`, `background: rgba(139,92,246,.05)`, `box-shadow: 0 0 20px rgba(109,40,217,.12), 0 4px 16px rgba(0,0,0,.3)`
- Input: Outfit 10.5px, weight-300, italic, `caret-color: #A78BFA`
- Placeholder: *"What would you like to know."* italic, `color: rgba(238,237,245,.2)`
- Send arrow: 18px circle. Transparent at rest, `color: rgba(167,139,250,.4)`. On parent focus: `color: rgba(167,139,250,.8)`. Hover: scale 1.15.
- **Focus side effect:** `targetIntensity += .18` — the orb brightens, intelligence is listening
- **Blur side effect:** `targetIntensity -= .12`

**Response glass panel** (appears below ask input, `position: absolute`, `top: calc(100% + 12px)`):
- 340px wide
- `background: linear-gradient(160deg, rgba(22,18,36,.95) → rgba(12,10,24,.97))`, `backdrop-filter: blur(48px) saturate(1.8)`
- `border: 1px solid rgba(167,139,250,.18)`, `border-radius: 14px`
- `box-shadow: 0 24px 64px rgba(0,0,0,.7), 0 1px 0 rgba(255,255,255,.08) inset, 0 0 40px rgba(109,40,217,.12)`
- Top-left violet border glow via `::before` mask: `linear-gradient(155deg, rgba(167,139,250,.2) → rgba(139,92,246,.06) → transparent)`
- "Nova" label: 8.5px, weight-600, tracking `.18em`, uppercase, `color: #A78BFA`. Preceded by a 4px violet dot.
- Response text: 10.5px, weight-300, italic. Streams character-by-character at 20ms intervals.
- Enter/exit: `opacity` + `translateY(6px → 0)`, `.4s cubic-bezier(.16,1,.3,1)`. Auto-dismisses after 4.5s.

---

### 2.7 Center Panel — Estimate Display

**Project label:** 9px, weight-600, tracking `.22em`, uppercase, `color: rgba(238,237,245,.42)`.

**Estimate number:** 66px, weight-300, `color: #F5F3FF`, `letter-spacing: -.04em`.
Four-layer `text-shadow`:
```
0 0 60px rgba(139,92,246,.2),
0 0 120px rgba(109,40,217,.1),
0 3px 6px rgba(0,0,0,.55),
0 1px 2px rgba(0,0,0,.7)
```
- Dollar sign: 26px, `color: #A78BFA`, `vertical-align: 18px`, weight-400, own glow shadow
- Cents (`.00`): 20px, `color: rgba(238,237,245,.36)`, `vertical-align: 4px`, weight-300 — present but subordinate

**Delta row:** 10px, weight-500, tracking `.07em`. Up: `#34D399`, Down: `#FB7185`, Neutral: `rgba(238,237,245,.52)`. Triangle character prefix.

**On project switch:** `counter()` function — cubic ease `1-(1-p)^4`, 1100ms, from previous displayed value to new value. Creates the sensation that Nova is computing, not just displaying.

---

### 2.8 Center Panel — Trade Cost Breakdown

Glass card, `padding: 14px`, `border-radius: 10px`. Five rows.

Each row: label (84px, right-aligned, 9.5px, `.48` opacity) + bar track (`flex: 1`, 3px tall, `background: rgba(255,255,255,.06)`, `border-radius: 3px`) + dollar value (64px, right-aligned, 10px).

Bar fills (2px, each with `box-shadow` glow):
| Trade | Gradient | Glow |
|---|---|---|
| Concrete | `#312E81 → #6366F1` | `rgba(99,102,241,.55)` |
| Framing | `#92400E → #F59E0B` | `rgba(245,158,11,.45)` |
| MEP Systems | `#065F46 → #34D399` | `rgba(52,211,153,.5)` |
| Finishes | `#9F1239 → #FB7185` | `rgba(251,113,133,.45)` |
| GC / OHP | `#1E3A5F → #64A9D9` | `rgba(100,169,217,.35)` |

**On project switch:** All bars `scaleX(0)` first (`transition: .3s ease-in`), then refill sequentially with 52ms stagger, each `cubic-bezier(.16,1,.3,1)`.

---

### 2.9 Center Panel — Industry Trends Chart

Glass card, `border-radius: 10px`. Chart canvas `height: 108px`.

Header row: "INDUSTRY TRENDS" (9px, tracking `.2em`, uppercase, `.44` opacity) + three legend dots + labels.

**Rendering:**
- No grid lines — atmospheric radial glow from center replaces them
- Lines use Catmull-Rom spline (`tension: 0.4`) for organic curves
- Under-curve gradient fill: strong near line, transparent at bottom
- Terminal dots: pulsing orb (`radius: 7 × sin-pulse`) + core (2.2px) + white highlight at `(-0.6, -0.6)` — mirrors main orb language
- Chart "breathes": vertical padding oscillates `2 + 2×sin(trendT × 0.8)`
- **Whisper link:** Rising cost/materials data drives `nebulaWhisper` (0–1), which increases ambient nebula glow. Data influences atmosphere without using words.

Colors: Cost Index `#A78BFA` · Labor `#34D399` · Materials `#FB7185`

Updates: every 3.2s, small random drift on all series.

---

### 2.10 Right Panel — Market Intelligence Cards

**Width:** 280px. Same panel background and entrance treatment as left panel (mirrored gradient direction).

Three glass cards, `gap: 12px`.

Per card: `padding: 14px`, hover `translateY(-1px)` + enhanced shadow.
- Label: 9px, weight-600, tracking `.14em`, uppercase, `.48` opacity
- Value: 26px, weight-300, `color: #F4F2FF`. Unit suffix 14px, `.4` opacity, weight-300
- Sub-label: 9.5px, `.5` opacity
- Badge pill: 8.5px, weight-600, `border-radius: 20px`, `min-width: 38px`, centered text

**Live heartbeat:** Every 3.8–5.8s, one randomly chosen `.intel-value` element briefly brightens — `color: #fff`, `text-shadow: 0 0 20px rgba(255,255,255,.35), 0 0 40px rgba(167,139,250,.2)`. Transition `.4s`. No animation — CSS class toggle (`pulsing` → removed after 700ms).

Cards:
| Label | Value | Unit | Source |
|---|---|---|---|
| Concrete · NYC Metro | 188 | /CY | FRED WPUSI012011 |
| Labor · Carpenter | 92 | /hr | BLS prevailing wage |
| Steel · HSS Tube | 0.84 | /lb | Commodity market API |

---

### 2.11 Right Panel — Live Material Feed

Glass card, `flex: 1`, fills remaining height after the three intel cards.

Internal header "LIVE MATERIAL FEED": `section-label` style, `padding-bottom: 8px`, `border-bottom: 1px solid rgba(255,255,255,.05)`. This label is intentionally kept — it distinguishes the feed from the cards above.

Scroll: `#ticker-inner` clips, `#ticker-scroll` moves via `translateY` (not CSS scroll), `requestAnimationFrame` loop, increment `0.38px` per frame, resets when `tickY >= 33 × item_count`.

Row: name (10px, `.52` opacity) + price (10px, weight-500, `.82` opacity) + change pill.

Change pills (8.5px, weight-600, `border-radius: 20px`, `min-width: 38px`):
- Up: `color: #34D399`, `background: rgba(52,211,153,.1)`, `border: 1px solid rgba(52,211,153,.2)`
- Down: rose treatment
- Flat: `color: rgba(238,237,245,.35)`, white-dim background, neutral border

---

### 2.12 Footer

**Height:** 52px. **Background:** `linear-gradient(180deg, rgba(14,12,22,.82) → rgba(8,8,16,.96))`, `backdrop-filter: blur(32px) saturate(1.4)`. Top border: `1px solid rgba(255,255,255,.05)`.

Left: meta text row — "Last sync N min ago · RSMeans 2024 · NYC Metro · 847 indices monitored". 8.5px, weight-400, `.28` opacity, emphasized values at `.42`. Separator dots at `.18` opacity.

Right: Export PDF — ghost button, `9px`, `padding: 4px 12px`, `opacity: .5`. Secondary action, styled to recede. No primary action in footer.

**Entrance:** delay `1.8s`.

---

## 3. Create Estimate — Full Specification

### Purpose

The primary action button for beginning a new estimate. Not "Generate Estimate" (AI one-click) — "Create Estimate" (user-initiated flow). The distinction is intentional: the dashboard observes and informs; creation is a deliberate act.

### Placement

Full-width block in the **left panel**, between the project list card and the benchmarks card. The user's eye travels: scan projects → decide to create → button is right there → benchmarks below for context.

A second, smaller version (24×24px icon-only) exists in the section header row as a **keyboard-shortcut-style affordance** for power users who don't need to read the button.

### Full Button Spec

**Dimensions:** Full width of left panel content area. Height: `auto` based on padding (`10px 14px`). `border-radius: 10px`.

**Background:** `linear-gradient(145deg, rgba(18,16,28,.8) → rgba(10,9,18,.7))` — same glass DNA as the cards around it, but with a violet-tinted border that distinguishes it as an action.

**Border:** `1px solid rgba(139,92,246,.2)` at rest → `rgba(139,92,246,.42)` on hover. Also has the `::before` gradient border mask (same as all glass cards) for the top-edge light catch.

**Box shadow:**
```
rest:  0 2px 12px rgba(0,0,0,.3), 0 1px 0 rgba(255,255,255,.06) inset
hover: 0 4px 20px rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.08) inset, 0 0 20px rgba(109,40,217,.15)
```

**Hover shimmer:** `::after` pseudo-element — a 60%-wide diagonal light band sweeps left to right on hover. `background: linear-gradient(90deg, transparent, rgba(167,139,250,.08), transparent)`. Triggered via `left: -100% → 140%` transition on hover, `.5s cubic-bezier(.16,1,.3,1)`.

**Hover lift:** `transform: translateY(-1px)`.

**Active press:** `transform: translateY(0)`.

### Internal Layout

Three elements in a `flex` row:

**1. Icon container (left) — 28×28px:**
- `border-radius: 7px`
- `background: rgba(139,92,246,.15)` → `rgba(139,92,246,.28)` on button hover
- `border: 1px solid rgba(139,92,246,.28)` → `rgba(167,139,250,.5)` on hover
- `box-shadow: 0 0 8px rgba(109,40,217,.1)` → `0 0 14px rgba(109,40,217,.25)` on hover
- Contains the composed estimate icon SVG at 14×14px

**2. Text stack (center, flex-1):**
- Primary label: "Create Estimate" — 10.5px, weight-600, tracking `.1em`, uppercase, `color: rgba(238,237,245,.7)` → `.95` on hover
- Sub-label: "New project · AI-powered" — 8.5px, weight-400, tracking `.04em`, `color: rgba(238,237,245,.35)`, `text-transform: none`

**3. Arrow (right, auto margin):**
- `color: rgba(167,139,250,.3)` → `.7` on hover
- `transform: translateX(0) → translateX(2px)` on hover, `cubic-bezier(.34,1.56,.64,1)` (slight spring overshoot)
- 12×12px rightward chevron SVG (`→`)

### Composed Icon — SVG Specification

The icon is a 15×15px composed mark. **Not a generic plus sign.** It communicates "new estimate document" through three visual elements that read as a single intentional mark:

**Element 1 — Document page with folded corner:**
```
Path: M3 1.5h6.5L12 4v9.5H3z
stroke-width: 1.1
fill: rgba(167,139,250,.07)   ← very faint violet tint in the page body
```
Corner fold crease:
```
Path: M9.5 1.5V4H12
stroke-width: 1, opacity: .6
```

**Element 2 — Ruled lines (estimate rows):**
```
Path: M5 6.5h5  M5 8.5h5  M5 10.5h3
stroke-width: 1, opacity: .45
```
Three lines — two full-width, one shorter — suggests a list of line items. The shorter one implies more below. This is what makes the icon read as an estimate, not just a document.

**Element 3 — Pen nib (angled, overlapping lower-right):**
```
Path: M9.5 9.5l3-3 1 1-3 3z   ← nib body (parallelogram)
stroke-width: 1.1
fill: rgba(167,139,250,.15)

Path: M9.5 12.5l-.5-3 1 1z    ← ink drop at tip
stroke-width: 1, opacity: .5
```
The pen overlaps the document's lower-right corner — the nib is actively writing. This is what makes the button feel like "create" rather than "view."

**Element 4 — Spark at pen tip (hover-reveal):**
```html
<g class="icon-spark">
  <circle cx="12" cy="6.8" r=".5" fill="currentColor" opacity=".9"/>
  <path d="M12.8 5.8l.5-.5  M13.2 6.8h.6  M12.8 7.8l.4.4"
        stroke-width=".9" opacity=".7"/>
</g>
```
Three radiating lines + one dot at the pen tip. Hidden at rest (`opacity: 0`). On hover: `opacity: 1`, `transform: translate(1px,-1px) scale(1.1)`, `transition: .22s cubic-bezier(.34,1.56,.64,1)`. Suggests the moment of creation — a spark as the pen touches paper.

### Click Behavior

- Audio: `clickSound()`
- Orb: `orbHoverPulse()` — brief intensity spike, returns to previous level in 420ms
- Navigation: `→ /estimates/new` (or open creation modal — TBD by implementation)

### Cursor Behavior

Cursor ring expands to 44px (hovering state) when over this button. The custom cursor applies throughout the app — see §9.

---

## 4. Intelligence Center Integration

### Dashboard = Preview Layer

The dashboard shows live snapshots. The Intelligence page shows history, filters, and depth. Every intelligence widget on the dashboard is a **tappable preview** that navigates to the full Intelligence page with that section in focus.

### What Lives on the Dashboard

- Market Intel cards — latest spot price only, no history
- Industry Trends chart — last 30 data points, live drift
- Live Material Feed — abbreviated ticker
- Benchmarks — aggregated KPIs, not drill-down
- Nova Ask — short conceptual responses only

### What Lives on `/intelligence`

- Full multi-year cost index history
- Expanded material database with search/filter
- Nova-generated market analysis reports
- Regional comparison tools
- Custom benchmark editing

### Integration Pattern

Each right-panel card and the trend chart should navigate to `/intelligence` with the relevant section focused. The Nova Ask response panel should include a "View full analysis →" link when appropriate.

---

## 5. What Moves / What's New / What Goes

### KEEP

Project list with status dots, estimate number with count-up, trade cost bars with sequential fill, industry trends chart, market intelligence cards with heartbeat pulse, live material feed, benchmarks, Nova orb, Nova status line, custom cursor system, star field with parallax, ambient nebulas with whisper system, orb click listening state, project switch audio ping, header nav, global action buttons.

### REMOVE (do not re-introduce)

- ~~Generate Estimate floating pill~~ — wrong action, wrong position
- ~~Fixed query bar at bottom of screen~~ — replaced by subtle ask under orb
- ~~"Nova Core" label~~ — orb speaks for itself
- ~~Section labels (Active Projects, Market Intelligence, etc.)~~ — cards communicate themselves
- ~~Labor/Materials/Cost RSI pods in header~~ — data doesn't belong in chrome
- ~~Rotating briefing text in header~~ — replaced by nav

### NEW IN V19

- **Create Estimate full button** — glass card button with icon container, text stack, arrow, shimmer sweep
- **Create Estimate icon shortcut** — 24×24px in section header
- All v18 additions remain: subtle ask input, response glass panel, mouse parallax, intel heartbeat, status dots, orb light physics on panel edges, third orbital ring, query thinking state, count-up animation

---

## 6. Navigation & Interaction

### Route

Replaces current Dashboard at `/`. Same URL, upgraded view.

### Tabs / Filters / View Toggles

None on the dashboard. Single unified view.

### Click-Through Map

| Element | Behavior |
|---|---|
| Project item | `switchProject()` — in-place update |
| Create Estimate (full button) | Navigate to `/estimates/new` |
| Create Estimate (icon shortcut) | Same as above |
| Market Intel card | Navigate to `/intelligence` with card section focused |
| Industry Trends chart | Navigate to `/intelligence#trends` |
| Nova orb | "Listening" state + audio ping |
| Nova ask send / Enter | Submit query, stream response in glass panel |
| Nav items | Switch view / navigate to section route |
| Notification button | Navigate to `/inbox` or open notifications panel |
| User avatar | Open account menu |
| Footer Export PDF | Trigger PDF export of active estimate |

---

## 7. Style & Design Tokens

### Font

**Outfit** (Google Fonts). Weights loaded: 300, 400, 500, 600, 700, 800. No other fonts. No system font fallbacks in the UI itself.

### Type Scale

| Size | Weight | Use |
|---|---|---|
| 66px | 300 | Estimate number (dominant) |
| 26px | 300 | Market intel values |
| 13px | 400 | Logo wordmark |
| 12px | 600 | Project names in list |
| 11px | 500 | Stat values, query input |
| 10.5px | 600 | Create Estimate label |
| 10.5px | 300 italic | Ask input, response text |
| 10px | 300 italic | Nova status |
| 9.5px | 400 | Card sub-labels, legend |
| 9px | 600 | Card labels, chart titles (all uppercase, tracked) |
| 8.5px | 500 | Nav labels, badge text, footer meta |
| 8.5px | 400 | Button sub-labels |

### Color Tokens

```css
--void:          #06060C          /* page background — near-black, slight violet cast */
--violet:        #8B5CF6          /* primary accent */
--violet-bright: #A78BFA          /* active states, highlights */
--violet-dim:    #6D28D9          /* deep violet, orb core, button gradients */
--lavender:      #C4B5FD          /* soft violet, orbital satellites */
--white:         #EEEDF5          /* primary text */
--white-dim:     rgba(238,237,245,0.38)
--white-faint:   rgba(238,237,245,0.07)
--emerald:       #34D399          /* up / active / positive */
--rose:          #FB7185          /* down / negative / alert */
```

Amber (`#F59E0B`) — used for bidding status dot and margin benchmark. Not in root vars, applied inline.

### Glass Material System

Every card/panel uses this exact recipe. Do not use plain `border` for card edges — use the `::before` mask technique.

```css
/* 1. Background */
background: linear-gradient(145deg, rgba(18,16,28,.75) 0%, rgba(10,9,18,.65) 100%);

/* 2. Top-edge light catch via ::before */
.card::before {
  content: ''; position: absolute; inset: 0;
  border-radius: inherit; padding: 1px;
  background: linear-gradient(155deg,
    rgba(255,255,255,.08) 0%,
    rgba(255,255,255,.02) 50%,
    transparent 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

/* 3. Elevation + top highlight */
box-shadow:
  0 2px 12px rgba(0,0,0,.3),
  0 1px 0 rgba(255,255,255,.06) inset;

/* 4. Standard dimensions */
border-radius: 10px;
```

For panels (header, left/right panel): `backdrop-filter: blur(32px) saturate(1.4)`.
For response panel: `backdrop-filter: blur(48px) saturate(1.8)`.

---

## 8. Nova Orb — Full Specification

The orb is the soul of the product. It is a living intelligence indicator — not decorative. Every state change in the app should consider whether the orb should respond. It runs on `requestAnimationFrame` at all times and is never static.

### Two Instances

**1. Main Orb** (`#nova-core`, `#orb-canvas`) — 160×160px canvas. Center panel. The primary intelligence instrument.

**2. Logo Orb** (`#logo-orb-c`) — 28×28px canvas. Header left. A miniature version with the same visual language but simplified rendering. Runs independently.

### Main Orb — HTML Structure

```html
<div id="nova-core">
  <div class="orb-halo" id="orb-halo"></div>
  <div class="orb-ring-a" id="orb-ring-a"></div>
  <div class="orb-ring-b"></div>
  <div class="orb-ring-c"></div>
  <canvas id="orb-canvas" width="320" height="320"></canvas>
</div>
```

**Container `#nova-core`:**
- `width: 160px; height: 160px`
- `perspective: 600px; transform-style: preserve-3d` — required for equatorial ring 3D rotation
- `filter: drop-shadow(0 20px 60px rgba(109,40,217,.35)) drop-shadow(0 8px 24px rgba(0,0,0,.55)) drop-shadow(0 0 80px rgba(139,92,246,.15))` — three-layer shadow creates light physics below the orb

### Orbital Rings

**Ring A** (`orb-ring-a`):
- `position: absolute; border-radius: 50%; inset: -10px`
- `border: 1px solid rgba(139,92,246,.13)`
- `animation: spinSlow 22s linear infinite` (clockwise)
- Satellite: `::after` — 6×6px circle at `top: -3px; left: calc(50% - 3px)`, `background: #A78BFA`, `box-shadow: 0 0 10px #8B5CF6, 0 0 20px rgba(139,92,246,.5)`
- Brightness responds to `orbIntensity`: `border-color` updates in JS to `rgba(139,92,246, ${.13 * orbGlow})`

**Ring B** (`orb-ring-b`):
- `inset: 8px`
- `border: 1px solid rgba(167,139,250,.07)`
- `animation: spinSlow 15s linear infinite reverse` (counter-clockwise)
- Satellite: `::after` — 4×4px at `bottom: -2px; right: 22%`, `background: #C4B5FD`, `box-shadow: 0 0 7px rgba(221,214,254,.8)`

**Ring C** (`orb-ring-c`) — equatorial plane:
- `inset: -4px`
- `border-top: 1px solid transparent; border-bottom: 1px solid transparent`
- `border-left: 1px solid rgba(167,139,250,.12); border-right: 1px solid rgba(167,139,250,.12)`
- `transform: rotateX(72deg)` — tilted to equatorial plane
- `animation: spinSlow 34s linear infinite`
- This ring exists purely to give the orb **planetary mass** — it reads as weight, not as decoration. The parent's `perspective: 600px` is required.

**Halo** (`orb-halo`):
- `position: absolute; border-radius: 50%`
- `background: radial-gradient(circle, rgba(109,40,217,.2) 0%, transparent 70%)`
- `animation: breatheOrb 5s ease-in-out infinite` — `scale(1 → 1.1)`, `opacity(1 → .72)`
- `inset` value is updated in JS based on `orbGlow`: `hi = Math.round(-28 - (orbGlow - 1) * 22)` px

### Canvas Rendering — Main Orb

Canvas is `320×320` internal, displayed at `160×160` CSS. All drawing in the internal coordinate space.

**Layer 1 — Base void:**
```javascript
const base = ctx.createRadialGradient(OCX, OCY, 0, OCX, OCY, OCX);
base.addColorStop(0,   '#18063C');
base.addColorStop(.42, '#0A031A');
base.addColorStop(.82, '#060210');
base.addColorStop(1,   '#020108');
// Fill full circle
```

**Layer 2 — Four rotating arms:**
Four radial gradients whose source point rotates around the center. The arms are the orb's primary visual energy.
```javascript
const arms = [
  { angle: orbT,              color: `rgba(115,45,235,${.78 * orbIntensity})`,  radius: OCX * .88 },
  { angle: orbT + Math.PI,    color: `rgba(155,85,255,${.58 * orbIntensity})`,  radius: OCX * .74 },
  { angle: orbT + Math.PI*.55,color: `rgba(95,35,210,${.46 * orbIntensity})`,   radius: OCX * .6  },
  { angle: orbT + Math.PI*1.4,color: `rgba(185,135,255,${.32 * orbIntensity})`, radius: OCX * .5  },
];
// Each arm: radialGradient from center toward (cos(angle)*radius, sin(angle)*radius)
// Fill: source stop = arm.color, outer stop = 'rgba(70,15,180,0)'
```

**Layer 3 — Bloom (primary glow):**
```javascript
const bloom = ctx.createRadialGradient(OCX, OCY, 0, OCX, OCY, OCX * .58);
bloom.addColorStop(0,   `rgba(215,175,255,${.88 * orbIntensity})`);
bloom.addColorStop(.18, `rgba(150,78,255,${.68 * orbIntensity})`);
bloom.addColorStop(.5,  `rgba(90,24,220,${.36 * orbIntensity})`);
bloom.addColorStop(1,   'rgba(60,10,160,0)');
```

**Layer 4 — Core (bright white center):**
```javascript
const cp = .14 + .03 * Math.sin(orbT * 1.9); // pulsing size
const core = ctx.createRadialGradient(OCX, OCY, 0, OCX, OCY, OCX * cp);
core.addColorStop(0,   'rgba(255,255,255,1)');
core.addColorStop(.35, `rgba(240,215,255,${.92 * orbIntensity})`);
core.addColorStop(.75, `rgba(175,115,255,${.4 * orbIntensity})`);
core.addColorStop(1,   'rgba(120,55,220,0)');
// Fill only within the small core radius
```

**Layer 5 — Edge vignette:**
```javascript
const vig = ctx.createRadialGradient(OCX, OCY, OCX * .62, OCX, OCY, OCX);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(1, 'rgba(2,1,8,.74)');
// Darkens the edges, makes orb read as a sphere not a flat disc
```

**Layer 6 — Exhale bloom (conditional):**
When `orbExhaling === true`, a radial bloom ring expands outward:
```javascript
const ep = 1 - Math.pow(1 - exhaleProgress, 3); // ease out
const bloomR = OCX * (1.1 + ep * 1.8);
const bloomAlpha = (1 - ep) * 0.22;
// radialGradient from OCX*.8 to bloomR, violet → transparent
// exhaleProgress increments by .018 per frame, stops at 1.0
```

### State Variables

```javascript
let orbIntensity   = 0.7;  // 0–1, current rendered intensity
let targetIntensity = 0.7; // lerp target
let orbSpeed       = 1.0;  // rotation speed multiplier
let targetSpeed    = 1.0;
let orbGlow        = 1.0;  // halo radius multiplier
let targetGlow     = 1.0;

// All lerped per frame: value += (target - value) * 0.04
```

### State Transitions

**`setOrbForValue(v)`** — called when a project is selected:
```javascript
const t = clamp((v - 920000) / (8750000 - 920000), 0, 1);
targetIntensity = .50 + t * .50;   // 0.5 at min value, 1.0 at max
targetSpeed     = .65 + t * .85;   // slower for small projects
targetGlow      = .88 + t * .52;   // tighter halo for small projects
ambientHue      = 256 + t * 16;    // background warms slightly
```

**`orbExhale()`** — when an answer/estimate lands:
- Sets `orbExhaling = true`, `exhaleProgress = 0`
- After 800ms: `targetIntensity = max(.44, targetIntensity - .18)`

**`orbHoverPulse()`** — on hover of project items, Create Estimate button:
- `targetIntensity = min(1, targetIntensity + .14)`
- After 420ms: restore previous target

**Focus on ask input:**
- `targetIntensity = min(1, targetIntensity + .18)`
- On blur: `targetIntensity = max(.44, targetIntensity - .12)`

**Orb click:**
- Status → "Nova is listening…", `targetIntensity += .22`
- After 2200ms: `targetIntensity -= .22`, status → idle text

### Logo Orb — Simplified Rendering

28×28px canvas (`60×60` internal). Two-arm version only:
- Base: `radialGradient` `#1E0845 → #03010C`
- Two arms at `logoT` and `logoT + Math.PI`, colors `rgba(125,55,250,.72)` and `rgba(165,95,255,.52)`
- Bloom: `radialGradient` to `OCX*.46`, `rgba(215,175,255,.9) → transparent`
- Core: `radialGradient` to `OCX*.13`, `rgba(255,255,255,1) → rgba(180,125,255,0)`, fill small circle
- Rotation speed: `logoT += .014` per frame (slightly slower than main orb)

### Applying the Orb Language Across the App

The orb establishes a **visual language** that should appear elsewhere:

1. **Terminal dots on charts** — each line's end point uses the same layered dot: outer pulsing glow ring, 2.2px core, white highlight at (-0.6, -0.6). This makes charts feel like they share the orb's energy.

2. **Pulse rings on active elements** — a circular ring that expands and fades, used on the Nova ask input focus state and any "active/listening" component.

3. **Exhale pattern** — when anything "completes" (save, generate, send), a brief radial bloom should expand and fade. Not just a checkmark — a release of energy.

4. **Intensity metaphor** — any AI-driven component can have an intensity level: brighter = more active/confident, dimmer = waiting/uncertain. Use `box-shadow` glow to communicate this.

5. **Violet bloom** — `rgba(109,40,217, x)` radial glows are the orb's signature. Use them sparingly but consistently for anything that relates to Nova's intelligence.

---

## 9. Custom Cursor & Mouse System — Full Specification

The cursor is a **two-part system** — a precise dot that follows the mouse exactly, and a larger ring that lags behind with lerp smoothing. Together they create a sense of physical presence and intelligence.

### Why It Exists

Default browser cursors are generic. The custom cursor communicates that this software has a point of view. The violet dot says "this is Nova's space." The ring's lag creates a feeling of weight — the cursor isn't instant, it has momentum.

**This system should be applied to the entire application**, not just the dashboard.

### HTML

```html
<div id="cursor"></div>
<div id="cursor-ring"></div>
```

Both are `position: fixed`, `pointer-events: none`, `z-index: 9998/9999`. Set `cursor: none` on `html, body`.

### The Dot (`#cursor`)

```css
#cursor {
  position: fixed;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--violet-bright);   /* #A78BFA */
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
  box-shadow:
    0 0 10px var(--violet),           /* #8B5CF6 */
    0 0 22px rgba(139,92,246,.35);
}
```

Positioned via JS at exact mouse coordinates:
```javascript
curEl.style.left = e.clientX + 'px';
curEl.style.top  = e.clientY + 'px';
```

**No transition on the dot.** It must be instantaneous. Any lag on the dot feels wrong.

### The Ring (`#cursor-ring`)

```css
#cursor-ring {
  position: fixed;
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,.14);
  pointer-events: none;
  z-index: 9998;
  transform: translate(-50%, -50%);
  transition:
    width  .3s cubic-bezier(.34,1.56,.64,1),
    height .3s cubic-bezier(.34,1.56,.64,1),
    border-color .2s;
}
#cursor-ring.hovering {
  width: 44px; height: 44px;
  border-color: rgba(255,255,255,.3);
}
```

**Lerp-based position** — the ring follows the dot with easing, creating physical lag:
```javascript
let rx = 0, ry = 0;  // ring position
(function lerpRing() {
  rx += (mx - rx) * 0.10;  // 10% of distance per frame
  ry += (my - ry) * 0.10;
  ringEl.style.left = rx + 'px';
  ringEl.style.top  = ry + 'px';
  requestAnimationFrame(lerpRing);
})();
```

**Lerp factor `0.10`** — this specific value creates the right feel. Lower = more lag (dreamy but imprecise). Higher = snappier (less distinctive). Do not change without careful testing.

### Hover State

Elements that should expand the ring to `hovering` state (44px, brighter border):

```javascript
const hoverTargets = document.querySelectorAll(
  '.project-item, .intel-card, button, #nova-core, .create-estimate-full'
);
hoverTargets.forEach(el => {
  el.addEventListener('mouseenter', () => ringEl.classList.add('hovering'));
  el.addEventListener('mouseleave', () => ringEl.classList.remove('hovering'));
});
```

**Apply this to all interactive elements across the app:**
- All buttons
- All clickable cards
- All navigation items
- All form inputs (on focus, not just hover — ring should expand when input is active)
- Any element with `cursor: pointer`

### Click Ripple

On every click anywhere in the document, a circular ripple expands from the click point:

```css
.ripple {
  position: fixed;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,.18);
  pointer-events: none;
  z-index: 15;
  animation: rippleOut .75s ease-out forwards;
}
@keyframes rippleOut {
  from { transform: translate(-50%,-50%) scale(0); opacity: 1; }
  to   { transform: translate(-50%,-50%) scale(4); opacity: 0; }
}
```

```javascript
document.addEventListener('click', e => {
  const r = document.createElement('div');
  r.className = 'ripple';
  r.style.cssText = `left:${e.clientX}px; top:${e.clientY}px; width:48px; height:48px;`;
  document.body.appendChild(r);
  r.addEventListener('animationend', () => r.remove());
});
```

The ripple starts at 48×48 (centered on click) and expands to 4× size (192px diameter), fading out. It's subtle — `rgba(255,255,255,.18)` — not a loud flash.

### Mouse Trail Particles

On `mousemove`, small particles have a 22% chance of spawning:

```javascript
function maybeSpawnPfx(x, y) {
  if (Math.random() > 0.22) return;  // 78% of moves: no particle
  PFX.push({
    x, y,
    vx: (Math.random() - .5) * 1.1,
    vy: (Math.random() - .5) * 1.1 - .25,  // slight upward bias
    life: 1,
    decay: .048 + Math.random() * .028,
    r: .8 + Math.random() * 1.4,
    hue: 255 + Math.random() * 35   // violet range: 255–290
  });
}
```

Particles rendered on a separate canvas layer (`particle-canvas`, z-index 1):
```javascript
// Per particle per frame:
p.x  += p.vx;
p.y  += p.vy;
p.vy -= .012;      // gravity
p.life -= p.decay;
// Draw: circle at (p.x, p.y), radius (p.r * p.life)
// Color: hsla(p.hue, 75%, 72%, p.life * .45)
```

Particles live ~20–42 frames (at 60fps: 0.3–0.7 seconds). They're barely visible — `opacity * .45` on a 1–2px circle. The effect is a faint violet shimmer that follows deliberate mouse movements. Do not increase density or size — subtlety is essential.

### Applying the Cursor Across the App

**Every page** should include:
1. `#cursor` and `#cursor-ring` DOM elements
2. `cursor: none` on `html, body`
3. The `lerpRing` animation loop
4. The `hovering` class toggle on all interactive elements
5. The click ripple event listener
6. The particle canvas and `maybeSpawnPfx` call on `mousemove`

**Page transitions** — when navigating between pages, the cursor system should persist without reinitializing. In a React/Next.js app, the cursor components should live in a root layout, not within individual pages.

**Input fields** — when a text input has focus, expand the ring (`hovering` class) even without mouse hover. The ring communicates "something is active here."

**Loading states** — when a page or component is loading, consider rotating the cursor ring slowly (`animation: spin 2s linear infinite`). Returns to normal on load complete.

**Cursor ring for Nova AI states** — when Nova is actively processing a query anywhere in the app, the cursor ring should pulse with a violet glow: `box-shadow: 0 0 12px rgba(139,92,246,.4)`. This creates a global "Nova is thinking" affordance visible regardless of where the cursor is on screen.

---

## 10. Ambient Background System — Full Specification

The background is not decoration. It is a data-responsive atmosphere that changes based on market conditions.

### Structure

Four fixed layers below the app:

**Layer 1 — Star field (`bg-canvas`, z:0):**
320 stars, two populations:
- 62% cool (`rgba(218,220,235, alpha)`) — blue-white, young stars
- 38% warm (`rgba(238,224,210, alpha)`) — cream-amber, ancient red-shifted
- 4% bright anchors (`r > 1.0`) — get diffraction halos: `createRadialGradient` at `r*5` radius
- Each star has a `phase` offset for independent twinkle: `a_rendered = a * (0.42 + 0.58 * sin(bgT * 0.7 + phase))`

**Mouse parallax:** `bgX.save()`, `bgX.translate(prlxX, prlxY)` before drawing stars, `bgX.restore()` after. Only stars parallax — nebulas are on a different perceived depth layer and do not parallax.
```javascript
prlxX = ((innerWidth/2 - mx) / innerWidth)  * 3;
prlxY = ((innerHeight/2 - my) / innerHeight) * 3;
```

**Layer 2 — Ghost nebulas (6 entities, moving slowly):**
Each nebula: position, slow velocity (`±0.00007` per frame), reverses at 8%/92% edges. Drawn as `createRadialGradient` from position, radius `220 + nebulaWhisper * 52` px. The two nearest nebulas (`ni < 2`) receive a `whisperBoost = nebulaWhisper * 0.022` alpha boost.

**Faint grid:** `88px` spacing, `rgba(255,255,255,.018)`, `lineWidth: .5`. Suggests a technical drawing overlay without competing with content.

**Layer 3 — Ambient blobs (CSS, z:2):**
Three `position: fixed` divs with `border-radius: 50%` and `filter: blur(80px)`:
- `#amb-1`: 580×580px, upper-right, `rgba(90,50,180,.016)`, `animation: drift 22s infinite alternate`
- `#amb-2`: 420×420px, lower-left, `rgba(40,60,120,.014)`, `animation: drift 28s infinite alternate-reverse`
- `#amb-3`: 320×320px, centered, `rgba(139,92,246,.018)`, `animation: breatheAmb 8s infinite` (scale 1 → 1.08)

**Layer 4 — Vignette (z:3):** `radial-gradient(ellipse at center, transparent 36%, rgba(2,1,10,.7) 100%)`

**Layer 5 — Grain (z:4):** `opacity: .02`, fractal noise SVG (`feTurbulence baseFrequency='.9' numOctaves='4'`), covers full viewport.

### The Whisper System

This is the most novel element in the design. Market data directly influences the ambient atmosphere — the background is a data visualization at the lowest possible opacity.

```javascript
// Every 3.2s, after trend data updates:
const costLast = TD.cost[TD.cost.length - 1];
const matLast  = TD.materials[TD.materials.length - 1];
const targetWhisper = clamp(
  ((costLast - 102) / 7)   * 0.65 +  // cost index 102–109 maps to 0–0.65
  ((matLast  - 96)  / 4.5) * 0.45,   // materials 96–100.5 maps to 0–0.45
  0, 1
);
nebulaWhisper += (targetWhisper - nebulaWhisper) * 0.14; // gentle lerp
```

Rising cost/materials data → higher `nebulaWhisper` → nebulas brighten and grow → the room warms. This happens too slowly to notice in real time, but after watching for a few minutes, you feel it. The dashboard is telling you something without using words.

**Apply this pattern everywhere data changes atmosphere.** In the Estimate page, perhaps the background warms when margin is below average. In the Intelligence page, perhaps it reacts to market volatility. The whisper system is a design language, not just a dashboard feature.

---

## 11. Audio System

The app uses the Web Audio API for micro-feedback sounds. All sounds are synthesized in-browser — no audio files, no network requests.

### Initialization

Audio context must be initialized on first user gesture (browser policy):
```javascript
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
```

Call `initAudio()` on any user interaction (click, keydown, input focus).

### Sound Vocabulary

**`clickSound()`** — short, low-energy click for UI interactions:
- Short sine tone burst, `~80ms`, quiet volume
- Used on: nav item click, button click, ripple events

**`pingSound()`** — clear, pleasant tone for completions:
- Slightly longer sine, `~200ms`, slightly higher frequency
- Used on: estimate complete, query response complete, project switch complete

**`thinkSound()`** — subtle processing indicator:
- Very quiet, brief noise or low tone
- Used on: query submit, estimate calculation start

### Principles for New Pages

- Every AI completion should have a `pingSound()`
- Every user action should have a `clickSound()`
- Never play audio on automatic events (ticker update, data refresh) — only on direct user actions or AI completions
- Volume should be low enough that the sounds feel like subtle confirmation, not notification alerts

---

## 12. Animation Principles

### Easing Functions

```
Entrance / reveal:       cubic-bezier(.16, 1, .3, 1)   — spring feel, slight overshoot
Interactive elements:    cubic-bezier(.34, 1.56, .64, 1) — more pronounced spring bounce
Standard ease:           ease                            — for color/opacity only
Linear:                  linear                          — for continuous rotations only
```

### Entrance Cascade

All page elements enter with staggered delays. The cascade creates a sense of the interface assembling itself:

```
Header:       delay .25s,  duration .9s
Left/right:   delay .7s,   duration .8s
Center panel: delay .95s,  duration 1.0s
Footer:       delay 1.8s,  duration .8s
Query/ask:    delay 2.0s,  duration .8s
```

All entrances: `opacity: 0 → 1` + directional translate (header/footer: Y+12px, left: X-16px, right: X+16px, center: Y+12px).

### Orb Lerp

All orb state variables lerp at `factor = 0.04` per frame (at 60fps this is approximately a 1.5s full transition for a large change). This creates smooth, never-jarring state transitions. The orb never snaps.

### Data Transitions

- Bar fills: `cubic-bezier(.16,1,.3,1)`, duration `1.1s` per bar, staggered 52ms
- Estimate counter: cubic ease `1-(1-p)^4`, 1100ms
- Intel card heartbeat: CSS transition `.4s ease`, class toggle
- Nebula whisper: JS lerp `×0.14` per 3.2s interval — effectively ~30s to fully transition

### What Should Never Transition

- The cursor dot — must be instantaneous
- Audio — no fades between sounds
- Status text changes — instant swap (the italic/light weight reads as change without animation)

---

*End of design system handoff.*
*Reference implementation: `nova-dashboard-v19.html`*
*The orb, cursor, and ambient systems are the three load-bearing elements of the Nova design language. Implement them in a shared layout and they will make every page feel like the same product.*
