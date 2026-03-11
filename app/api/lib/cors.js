// CORS helper for serverless functions
const ALLOWED_ORIGINS = ["https://app-nova-42373ca7.vercel.app", "http://localhost:5173", "http://localhost:4173"];

export function cors(req, res) {
  const origin = req.headers.origin;
  // Allow listed origins, or any *.vercel.app preview deployments
  if (ALLOWED_ORIGINS.includes(origin) || (origin && origin.endsWith(".vercel.app"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (!origin) {
    // Server-to-server calls (no origin header) — allow
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}
