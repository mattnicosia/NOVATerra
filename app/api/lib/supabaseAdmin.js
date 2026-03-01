import { createClient } from '@supabase/supabase-js';

// Trim any trailing \n from env vars (Vercel .env parsing artifact)
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\\n/g, '').replace(/\n/g, '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\\n/g, '').replace(/\n/g, '').trim();

// Server-side Supabase client using service role key (bypasses RLS)
// Used ONLY in serverless functions — never exposed to the browser
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// Verify a user's JWT token and return user data
export async function verifyUser(req) {
  if (!supabaseAdmin) return null;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// Verify admin access — checks JWT + email whitelist
// Returns user if admin, null otherwise
export async function verifyAdmin(req) {
  const user = await verifyUser(req);
  if (!user) return null;

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes(user.email?.toLowerCase())) return null;
  return user;
}
