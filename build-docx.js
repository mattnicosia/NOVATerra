const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat, TabStopType, TabStopPosition,
} = require("docx");

// ─── Colors ───────────────────────────────────────────────────
const BRAND = "1A1A2E";    // Dark navy
const ACCENT = "4A90D9";   // Blue accent
const GREEN = "2ECC71";
const ORANGE = "E67E22";
const GRAY = "666666";
const LIGHT_GRAY = "F5F5F5";
const CODE_BG = "F0F0F0";
const BORDER_COLOR = "CCCCCC";
const TABLE_HEADER_BG = "E8F0FE";
const WHITE = "FFFFFF";

// ─── Borders ──────────────────────────────────────────────────
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const noBorder = { style: BorderStyle.NONE, size: 0 };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ─── Page constants ───────────────────────────────────────────
const PAGE_W = 12240; // US Letter
const PAGE_H = 15840;
const MARGIN = 1440;  // 1 inch
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9360

// ─── Helpers ──────────────────────────────────────────────────
function heading(text, level) {
  return new Paragraph({ heading: level, children: [new TextRun({ text, font: "Arial" })] });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.spacingAfter || 120 },
    children: [new TextRun({ text, font: "Arial", size: opts.size || 22, color: opts.color || "333333", bold: opts.bold, italics: opts.italics })],
    ...(opts.alignment && { alignment: opts.alignment }),
  });
}

function richPara(runs, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.spacingAfter || 120, before: opts.spacingBefore || 0 },
    children: runs.map(r => new TextRun({ font: "Arial", size: 22, color: "333333", ...r })),
    ...(opts.indent && { indent: opts.indent }),
  });
}

function codePara(text) {
  return new Paragraph({
    spacing: { after: 40 },
    shading: { fill: CODE_BG, type: ShadingType.CLEAR },
    indent: { left: 200, right: 200 },
    children: [new TextRun({ text, font: "Courier New", size: 18, color: "333333" })],
  });
}

function codeBlock(lines) {
  return lines.map(l => codePara(l));
}

function bulletItem(text, opts = {}) {
  return new Paragraph({
    numbering: { reference: "bullets", level: opts.level || 0 },
    spacing: { after: 60 },
    children: typeof text === "string"
      ? [new TextRun({ text, font: "Arial", size: 22, color: "333333" })]
      : text.map(r => new TextRun({ font: "Arial", size: 22, color: "333333", ...r })),
  });
}

function numberedItem(text, ref = "numbers") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: typeof text === "string"
      ? [new TextRun({ text, font: "Arial", size: 22, color: "333333" })]
      : text.map(r => new TextRun({ font: "Arial", size: 22, color: "333333", ...r })),
  });
}

function makeTable(headers, rows, colWidths) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders,
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: TABLE_HEADER_BG, type: ShadingType.CLEAR },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: h, font: "Arial", size: 20, bold: true, color: "333333" })] })],
    })),
  });

  const dataRows = rows.map(row =>
    new TableRow({
      children: row.map((cell, i) => new TableCell({
        borders,
        width: { size: colWidths[i], type: WidthType.DXA },
        margins: { top: 40, bottom: 40, left: 100, right: 100 },
        children: [new Paragraph({
          children: typeof cell === "string"
            ? [new TextRun({ text: cell, font: "Arial", size: 20, color: "444444" })]
            : cell.map(r => new TextRun({ font: "Arial", size: 20, color: "444444", ...r })),
        })],
      })),
    })
  );

  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
}

function spacer(pts = 120) {
  return new Paragraph({ spacing: { after: pts }, children: [] });
}

function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: BORDER_COLOR, space: 1 } },
    children: [],
  });
}

// ═══════════════════════════════════════════════════════════════
// BUILD DOCUMENT
// ═══════════════════════════════════════════════════════════════

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: BRAND },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: ACCENT },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "444444" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
        ],
      },
      {
        reference: "numbers",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ],
      },
      {
        reference: "numbers2",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ],
      },
      {
        reference: "numbers3",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ],
      },
    ],
  },
  sections: [
    // ═══════════════════════════════════════════════════════════
    // COVER PAGE
    // ═══════════════════════════════════════════════════════════
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: [
        spacer(2400),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: "NOVATerra", font: "Arial", size: 72, bold: true, color: BRAND })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "Developer Guide & Platform Overview", font: "Arial", size: 32, color: ACCENT })],
        }),
        divider(),
        spacer(600),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: "Comprehensive Technical Reference", font: "Arial", size: 24, color: GRAY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: "For New Team Members & Contributors", font: "Arial", size: 24, color: GRAY })],
        }),
        spacer(1200),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: "Last Updated: March 9, 2026", font: "Arial", size: 20, color: GRAY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Maintainer: Matt Nicosia", font: "Arial", size: 20, color: GRAY })],
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },

    // ═══════════════════════════════════════════════════════════
    // MAIN CONTENT
    // ═══════════════════════════════════════════════════════════
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: ACCENT, space: 4 } },
            children: [
              new TextRun({ text: "NOVATerra Developer Guide", font: "Arial", size: 16, color: GRAY, italics: true }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Page ", font: "Arial", size: 16, color: GRAY }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: GRAY }),
            ],
          })],
        }),
      },
      children: [

        // ── SECTION 1: What Is This Software? ──────────────────
        heading("1. What Is This Software?", HeadingLevel.HEADING_1),
        para("NOVATerra is an AI-native construction estimating platform built for general contractors, estimators, and subcontractors. It replaces legacy tools like Timberline, ProEst, WinEst, and STACK with a modern, offline-first web application powered by the NOVA AI engine (Anthropic Claude)."),
        richPara([
          { text: "The platform occupies a unique market position: " },
          { text: "AI-native + full estimating workflow", bold: true },
          { text: ". Competitors are either full legacy platforms with minimal AI, or AI-native but limited to takeoff-only. NOVATerra is both." },
        ]),
        spacer(60),

        heading("The Three Products (One Codebase)", HeadingLevel.HEADING_3),
        makeTable(
          ["Product", "What It Does", "Revenue Model"],
          [
            [[{ text: "NOVATerra", bold: true }], "Full estimating platform \u2014 takeoffs, scope, proposals, bid management", "Subscription ($149-249/mo)"],
            [[{ text: "BLDG Talent", bold: true }], "85-minute estimator skills assessment + recruiter marketplace", "Free for estimators, $200-1K/mo for recruiters"],
            [[{ text: "NOVA CORE", bold: true }], "Aggregated cost intelligence from all users (anonymized)", "Data product (future)"],
          ],
          [2200, 4360, 2800]
        ),
        spacer(80),
        para("All three live in one React app. Role-based routing (appRole in authStore) determines what each user sees. A NOVATerra estimator never sees BLDG Talent. A candidate taking the assessment sees the NOVATerra shell with locked features (the assessment doubles as a product demo). A recruiter sees an entirely separate admin portal."),

        divider(),

        // ── SECTION 2: Architecture Overview ────────────────────
        heading("2. Architecture Overview", HeadingLevel.HEADING_1),
        heading("Tech Stack", HeadingLevel.HEADING_3),
        makeTable(
          ["Layer", "Technology"],
          [
            [[{ text: "Frontend", bold: true }], "React 18 + Zustand (state) + Vite (build)"],
            [[{ text: "3D Graphics", bold: true }], "Three.js + React Three Fiber (NOVA sphere/chamber)"],
            [[{ text: "Animation", bold: true }], "Framer Motion"],
            [[{ text: "Persistence", bold: true }], "IndexedDB (primary, offline-first) \u2192 Supabase (cloud sync)"],
            [[{ text: "Auth", bold: true }], "Supabase Auth (magic links, OAuth)"],
            [[{ text: "Database", bold: true }], "Supabase (PostgreSQL + pgvector + RLS)"],
            [[{ text: "AI", bold: true }], "Anthropic Claude API (via @anthropic-ai/sdk)"],
            [[{ text: "Email", bold: true }], "Resend (transactional email)"],
            [[{ text: "Hosting", bold: true }], "Vercel (frontend + serverless API routes)"],
            [[{ text: "Monitoring", bold: true }], "Sentry (error tracking) + Vercel Analytics"],
            [[{ text: "File Storage", bold: true }], "Vercel Blob"],
            [[{ text: "BIM", bold: true }], "web-ifc (IFC file parsing)"],
          ],
          [2800, 6560]
        ),
        spacer(80),

        heading("Data Flow", HeadingLevel.HEADING_3),
        ...codeBlock([
          "User Action \u2192 Zustand Store \u2192 React UI (immediate)",
          "                    \u2193",
          "              IndexedDB (1.5-2s debounce via useAutoSave)",
          "                    \u2193",
          "              Supabase Cloud (non-blocking background push)",
        ]),
        spacer(60),
        richPara([
          { text: "Offline-first principle: ", bold: true },
          { text: "IndexedDB is the source of truth. Supabase cloud is a secondary backup that syncs in the background. The app works fully offline. Cloud sync happens on app startup and after saves." },
        ]),

        heading("Key Architectural Patterns", HeadingLevel.HEADING_3),
        bulletItem([{ text: "Zustand stores", bold: true }, { text: " are the single source of truth for all app state" }]),
        bulletItem([{ text: "getState()", bold: true, font: "Courier New", size: 20 }, { text: " is used inside callbacks/effects to avoid stale closures" }]),
        bulletItem([{ text: "Functional setState(s => ...)", bold: true, font: "Courier New", size: 20 }, { text: " for atomic updates that depend on current state" }]),
        bulletItem([{ text: "idbKey()", bold: true, font: "Courier New", size: 20 }, { text: " namespaces all IndexedDB keys by user/org to isolate data" }]),
        bulletItem([{ text: "Soft deletes", bold: true }, { text: " on the server: deleted_at column instead of DELETE" }]),
        bulletItem([{ text: "Design tokens", bold: true }, { text: " via useTheme() hook: const C = useTheme() provides all colors" }]),
        bulletItem([{ text: "Style helpers: ", bold: true }, { text: "inp(C, overrides), nInp(C, overrides), bt(C, overrides)", font: "Courier New", size: 20 }]),
        bulletItem([{ text: "DM Sans", bold: true }, { text: " is the sole typeface across the entire platform" }]),

        divider(),

        // ── SECTION 3: Project Structure ────────────────────────
        heading("3. Project Structure", HeadingLevel.HEADING_1),
        ...codeBlock([
          "BLDG Estimator/",
          "\u251C\u2500\u2500 app/                          # Main application",
          "\u2502   \u251C\u2500\u2500 src/",
          "\u2502   \u2502   \u251C\u2500\u2500 pages/               # 28 page components (lazy-loaded)",
          "\u2502   \u2502   \u251C\u2500\u2500 stores/              # 44 Zustand stores",
          "\u2502   \u2502   \u251C\u2500\u2500 components/          # 179 components (25 subdirectories)",
          "\u2502   \u2502   \u251C\u2500\u2500 hooks/               # 24 custom hooks",
          "\u2502   \u2502   \u251C\u2500\u2500 utils/               # 52 utility modules",
          "\u2502   \u2502   \u2514\u2500\u2500 constants/           # 27 data/config files",
          "\u2502   \u251C\u2500\u2500 api/                     # ~25 Vercel serverless functions",
          "\u2502   \u2514\u2500\u2500 package.json",
          "\u251C\u2500\u2500 *.sql                         # 13 Supabase migration files",
          "\u251C\u2500\u2500 BLDG-TALENT-SPEC.md          # Full BLDG Talent specification",
          "\u251C\u2500\u2500 NOVATERRA-PLATFORM-SPEC.md   # Full platform strategy document",
          "\u2514\u2500\u2500 DEVELOPER-GUIDE.md           # This file",
        ]),

        divider(),

        // ── SECTION 4: Build, Run & Deploy ──────────────────────
        heading("4. Build, Run & Deploy", HeadingLevel.HEADING_1),
        ...codeBlock([
          "# Required: set Node path (local install)",
          "export PATH=\"/Users/mattnicosia/local/node/bin:...\"",
          "",
          "# Development",
          "cd app/",
          "npx vite              # Dev server at localhost:5173",
          "",
          "# Build",
          "npx vite build        # Output to app/dist/",
          "",
          "# Deploy to production",
          "npx vercel --prod     # Deploys to https://app-nova-42373ca7.vercel.app",
        ]),
        spacer(60),
        richPara([{ text: "Git: ", bold: true }, { text: "Main branch, initialized at app root. Tags mark architectural milestones (e.g., pre-cost-library)." }]),

        divider(),

        // ── SECTION 5: State Management ─────────────────────────
        heading("5. State Management (Zustand Stores)", HeadingLevel.HEADING_1),
        para("Every piece of application state lives in a Zustand store. Here are the major ones:"),

        heading("Core Estimating", HeadingLevel.HEADING_3),
        makeTable(
          ["Store", "Purpose"],
          [
            [[{ text: "estimatesStore", font: "Courier New", size: 18 }], "Estimate index, active estimate ID, draft ID, CRUD operations"],
            [[{ text: "projectStore", font: "Courier New", size: 18 }], "Project metadata \u2014 name, client, architect, dates, budget, building type"],
            [[{ text: "itemsStore", font: "Courier New", size: 18 }], "Line items, markup order, labor multipliers, location factors, change orders"],
            [[{ text: "takeoffsStore", font: "Courier New", size: 18 }], "Takeoff sketches, calibrations, linked items, predictions"],
            [[{ text: "drawingsStore", font: "Courier New", size: 18 }], "PDF canvases, drawing scales, DPI, smart labels"],
            [[{ text: "databaseStore", font: "Courier New", size: 18, bold: true }], "Global cost library (master + user overrides), assemblies, search state"],
            [[{ text: "masterDataStore", font: "Courier New", size: 18 }], "Clients, architects, subcontractors, historical proposals, company info"],
            [[{ text: "scanStore", font: "Courier New", size: 18 }], "Scan results, schedule parsing, learning records, calibration"],
            [[{ text: "bidPackagesStore", font: "Courier New", size: 18 }], "Bid packages, invitations, proposals, presets"],
            [[{ text: "calendarStore", font: "Courier New", size: 18 }], "Calendar tasks, walkthrough dates, bid due dates"],
          ],
          [3000, 6360]
        ),
        spacer(80),

        heading("System & UI", HeadingLevel.HEADING_3),
        makeTable(
          ["Store", "Purpose"],
          [
            [[{ text: "authStore", font: "Courier New", size: 18 }], "User session, appRole (novaterra / candidate / bt_admin)"],
            [[{ text: "orgStore", font: "Courier New", size: 18 }], "Organization mode, membership, role (owner/manager/member)"],
            [[{ text: "uiStore", font: "Courier New", size: 18 }], "Sidebar state, toasts, app settings, persistenceLoaded flag"],
            [[{ text: "collaborationStore", font: "Courier New", size: 18 }], "Lock holder, presence (who\u2019s online), real-time updates"],
          ],
          [3000, 6360]
        ),

        divider(),

        // ── SECTION 6: Persistence & Cloud Sync ─────────────────
        heading("6. Persistence & Cloud Sync", HeadingLevel.HEADING_1),
        heading("How Data Flows Through the System", HeadingLevel.HEADING_3),

        numberedItem([{ text: "Boot Load ", bold: true }, { text: "(usePersistence.js): On app mount, reads all global data from IndexedDB \u2014 estimates index, master data, settings, assemblies, user cost library, calendar, etc. Sets persistenceLoaded = true when done." }]),
        numberedItem([{ text: "Estimate Load ", bold: true }, { text: "(loadEstimate): When user opens an estimate, reads the estimate blob from IndexedDB and populates all estimate-specific stores." }]),
        numberedItem([{ text: "Auto-Save ", bold: true }, { text: "(useAutoSave.js): Watches all stores via Zustand subscriptions. Changes trigger debounced saves (1.5-2s delay)." }]),
        numberedItem([{ text: "Cloud Sync ", bold: true }, { text: "(useCloudSync.js): After boot load + auth, runs bidirectional sync. Pull cloud data, merge with local (union by ID, local wins), push merged result back." }]),
        numberedItem([{ text: "Initial Cloud Seed ", bold: true }, { text: "(useInitialCloudSeed.js): One-time migration that pushes all existing local data to Supabase when a user first gets cloud sync." }]),
        spacer(80),

        heading("Key IDB Keys", HeadingLevel.HEADING_3),
        makeTable(
          ["Key", "Content"],
          [
            [[{ text: "bldg-index", font: "Courier New", size: 18 }], "Estimates index array"],
            [[{ text: "bldg-est-{id}", font: "Courier New", size: 18 }], "Individual estimate blob"],
            [[{ text: "bldg-master", font: "Courier New", size: 18 }], "Master data (clients, subs, company info)"],
            [[{ text: "bldg-settings", font: "Courier New", size: 18 }], "App settings"],
            [[{ text: "bldg-assemblies", font: "Courier New", size: 18 }], "Assembly templates"],
            [[{ text: "bldg-user-elements", font: "Courier New", size: 18, bold: true }], "Global user cost library (overrides + custom items)"],
            [[{ text: "bldg-calendar", font: "Courier New", size: 18 }], "Calendar tasks"],
            [[{ text: "bldg-deleted-ids", font: "Courier New", size: 18 }], "Deleted estimate IDs (zombie resurrection prevention)"],
          ],
          [3200, 6160]
        ),
        spacer(60),
        para("All keys are namespaced via idbKey() \u2014 prefixed with u-{userId}- (solo mode) or org-{orgId}- (org mode)."),

        divider(),

        // ── SECTION 7: Cost Database Architecture ───────────────
        heading("7. The Cost Database Architecture", HeadingLevel.HEADING_1),
        para("This was recently redesigned (March 2026). Understanding it is critical.", { italics: true }),
        spacer(40),

        heading("Two-Layer System", HeadingLevel.HEADING_3),
        richPara([{ text: "1. MASTER_COST_DB", bold: true }, { text: " \u2014 Curated baseline items shipped with the app (in constants/masterCostDb.js). Immutable at runtime. Tagged with source: \"master\"." }]),
        richPara([{ text: "2. User Elements", bold: true }, { text: " \u2014 User overrides and custom items. Tagged with source: \"user\". Two kinds:" }]),
        bulletItem([{ text: "Overrides: ", bold: true }, { text: "Modified versions of master items (have masterItemId pointing to the master item they override)" }]),
        bulletItem([{ text: "Custom Items: ", bold: true }, { text: "User-created items with no master equivalent (no masterItemId)" }]),
        spacer(40),

        heading("Merge Logic", HeadingLevel.HEADING_3),
        ...codeBlock([
          "mergeElements(userElements):",
          "  1. For each master item: if user override exists (by masterItemId),",
          "     use the override; otherwise use master",
          "  2. Append all user-only custom items (no masterItemId)",
          "  3. Return full resolved list",
        ]),
        spacer(40),

        heading("Persistence (Global, Not Per-Estimate)", HeadingLevel.HEADING_3),
        bulletItem("The cost library is global \u2014 it loads once at boot from bldg-user-elements IDB key"),
        bulletItem("Switching estimates does NOT reload the cost library"),
        bulletItem("Creating a new estimate does NOT reset the cost library"),
        bulletItem("saveEstimate() still snapshots getUserElements() into the estimate blob for backward compatibility"),
        bulletItem("saveUserLibrary() saves user elements to IDB + cloud push (debounced via auto-save)"),
        spacer(40),

        heading("Key Operations", HeadingLevel.HEADING_3),
        makeTable(
          ["Action", "What Happens"],
          [
            ["Edit a master item", "Auto-creates a user override (new ID, masterItemId set)"],
            ["\"Send to Database\" from estimate", "Adds/updates item in global cost library"],
            ["Delete a user override", "Reverts to master version"],
            ["Delete a custom item", "Removes entirely"],
            ["Delete a master item", "Blocked (master items can\u2019t be deleted)"],
          ],
          [3600, 5760]
        ),

        divider(),

        // ── SECTION 8: Pages & Features ─────────────────────────
        heading("8. Pages & Features", HeadingLevel.HEADING_1),

        heading("Estimating Workflow", HeadingLevel.HEADING_3),
        makeTable(
          ["Route", "Page", "Purpose"],
          [
            [[{ text: "/", font: "Courier New", size: 18 }], "NovaDashboardPage", "Widget-based dashboard, estimate creation"],
            [[{ text: "/estimate/:id/info", font: "Courier New", size: 18 }], "ProjectInfoPage", "Project metadata \u2014 client, architect, dates"],
            [[{ text: "/estimate/:id/plans", font: "Courier New", size: 18 }], "PlanRoomPage", "PDF upload, 9-schedule scan, ROM generation"],
            [[{ text: "/estimate/:id/takeoffs", font: "Courier New", size: 18 }], "TakeoffsPage", "Sketch-based quantity takeoffs"],
            [[{ text: "/estimate/:id/bids", font: "Courier New", size: 18 }], "BidPackagesPage", "Bid packages, sub invitations, scope gap"],
            [[{ text: "/estimate/:id/reports", font: "Courier New", size: 18 }], "ReportsPage", "PDF export, professional formatting"],
          ],
          [3200, 2600, 3560]
        ),
        spacer(80),

        heading("Global Features", HeadingLevel.HEADING_3),
        makeTable(
          ["Route", "Page", "Purpose"],
          [
            [[{ text: "/projects", font: "Courier New", size: 18 }], "ProjectsPage", "All estimates, filtering, bulk operations"],
            [[{ text: "/core", font: "Courier New", size: 18 }], "CorePage", "Cost database browser"],
            [[{ text: "/intelligence", font: "Courier New", size: 18 }], "IntelligencePage", "NOVA CORE cost intelligence"],
            [[{ text: "/resources", font: "Courier New", size: 18 }], "ResourcePage", "Gantt chart, crew scheduling"],
            [[{ text: "/inbox", font: "Courier New", size: 18 }], "InboxPage", "Email threading, RFP import"],
            [[{ text: "/settings", font: "Courier New", size: 18 }], "SettingsPage", "App preferences, calibration"],
            [[{ text: "/rom", font: "Courier New", size: 18 }], "RomPage", "Free ROM generation (lead funnel)"],
          ],
          [2800, 2600, 3960]
        ),

        divider(),

        // ── SECTION 9: AI Integration ───────────────────────────
        heading("9. AI Integration", HeadingLevel.HEADING_1),
        para("The app uses Anthropic Claude throughout:"),

        makeTable(
          ["Feature", "How"],
          [
            [[{ text: "9-Schedule Scan", bold: true }], "PDF pages \u2192 Claude vision \u2192 structured schedule data"],
            [[{ text: "ROM Generation", bold: true }], "Scanned schedules \u2192 romEngine.js \u2192 cost rollup"],
            [[{ text: "Scope Gap Analysis", bold: true }], "Compare bid packages to find missing scope"],
            [[{ text: "Auto-Response", bold: true }], "Draft professional emails from templates + context"],
            [[{ text: "NOVA Chat", bold: true }], "In-app AI assistant with project context"],
            [[{ text: "Historical Calibration", bold: true }], "Import past proposals \u2192 Claude extracts \u2192 calibration factors"],
            [[{ text: "Smart Labels", bold: true }], "Auto-label drawing pages from title blocks"],
            [[{ text: "BLDG Talent Scoring", bold: true }], "AI scores communication and bid leveling modules"],
          ],
          [3000, 6360]
        ),
        spacer(80),

        heading("Key AI Utilities", HeadingLevel.HEADING_3),
        bulletItem([{ text: "ai.js", bold: true, font: "Courier New", size: 20 }, { text: " \u2014 Core module: callAnthropic(), callAnthropicStream(), pdfBlock(), projectContext()" }]),
        bulletItem([{ text: "novaTools.js", bold: true, font: "Courier New", size: 20 }, { text: " \u2014 NOVA tool definitions for function calling" }]),
        bulletItem([{ text: "scanRunner.js", bold: true, font: "Courier New", size: 20 }, { text: " \u2014 Orchestrates 3-phase scan pipeline" }]),
        bulletItem([{ text: "romEngine.js", bold: true, font: "Courier New", size: 20 }, { text: " \u2014 ROM calculation engine" }]),
        bulletItem([{ text: "vectorSearch.js", bold: true, font: "Courier New", size: 20 }, { text: " \u2014 Semantic search via pgvector embeddings" }]),

        divider(),

        // ── SECTION 10: Multi-Tenant ────────────────────────────
        heading("10. Multi-Tenant Organization System", HeadingLevel.HEADING_1),
        para("Phase 1 complete (March 2026). Key concepts:"),
        bulletItem([{ text: "Solo Mode: ", bold: true }, { text: "User\u2019s own data, IDB keys prefixed u-{userId}-" }]),
        bulletItem([{ text: "Org Mode: ", bold: true }, { text: "Shared data, IDB keys prefixed org-{orgId}-, RLS scoped by org_id" }]),
        bulletItem([{ text: "Roles: ", bold: true }, { text: "owner (full admin), manager (most features), member (basic access)" }]),
        bulletItem([{ text: "orgReady flag ", bold: true }, { text: "gates persistence + cloud sync hooks to prevent timing races" }]),
        bulletItem([{ text: "Collaboration: ", bold: true }, { text: "Lock-based editing \u2014 only one user can edit an estimate at a time. Real-time presence via Supabase realtime." }]),

        divider(),

        // ── SECTION 11: API Routes ──────────────────────────────
        heading("11. Serverless API Routes", HeadingLevel.HEADING_1),
        makeTable(
          ["Category", "Key Endpoints"],
          [
            [[{ text: "Email", bold: true }], "inbound-email, estimate-emails, send-auto-response, send-bid-invite"],
            [[{ text: "Files", bold: true }], "blob (upload), fetch-cloud-files, proxy-cloud-file, cleanup-cloud-files"],
            [[{ text: "Documents", bold: true }], "import-rfp, parse-proposal, ocr, retry-parse"],
            [[{ text: "Bids", bold: true }], "bid-package, award-bid, sub-pool, sub-magic-link"],
            [[{ text: "Intelligence", bold: true }], "embed, seed-embeddings, vector-search"],
            [[{ text: "Portal", bold: true }], "portal, portal-upload, portal-confirm"],
            [[{ text: "AI", bold: true }], "ai, nova-voice, scope-gap-narrative"],
          ],
          [2200, 7160]
        ),

        divider(),

        // ── SECTION 12: Database Schema ─────────────────────────
        heading("12. Database Schema (Supabase)", HeadingLevel.HEADING_1),
        makeTable(
          ["Table", "Purpose"],
          [
            [[{ text: "user_data", font: "Courier New", size: 18 }], "Key-value store per user (mirrors IDB pattern)"],
            [[{ text: "user_estimates", font: "Courier New", size: 18 }], "Estimate blobs per user (deleted_at for soft delete)"],
            [[{ text: "embeddings", font: "Courier New", size: 18 }], "pgvector table for semantic search"],
            [[{ text: "orgs / memberships", font: "Courier New", size: 18 }], "Organization records + user-to-org membership with role"],
            [[{ text: "estimate_locks", font: "Courier New", size: 18 }], "Who is currently editing which estimate"],
            [[{ text: "estimate_presence", font: "Courier New", size: 18 }], "Real-time presence (who\u2019s online)"],
            [[{ text: "email_threads / messages", font: "Courier New", size: 18 }], "Email conversation threads + individual messages"],
            [[{ text: "bt_* tables", font: "Courier New", size: 18 }], "BLDG Talent: assessments, scores, modules, responses"],
          ],
          [3600, 5760]
        ),
        spacer(60),
        richPara([{ text: "RLS Policies: ", bold: true }, { text: "All tables have row-level security. User data scoped to auth.uid(). Org data scoped to org_id with membership check." }]),

        divider(),

        // ── SECTION 13: Bug Patterns ────────────────────────────
        heading("13. Critical Bug Patterns (Read This)", HeadingLevel.HEADING_1),
        para("These patterns have caused real bugs. Understand them before writing code.", { italics: true }),
        spacer(40),

        heading("1. Stale Closures with useCallback", HeadingLevel.HEADING_3),
        richPara([{ text: "Problem: ", bold: true, color: "CC0000" }, { text: "useCallback with [] deps captures state at mount time. Closure variables are stale." }]),
        richPara([{ text: "Fix: ", bold: true, color: GREEN }, { text: "Always use useSomeStore.getState() inside callbacks:" }]),
        ...codeBlock([
          "// BAD \u2014 stale closure",
          "const takeoffs = useTakeoffsStore(s => s.takeoffs);",
          "const handleClick = useCallback(() => {",
          "  console.log(takeoffs); // stale!",
          "}, []);",
          "",
          "// GOOD \u2014 fresh state",
          "const handleClick = useCallback(() => {",
          "  const takeoffs = useTakeoffsStore.getState().takeoffs;",
          "}, []);",
        ]),
        spacer(60),

        heading("2. Non-Atomic State Updates", HeadingLevel.HEADING_3),
        richPara([{ text: "Problem: ", bold: true, color: "CC0000" }, { text: "Read-then-write patterns with get() can race with concurrent updates." }]),
        richPara([{ text: "Fix: ", bold: true, color: GREEN }, { text: "Use functional set():" }]),
        ...codeBlock([
          "// BAD \u2014 race condition",
          "const current = get().estimatesIndex;",
          "set({ estimatesIndex: [...current, newEntry] });",
          "",
          "// GOOD \u2014 atomic",
          "set(s => ({ estimatesIndex: [...s.estimatesIndex, newEntry] }));",
        ]),
        spacer(60),

        heading("3. Zombie Estimate Resurrection", HeadingLevel.HEADING_3),
        richPara([{ text: "Problem: ", bold: true, color: "CC0000" }, { text: "If a deleted estimate\u2019s ID isn\u2019t tracked before the index is updated, a crash between operations can cause the estimate to reappear on next cloud sync." }]),
        richPara([{ text: "Fix: ", bold: true, color: GREEN }, { text: "Track deleted IDs FIRST (in both IDB and localStorage), THEN remove from index." }]),
        spacer(60),

        heading("4. Zustand Getter Properties", HeadingLevel.HEADING_3),
        richPara([{ text: "Problem: ", bold: true, color: "CC0000" }, { text: "Zustand create() doesn\u2019t support ES5 getters. get isManager() { ... } won\u2019t work." }]),
        richPara([{ text: "Fix: ", bold: true, color: GREEN }, { text: "Use exported selector functions instead." }]),

        divider(),

        // ── SECTION 14: Styling ─────────────────────────────────
        heading("14. Styling Conventions", HeadingLevel.HEADING_1),
        heading("Design Tokens", HeadingLevel.HEADING_3),
        ...codeBlock([
          "const C = useTheme();  // Always destructure theme first",
          "",
          "C.bg        // Background",
          "C.bg2       // Secondary background",
          "C.text      // Primary text",
          "C.accent    // Accent color",
          "C.border    // Border color",
          "C.green     // Material cost color",
          "C.blue      // Labor cost color",
          "C.orange    // Equipment cost color",
          "C.red       // Danger/error",
          "C.purple    // Code/special",
        ]),
        spacer(60),

        heading("Style Helpers", HeadingLevel.HEADING_3),
        ...codeBlock([
          "import { inp, nInp, bt } from '@/utils/styles';",
          "",
          "<input style={inp(C, { width: '100%' })} />",
          "<input style={nInp(C, { textAlign: 'right' })} />",
          "<button style={bt(C, { background: C.accent })} />",
        ]),
        spacer(60),

        heading("Typography", HeadingLevel.HEADING_3),
        bulletItem([{ text: "Font: ", bold: true }, { text: "DM Sans only. No DM Mono, no Outfit, no Inter." }]),
        bulletItem([{ text: "Tabular numbers: ", bold: true }, { text: "fontFeatureSettings: \"'tnum'\" for cost columns." }]),

        divider(),

        // ── SECTION 15: Roadmap ─────────────────────────────────
        heading("15. Future Goals & Roadmap", HeadingLevel.HEADING_1),

        heading("Near-Term (In Progress / Next)", HeadingLevel.HEADING_3),
        numberedItem([{ text: "BLDG Talent Assessment ", bold: true }, { text: "\u2014 6 assessment modules, candidate/recruiter portals, scoring engine, certification system." }]),
        numberedItem([{ text: "Free ROM Funnel ", bold: true }, { text: "\u2014 Public /rom route, email capture, 60-second ROM from uploaded plans, trial conversion CTA." }]),
        numberedItem([{ text: "Stripe Subscription ", bold: true }, { text: "\u2014 Payment tiers (Solo $149/mo, Team $249/user/mo), feature gating, trial management." }]),
        numberedItem([{ text: "NOVA CORE Intelligence ", bold: true }, { text: "\u2014 Aggregated, anonymized cost intelligence from all users." }]),
        spacer(60),

        heading("Medium-Term", HeadingLevel.HEADING_3),
        bulletItem("Adaptive Difficulty for BLDG Talent (questions adjust based on performance)"),
        bulletItem("Percentile Ranking once 50+ assessments collected"),
        bulletItem("White-Label Assessment for enterprise recruiting firms"),
        bulletItem("Cloud Provider Integration \u2014 Google Drive, Dropbox, S3 as plan sources"),
        bulletItem("Real-Time Collaboration improvements \u2014 multi-user editing"),
        spacer(60),

        heading("Long-Term Vision", HeadingLevel.HEADING_3),
        ...codeBlock([
          "Free ROM \u2192 NOVATerra subscription \u2192 Estimates feed NOVA CORE \u2192",
          "CORE gets smarter \u2192 ROM gets more accurate \u2192 More users \u2192",
          "Users take BLDG Talent \u2192 Recruiters pay for scored candidates \u2192",
          "Recruiters' clients discover NOVATerra \u2192 Repeat",
        ]),
        spacer(60),
        richPara([{ text: "Revenue Target: ", bold: true }, { text: "$2-3M+ ARR by Year 3 across all three products." }]),
        richPara([{ text: "Defensibility: ", bold: true }, { text: "Matt is an expert estimator, GC company owner, AND the software builder. This combination doesn\u2019t exist anywhere else in construction tech. The data moat (NOVA CORE) compounds with every user." }]),

        divider(),

        // ── SECTION 16: Key Files Reference ─────────────────────
        heading("16. Key Files Reference", HeadingLevel.HEADING_1),
        makeTable(
          ["File", "What It Does", "When You\u2019d Touch It"],
          [
            [[{ text: "App.jsx", font: "Courier New", size: 18 }], "Route definitions, role gating", "Adding new pages"],
            [[{ text: "estimatesStore.js", font: "Courier New", size: 18 }], "Estimate CRUD, index management", "Estimate operations"],
            [[{ text: "databaseStore.js", font: "Courier New", size: 18 }], "Cost library (master + user)", "Cost database features"],
            [[{ text: "itemsStore.js", font: "Courier New", size: 18 }], "Line items, markups, labor", "Estimate content"],
            [[{ text: "usePersistence.js", font: "Courier New", size: 18 }], "Boot load, save functions", "Persistence changes"],
            [[{ text: "useAutoSave.js", font: "Courier New", size: 18 }], "Debounced auto-save", "Adding auto-saved stores"],
            [[{ text: "useCloudSync.js", font: "Courier New", size: 18 }], "Bidirectional cloud sync", "Cloud sync for new types"],
            [[{ text: "useTheme.jsx", font: "Courier New", size: 18 }], "Design tokens, color themes", "Theming"],
            [[{ text: "ai.js", font: "Courier New", size: 18 }], "Claude API integration", "AI features"],
            [[{ text: "styles.js", font: "Courier New", size: 18 }], "inp(), nInp(), bt()", "Styling"],
            [[{ text: "format.js", font: "Courier New", size: 18 }], "uid(), fmt2(), nn()", "Formatting"],
          ],
          [2800, 3560, 3000]
        ),

        divider(),

        // ── SECTION 17: Environment ─────────────────────────────
        heading("17. Environment & Secrets", HeadingLevel.HEADING_1),
        para("The app uses environment variables for API keys and service connections. These are configured in Vercel and in local .env files (not committed to git):"),
        bulletItem([{ text: "Supabase URL + Anon Key ", bold: true }, { text: "\u2014 Database connection" }]),
        bulletItem([{ text: "Anthropic API Key ", bold: true }, { text: "\u2014 Claude AI" }]),
        bulletItem([{ text: "Resend API Key ", bold: true }, { text: "\u2014 Email service" }]),
        bulletItem([{ text: "Vercel Blob Token ", bold: true }, { text: "\u2014 File storage" }]),
        bulletItem([{ text: "Sentry DSN ", bold: true }, { text: "\u2014 Error tracking" }]),
        spacer(60),
        para("Contact Matt for access to these services.", { italics: true }),

        divider(),

        // ── SECTION 18: Getting Started ─────────────────────────
        heading("18. Getting Started Checklist", HeadingLevel.HEADING_1),
        numberedItem("Clone the repo and run npm install in app/"),
        numberedItem("Get environment variables from Matt (Supabase, Anthropic, etc.)"),
        numberedItem("Run npx vite for local development"),
        numberedItem("Read this document fully"),
        numberedItem("Read BLDG-TALENT-SPEC.md for the assessment platform spec"),
        numberedItem("Read NOVATERRA-PLATFORM-SPEC.md for the full platform strategy"),
        numberedItem("Explore the Zustand stores \u2014 they are the heart of the application"),
        numberedItem("Understand the persistence flow: Zustand \u2192 IDB \u2192 Cloud"),
        numberedItem("Review the Critical Bug Patterns section (Section 13) before writing code"),
        numberedItem("Ask Matt about current priorities and where to start"),

        spacer(400),
        divider(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [new TextRun({ text: "This document covers the application as of March 2026.", font: "Arial", size: 18, color: GRAY, italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "The codebase is ~600 files across stores, components, pages, hooks, utils, constants, API routes, and SQL migrations.", font: "Arial", size: 18, color: GRAY, italics: true })],
        }),
      ],
    },
  ],
});

// ─── Generate ─────────────────────────────────────────────────
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/Users/mattnicosia/Desktop/BLDG Estimator/NOVATerra-Developer-Guide.docx", buffer);
  console.log("Done: NOVATerra-Developer-Guide.docx");
});
