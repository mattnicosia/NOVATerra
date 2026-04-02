/**
 * Tour Definitions — Guided spotlight tours for NOVATerra onboarding.
 * Each tour is an array of steps with CSS selectors and descriptions.
 */

export const TOURS = {
  "dashboard-tour": {
    label: "Dashboard Tour",
    steps: [
      {
        targetSelector: "[data-tour='widget-grid']",
        title: "Your Command Center",
        description: "This is your dashboard. Every widget shows real-time data from your estimates, team, and market. Drag and resize to customize.",
        position: "bottom",
      },
      {
        targetSelector: "[data-tour='projects-widget']",
        title: "Projects List",
        description: "All your estimates in one place. Click any project to jump in. Status colors show where each bid stands.",
        position: "right",
      },
      {
        targetSelector: "[data-tour='pipeline-hero']",
        title: "Pipeline Overview",
        description: "Your financial pipeline at a glance — active bids, total value, and status breakdown across all estimates.",
        position: "bottom",
      },
      {
        targetSelector: "[data-tour='fab-button']",
        title: "Add Widgets",
        description: "Click here to add new widgets, enter edit mode, or rearrange your dashboard layout.",
        position: "left",
      },
      {
        targetSelector: "[data-tour='nova-orb']",
        title: "Meet NOVA",
        description: "Your AI assistant. Click the orb anytime to ask questions about your estimates, get scope suggestions, or analyze drawings.",
        position: "left",
      },
    ],
  },
  "estimate-tour": {
    label: "Estimate Tour",
    steps: [
      {
        targetSelector: "[data-tour='item-grid']",
        title: "Line Items",
        description: "Your estimate lives here. Add items manually or let NOVA suggest them from your drawings. Click any cell to edit.",
        position: "bottom",
      },
      {
        targetSelector: "[data-tour='division-nav']",
        title: "Division Navigator",
        description: "Jump between CSI divisions. The badges show item counts per division so you can spot gaps.",
        position: "right",
      },
      {
        targetSelector: "[data-tour='totals-bar']",
        title: "Live Totals",
        description: "Real-time cost totals update as you work. Material, labor, equipment, and subcontractor costs broken out.",
        position: "top",
      },
      {
        targetSelector: "[data-tour='collab-bar']",
        title: "Team Collaboration",
        description: "See who's viewing this estimate. Lock it for editing to prevent conflicts. Managers can force-release locks.",
        position: "bottom",
      },
    ],
  },
  "planroom-tour": {
    label: "Plan Room Tour",
    steps: [
      {
        targetSelector: "[data-tour='upload-zone']",
        title: "Upload Drawings",
        description: "Drag and drop your PDF plans here. NOVA works best with A-series architectural sheets — start with those.",
        position: "bottom",
      },
      {
        targetSelector: "[data-tour='drawing-list']",
        title: "Drawing Manager",
        description: "Your uploaded drawings appear here. NOVA auto-detects sheet types, extracts schedules, and reads notes.",
        position: "right",
      },
      {
        targetSelector: "[data-tour='scan-button']",
        title: "NOVA Scan",
        description: "Click Discover to let NOVA analyze all your drawings. It detects schedules, extracts notes, and suggests takeoff items.",
        position: "left",
      },
    ],
  },
};
