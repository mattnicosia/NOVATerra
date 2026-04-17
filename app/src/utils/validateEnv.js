// validateEnv — boot-time check that required env vars are present.
// Fails LOUD at app startup instead of mysteriously at first API call.
//
// Required vars throw a hard error and prevent the app from rendering.
// Optional vars log a warning but allow the app to start.

const REQUIRED = {
  VITE_SUPABASE_URL: "Supabase project URL — auth and persistence will not work without this",
  VITE_SUPABASE_ANON_KEY: "Supabase anon key — required for all authenticated requests",
};

const OPTIONAL = {
  VITE_SENTRY_DSN: "Sentry DSN — production errors will not be reported without this",
  VITE_MAPBOX_TOKEN: "Mapbox token — pipeline map widget will be unavailable",
  VITE_ADMIN_EMAILS: "Admin email allowlist — admin routes will be inaccessible",
};

// Server-side env vars (for reference — not validated client-side).
// Expected in Vercel env: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY,
// RESEND_API_KEY, ADMIN_EMAILS, ADMIN_SECRET, and optionally
// UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for distributed rate
// limiting (rateLimiter.js falls back to in-memory if these are missing).

export function validateClientEnv() {
  const env = import.meta.env;
  const missing = [];
  const warnings = [];

  for (const [key, why] of Object.entries(REQUIRED)) {
    const value = env[key];
    if (!value || typeof value !== "string" || value.trim().length === 0) {
      missing.push({ key, why });
    }
  }

  for (const [key, why] of Object.entries(OPTIONAL)) {
    const value = env[key];
    if (!value || typeof value !== "string" || value.trim().length === 0) {
      warnings.push({ key, why });
    }
  }

  if (warnings.length) {
    console.warn(
      "[env] Missing optional env vars:\n" +
        warnings.map(w => `  - ${w.key}: ${w.why}`).join("\n"),
    );
  }

  if (missing.length) {
    const lines = missing.map(m => `  - ${m.key}: ${m.why}`).join("\n");
    const msg = `Missing required environment variables:\n${lines}\n\nSet these in .env.local (dev) or Vercel env (prod) and reload.`;
    throw new Error(msg);
  }

  return { ok: true, warnings: warnings.map(w => w.key) };
}
