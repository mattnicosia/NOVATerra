import { createClient } from "@supabase/supabase-js";

// Defensive: strip trailing \n (literal or newline char) from Vercel env vars
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\\n/g, "").replace(/\n/g, "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").replace(/\\n/g, "").replace(/\n/g, "").trim();

// Frontend Supabase client — uses the public anon key (safe to expose)
// Returns null if env vars are not configured (graceful degradation)
// Global fetch timeout: 60s for storage/blob operations, 15s for everything else
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          fetch: (url, options = {}) => {
            const isStorage = typeof url === "string" && (url.includes("/storage/") || url.includes("/object/"));
            const ms = isStorage ? 60000 : 15000;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), ms);
            return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
          },
        },
      })
    : null;
