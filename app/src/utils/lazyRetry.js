import { lazy } from "react";

/**
 * lazyRetry — wraps React.lazy with a single retry + page reload fallback.
 *
 * After a Vercel deploy, old cached JS may reference chunk hashes that no longer
 * exist. This catches the "Failed to fetch dynamically imported module" error
 * and reloads the page once so the browser fetches the new entry point.
 */
export default function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch(() => {
      // Only reload once per session to avoid infinite loops
      const key = "bldg-chunk-retry";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
      // If we already retried, surface the error to the error boundary
      return importFn();
    }),
  );
}
