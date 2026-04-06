/**
 * crdtClock — Singleton HLC (Hybrid Logical Clock) for the app
 *
 * Initialize once with the user's ID as the nodeId.
 * All CRDT operations use this clock for causal ordering.
 */

import { HLC } from './crdt';

let _clock = null;

/** Initialize the shared clock. Call once on auth. */
export function initClock(nodeId) {
  // Use first 8 chars of userId as nodeId to keep HLC strings compact
  _clock = new HLC(nodeId.slice(0, 8));
}

/** Get a new HLC timestamp for a local operation. */
export function tick() {
  if (!_clock) {
    console.warn('[crdt] Clock not initialized — using fallback timestamp');
    return `${Date.now().toString().padStart(13, '0')}-0000-00000000`;
  }
  return _clock.tick();
}

/** Merge a received remote HLC into the local clock. */
export function receive(remoteHLC) {
  if (!_clock) return;
  _clock.receive(remoteHLC);
}

/** Check if clock is initialized. */
export function isInitialized() {
  return _clock !== null;
}

/** Reset clock (on sign-out). */
export function resetClock() {
  _clock = null;
}
