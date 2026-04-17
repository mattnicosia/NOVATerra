// background.js — Fire-and-forget work that outlives the response.
//
// Vercel's `waitUntil` keeps the serverless function alive until the promise
// resolves, even after res.end() has been called. Without this, sending a
// response terminates the function and any in-flight work gets killed.
//
// Pattern:
//   return sendThenBackground(res, 200, { queued: true }, async () => {
//     await resend.emails.send(...);
//   });

import { waitUntil } from "@vercel/functions";

/**
 * Send an HTTP response immediately, then run async work in the background.
 * Background errors are logged but do not affect the already-sent response.
 * @param {Response} res — Vercel handler res object
 * @param {number} status — HTTP status for the immediate response
 * @param {object} body — JSON body for the immediate response
 * @param {() => Promise<void>} work — async background work
 * @param {string} label — tag for log messages (e.g. "send-proposal")
 */
export function sendThenBackground(res, status, body, work, label = "background") {
  res.status(status).json(body);
  const promise = Promise.resolve().then(work).catch(err => {
    // Never throw from here — response is already sent. Log + surface to Sentry
    // if configured on the server side (not set up in this codebase yet).
    console.error(`[${label}] Background work failed:`, err?.message || err);
  });
  try {
    waitUntil(promise);
  } catch (err) {
    // waitUntil may not be available in non-Vercel environments (local vercel dev,
    // CI, self-hosted). Fall back to best-effort execution — the function will
    // likely still stay alive long enough for short tasks like Resend calls.
    console.warn(`[${label}] waitUntil unavailable (${err?.message || err}) — best-effort background`);
  }
}
