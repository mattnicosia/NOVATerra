/**
 * crdtState — Per-field HLC state tracker for CRDT conflict resolution
 *
 * Tracks the most recent HLC for each (domain, entityId, field) triple.
 * Used to determine if an incoming remote operation should be applied
 * (i.e., is it newer than what we already have?).
 *
 * State is keyed as: `${domain}::${id}::${field}` → HLC string
 *
 * Persisted alongside the estimate blob in IndexedDB so that
 * offline → online reconciliation has correct ordering context.
 */

import { HLC } from './crdt';

// In-memory state map: key → HLC string
let _state = new Map();

// Current estimate ID (reset when switching estimates)
let _estimateId = null;

/**
 * Reset state for a new estimate.
 * Call when activeEstimateId changes.
 */
export function resetState(estimateId) {
  _state = new Map();
  _estimateId = estimateId;
}

/**
 * Get the current estimate ID being tracked.
 */
export function getEstimateId() {
  return _estimateId;
}

/**
 * Build the state key for a field.
 */
function key(domain, id, field) {
  return `${domain}::${id}::${field || '_entity'}`;
}

/**
 * Check if a remote operation should be applied.
 * Returns true if:
 *   - We have no record of this field (first time seeing it)
 *   - The remote HLC is greater than our recorded HLC
 *
 * @param {string} domain - e.g., 'takeoffs', 'items', 'project'
 * @param {string} id - entity ID
 * @param {string} field - field name (or null for add/remove ops)
 * @param {string} remoteHLC - the HLC from the remote operation
 * @returns {boolean}
 */
export function shouldApply(domain, id, field, remoteHLC) {
  const k = key(domain, id, field);
  const localHLC = _state.get(k);
  if (!localHLC) return true;
  return HLC.compare(remoteHLC, localHLC) > 0;
}

/**
 * Record a local or applied-remote operation's HLC.
 * Call after applying an operation (local or remote).
 *
 * @param {string} domain
 * @param {string} id
 * @param {string} field
 * @param {string} hlc
 */
export function recordHLC(domain, id, field, hlc) {
  const k = key(domain, id, field);
  const existing = _state.get(k);
  if (!existing || HLC.compare(hlc, existing) > 0) {
    _state.set(k, hlc);
  }
}

/**
 * Serialize state for persistence (IndexedDB).
 * Returns a plain object: { entries: [[key, hlc], ...], estimateId }
 */
export function serialize() {
  return {
    estimateId: _estimateId,
    entries: Array.from(_state.entries()),
  };
}

/**
 * Restore state from persisted data.
 * Call on estimate load to resume CRDT ordering context.
 */
export function deserialize(data) {
  if (!data || !data.entries) return;
  _estimateId = data.estimateId;
  _state = new Map(data.entries);
}

/**
 * Get current state size (for debugging).
 */
export function size() {
  return _state.size;
}

/**
 * Bulk-update HLCs from a merged blob.
 * When useRealtimeSync merges a blob from another device,
 * call this to advance our HLCs to at least the blob's state.
 *
 * @param {string} domain
 * @param {Array} entities - array of { id, ...fields }
 * @param {string} blobHLC - the HLC to assign (typically from blob updated_at)
 */
export function advanceFromBlob(domain, entities, blobHLC) {
  if (!entities || !blobHLC) return;
  for (const entity of entities) {
    if (!entity.id) continue;
    for (const field of Object.keys(entity)) {
      if (field === 'id') continue;
      recordHLC(domain, entity.id, field, blobHLC);
    }
  }
}
