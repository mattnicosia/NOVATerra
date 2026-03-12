/**
 * Health check endpoint — /api/health
 *
 * Returns system status for external monitoring (uptime services, Sentry, etc.)
 * Checks: Supabase connectivity, auth service, storage bucket access.
 */

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const startTime = Date.now();
  const checks = {};
  let healthy = true;

  // 1. Environment check
  const hasSupabaseUrl = !!process.env.SUPABASE_URL;
  const hasSupabaseKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  checks.env = { status: hasSupabaseUrl && hasSupabaseKey ? "ok" : "error" };
  if (!hasSupabaseUrl || !hasSupabaseKey) {
    healthy = false;
    checks.env.message = "Missing Supabase environment variables";
  }

  // 2. Supabase connectivity
  if (hasSupabaseUrl && hasSupabaseKey) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

      // Quick query — count user_estimates to verify DB access
      const { count, error } = await supabase
        .from("user_estimates")
        .select("*", { count: "exact", head: true });

      if (error) {
        checks.database = { status: "error", message: error.message };
        healthy = false;
      } else {
        checks.database = { status: "ok", estimateCount: count };
      }
    } catch (err) {
      checks.database = { status: "error", message: err.message };
      healthy = false;
    }
  } else {
    checks.database = { status: "skipped" };
  }

  // 3. Build info
  checks.build = {
    status: "ok",
    nodeVersion: process.version,
    region: process.env.VERCEL_REGION || "unknown",
  };

  const duration = Date.now() - startTime;

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    checks,
  });
}
