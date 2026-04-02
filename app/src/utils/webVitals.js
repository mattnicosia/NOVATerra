/**
 * Web Vitals reporter — measures Core Web Vitals and reports to analytics + Sentry.
 * Runs once on initial page load. Reports: LCP, FID, CLS, TTFB, INP.
 */
import { track, EVENTS } from "@/utils/analytics";

export function reportWebVitals() {
  // Dynamic import to keep main bundle small (~1KB)
  import("web-vitals").then(({ onLCP, onFID, onCLS, onTTFB, onINP }) => {
    const report = (metric) => {
      // Report to analytics pipeline (Supabase)
      track(EVENTS.WEB_VITAL, {
        name: metric.name,
        value: Math.round(metric.value),
        rating: metric.rating, // "good" | "needs-improvement" | "poor"
        delta: Math.round(metric.delta),
        navigationType: metric.navigationType,
      });

      // Report to Sentry as custom measurement
      if (window.__SENTRY__) {
        try {
          const Sentry = window.__SENTRY__.hub?.getClient?.() ? window.__SENTRY__ : null;
          if (Sentry?.hub) {
            Sentry.hub.getScope?.()?.setMeasurement?.(metric.name, metric.value, "millisecond");
          }
        } catch { /* Sentry measurement non-critical */ }
      }
    };

    onLCP(report);
    onFID(report);
    onCLS(report);
    onTTFB(report);
    onINP(report);
  }).catch(() => { /* web-vitals not installed — skip silently */ });
}
