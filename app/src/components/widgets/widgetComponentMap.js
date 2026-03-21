import { lazy } from "react";

/* ────────────────────────────────────────────────────────
   Widget Component Map — lazy-loaded widget components
   ──────────────────────────────────────────────────────── */

export const WIDGET_COMPONENTS = {
  "project-pulse": lazy(() => import("./ProjectPulseWidget")),
  projects: lazy(() => import("./ProjectsWidget")),
  benchmarks: lazy(() => import("./BenchmarksWidget")),
  estimate: lazy(() => import("./EstimateDisplayWidget")),
  "cost-breakdown": lazy(() => import("./CostBreakdownWidget")),
  inbox: lazy(() => import("./InboxWidget")),
  calendar: lazy(() => import("./CalendarWidget")),
  "market-intel": lazy(() => import("./MarketIntelWidget")),
  "live-feed": lazy(() => import("./LiveFeedWidget")),
  spotify: lazy(() => import("./SpotifyWidget")),
  iframe: lazy(() => import("./IframeWidget")),
  "estimate-health": lazy(() => import("./EstimateHealthWidget")),
  "deadline-countdown": lazy(() => import("./DeadlineCountdownWidget")),
  "carbon-breakdown": lazy(() => import("./CarbonBreakdownWidget")),
  "carbon-benchmark": lazy(() => import("./CarbonBenchmarkWidget")),
};
