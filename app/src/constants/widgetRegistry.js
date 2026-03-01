/* ────────────────────────────────────────────────────────
   Widget Registry — type definitions for all dashboard widgets
   ──────────────────────────────────────────────────────── */

export const WIDGET_REGISTRY = {
  'projects': {
    label: 'Projects',
    description: 'Your estimate projects list',
    defaultW: 3, defaultH: 8,
    minW: 2, minH: 4,
    maxW: 6, maxH: 16,
    category: 'core',
    singleton: true,
    removable: false,
  },
  'benchmarks': {
    label: 'Benchmarks',
    description: 'KPI benchmarks (Cost/SF, Win Rate, Pipeline)',
    defaultW: 3, defaultH: 4,
    minW: 2, minH: 3,
    maxW: 6, maxH: 8,
    category: 'core',
    singleton: true,
  },
  'nova-orb': {
    label: 'Nova Orb',
    description: 'AI assistant orb and Ask Nova input',
    defaultW: 6, defaultH: 5,
    minW: 3, minH: 3,
    maxW: 12, maxH: 8,
    category: 'core',
    singleton: true,
    removable: false,
  },
  'estimate': {
    label: 'Estimate Display',
    description: 'Active estimate value and status',
    defaultW: 6, defaultH: 4,
    minW: 3, minH: 3,
    maxW: 12, maxH: 6,
    category: 'core',
    singleton: true,
  },
  'cost-breakdown': {
    label: 'Cost Breakdown',
    description: 'Division cost breakdown bars',
    defaultW: 6, defaultH: 4,
    minW: 3, minH: 3,
    maxW: 12, maxH: 8,
    category: 'core',
    singleton: true,
  },
  'inbox': {
    label: 'Inbox',
    description: 'Pending RFPs and bid invitations',
    defaultW: 3, defaultH: 6,
    minW: 2, minH: 4,
    maxW: 6, maxH: 10,
    category: 'core',
    singleton: true,
  },
  'calendar': {
    label: 'Calendar',
    description: 'Month view with bid dates and tasks',
    defaultW: 6, defaultH: 8,
    minW: 3, minH: 5,
    maxW: 12, maxH: 14,
    category: 'core',
    singleton: true,
  },
  'market-intel': {
    label: 'Market Intel',
    description: 'Material, labor, and equipment price trends',
    defaultW: 3, defaultH: 6,
    minW: 3, minH: 4,
    maxW: 6, maxH: 16,
    category: 'market',
    singleton: true,
  },
  'live-feed': {
    label: 'Live Material Feed',
    description: 'Real-time material price ticker',
    defaultW: 3, defaultH: 6,
    minW: 2, minH: 4,
    maxW: 6, maxH: 14,
    category: 'market',
    singleton: true,
  },
  'spotify': {
    label: 'Spotify',
    description: 'Embed a Spotify track or playlist',
    defaultW: 3, defaultH: 4,
    minW: 2, minH: 3,
    maxW: 6, maxH: 8,
    category: 'thirdparty',
    singleton: false,
    configFields: [
      { key: 'url', label: 'Spotify URL', type: 'text', placeholder: 'https://open.spotify.com/...' },
    ],
  },
  'iframe': {
    label: 'Custom Embed',
    description: 'Embed any website via URL',
    defaultW: 6, defaultH: 6,
    minW: 2, minH: 3,
    maxW: 12, maxH: 16,
    category: 'thirdparty',
    singleton: false,
    configFields: [
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://...' },
      { key: 'title', label: 'Title', type: 'text', placeholder: 'My Embed' },
    ],
  },
  'carbon-breakdown': {
    label: 'Terra Carbon',
    description: 'Embodied carbon breakdown by CSI division',
    defaultW: 6, defaultH: 4,
    minW: 3, minH: 3,
    maxW: 12, maxH: 8,
    category: 'sustainability',
    singleton: true,
  },
  'carbon-benchmark': {
    label: 'Terra Score',
    description: 'Carbon intensity score vs building-type benchmarks',
    defaultW: 3, defaultH: 6,
    minW: 2, minH: 4,
    maxW: 6, maxH: 10,
    category: 'sustainability',
    singleton: true,
  },
};

export const WIDGET_CATEGORIES = {
  core: { label: 'Estimating', order: 0, description: 'Core project and estimation tools' },
  market: { label: 'Market Data', order: 1, description: 'Live pricing and market intelligence' },
  sustainability: { label: 'Sustainability', order: 2, description: 'Carbon tracking and resilience metrics' },
  thirdparty: { label: '3rd Party', order: 3, description: 'External services and embeds' },
};

/* ── Size presets ──────────────────────────────────────── */

export const SIZE_PRESETS = {
  S:  { cols: 3,  label: 'S' },
  M:  { cols: 6,  label: 'M' },
  L:  { cols: 9,  label: 'L' },
  XL: { cols: 12, label: 'XL' },
};

export function getAvailablePresets(widgetType) {
  const reg = WIDGET_REGISTRY[widgetType] || {};
  return Object.entries(SIZE_PRESETS)
    .filter(([, { cols }]) => cols >= (reg.minW || 2) && cols <= (reg.maxW || 12))
    .map(([key]) => key);
}

export function computePresetSize(preset, reg) {
  const target = SIZE_PRESETS[preset];
  if (!target) return { w: reg.defaultW || 6, h: reg.defaultH || 4 };
  const w = Math.max(reg.minW || 2, Math.min(reg.maxW || 12, target.cols));
  const aspect = (reg.defaultH || 4) / (reg.defaultW || 6);
  let h = Math.round(w * aspect);
  h = Math.max(reg.minH || 3, Math.min(reg.maxH || 16, h));
  return { w, h };
}

export function getCurrentPreset(w) {
  if (w <= 3) return 'S';
  if (w <= 6) return 'M';
  if (w <= 9) return 'L';
  return 'XL';
}
