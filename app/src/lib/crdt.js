/**
 * crdt.js — Lightweight CRDT primitives for NOVATerra
 *
 * Provides conflict-free replicated data types for multi-user
 * construction estimating. No external dependencies.
 *
 * Exports:
 *   HLC           — Hybrid Logical Clock (causal ordering)
 *   LWWRegister   — Last Writer Wins scalar register
 *   ORSet         — Observed-Remove Set for collections
 *   createSetOp   — Build a field-update operation
 *   createAddOp   — Build a collection-add operation
 *   createRemoveOp— Build a collection-remove operation
 *   batchOps      — Group operations for broadcast
 */

// ---------------------------------------------------------------------------
// HLC — Hybrid Logical Clock
// ---------------------------------------------------------------------------
// Produces lexicographically-sortable timestamps that preserve causal order
// even when wall clocks on different devices disagree.
//
// Format: {wallMs 13 chars zero-padded}-{logical 4 chars zero-padded}-{nodeId}
// Example: 1712419200000-0001-abc123
// ---------------------------------------------------------------------------

const WALL_PAD = 13;
const LOGICAL_PAD = 4;
const MAX_LOGICAL = 9999;

function padWall(n) {
  return String(n).padStart(WALL_PAD, '0');
}

function padLogical(n) {
  return String(n).padStart(LOGICAL_PAD, '0');
}

export class HLC {
  /**
   * @param {string} nodeId — unique identifier for this device/tab/user
   */
  constructor(nodeId) {
    if (!nodeId) throw new Error('HLC requires a nodeId');
    this.nodeId = nodeId;
    this.wallMs = 0;
    this.logical = 0;
  }

  /**
   * Advance the clock and return a new HLC string.
   * Called before every local mutation.
   */
  tick() {
    const now = Date.now();

    if (now > this.wallMs) {
      // Wall clock moved forward — reset logical counter
      this.wallMs = now;
      this.logical = 0;
    } else {
      // Clock hasn't moved (same ms or skew) — bump logical
      this.logical += 1;
      if (this.logical > MAX_LOGICAL) {
        // Extremely unlikely: >9999 ops in one millisecond.
        // Nudge wall forward to avoid overflow.
        this.wallMs += 1;
        this.logical = 0;
      }
    }

    return `${padWall(this.wallMs)}-${padLogical(this.logical)}-${this.nodeId}`;
  }

  /**
   * Merge a remote HLC into local state, then return a new local tick.
   * Called when receiving a remote operation — ensures our next timestamp
   * is strictly after both our current state and the remote timestamp.
   *
   * @param {string} remoteHLC — HLC string from another node
   * @returns {string} new local HLC string
   */
  receive(remoteHLC) {
    const remote = HLC.parse(remoteHLC);
    const now = Date.now();

    if (now > this.wallMs && now > remote.wallMs) {
      // Wall clock is ahead of everything — just use it
      this.wallMs = now;
      this.logical = 0;
    } else if (this.wallMs === remote.wallMs) {
      // Same wall time — take max logical + 1
      this.logical = Math.max(this.logical, remote.logical) + 1;
    } else if (this.wallMs > remote.wallMs) {
      // We're ahead — just bump our own logical
      this.logical += 1;
    } else {
      // Remote is ahead — adopt their wall time
      this.wallMs = remote.wallMs;
      this.logical = remote.logical + 1;
    }

    // Guard against logical overflow
    if (this.logical > MAX_LOGICAL) {
      this.wallMs += 1;
      this.logical = 0;
    }

    return `${padWall(this.wallMs)}-${padLogical(this.logical)}-${this.nodeId}`;
  }

  /**
   * Compare two HLC strings for ordering.
   * Because the format is zero-padded, lexicographic compare works,
   * but we parse for clarity and to handle edge cases.
   *
   * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
   */
  static compare(a, b) {
    if (a === b) return 0;
    // Lexicographic comparison is correct because of zero-padding
    return a < b ? -1 : 1;
  }

  /**
   * Parse an HLC string into its components.
   *
   * @param {string} hlcString
   * @returns {{ wallMs: number, logical: number, nodeId: string }}
   */
  static parse(hlcString) {
    if (!hlcString || typeof hlcString !== 'string') {
      throw new Error(`Invalid HLC string: ${hlcString}`);
    }

    const firstDash = hlcString.indexOf('-');
    const secondDash = hlcString.indexOf('-', firstDash + 1);

    if (firstDash === -1 || secondDash === -1) {
      throw new Error(`Malformed HLC string: ${hlcString}`);
    }

    return {
      wallMs: parseInt(hlcString.slice(0, firstDash), 10),
      logical: parseInt(hlcString.slice(firstDash + 1, secondDash), 10),
      nodeId: hlcString.slice(secondDash + 1),
    };
  }
}


// ---------------------------------------------------------------------------
// LWWRegister — Last Writer Wins Register
// ---------------------------------------------------------------------------
// Stores a single scalar value. On conflict, the higher HLC wins.
// Used for fields like quantity, description, unit cost on takeoff items.
// ---------------------------------------------------------------------------

export class LWWRegister {
  constructor() {
    this.value = undefined;
    this.hlc = null; // HLC string of the last write
  }

  /**
   * Set the register value with an HLC timestamp.
   *
   * @param {*} value — any JSON-serializable value
   * @param {string} hlc — HLC string from the writer's clock
   */
  set(value, hlc) {
    this.value = value;
    this.hlc = hlc;
  }

  /**
   * Merge a remote value. Returns true if the remote value won
   * (i.e., it had a higher HLC and the local value was replaced).
   *
   * @param {*} value — remote value
   * @param {string} remoteHLC — remote HLC string
   * @returns {boolean} true if remote won and local was updated
   */
  merge(value, remoteHLC) {
    // If we have no local value, remote always wins
    if (this.hlc === null || HLC.compare(remoteHLC, this.hlc) > 0) {
      this.value = value;
      this.hlc = remoteHLC;
      return true;
    }
    return false;
  }

  /**
   * Get the current value.
   * @returns {*}
   */
  get() {
    return this.value;
  }

  /**
   * Get the full state for serialization.
   * @returns {{ value: *, hlc: string|null }}
   */
  getState() {
    return { value: this.value, hlc: this.hlc };
  }
}


// ---------------------------------------------------------------------------
// ORSet — Observed-Remove Set
// ---------------------------------------------------------------------------
// Tracks a set of element IDs. Each element has an "add" HLC and a "remove"
// HLC. An element is considered present if its add HLC > remove HLC.
//
// Used for collections: the list of takeoffs in an estimate, the list of
// items in a takeoff, etc. Elements are identified by their UUID.
// ---------------------------------------------------------------------------

export class ORSet {
  constructor() {
    /** @type {Map<string, string>} elementId -> highest add HLC */
    this.adds = new Map();
    /** @type {Map<string, string>} elementId -> highest remove HLC */
    this.removes = new Map();
  }

  /**
   * Add an element to the set.
   *
   * @param {string} elementId — UUID of the element
   * @param {string} hlc — HLC string for this add operation
   */
  add(elementId, hlc) {
    const existing = this.adds.get(elementId);
    if (!existing || HLC.compare(hlc, existing) > 0) {
      this.adds.set(elementId, hlc);
    }
  }

  /**
   * Remove an element from the set (add a tombstone).
   *
   * @param {string} elementId — UUID of the element
   * @param {string} hlc — HLC string for this remove operation
   */
  remove(elementId, hlc) {
    const existing = this.removes.get(elementId);
    if (!existing || HLC.compare(hlc, existing) > 0) {
      this.removes.set(elementId, hlc);
    }
  }

  /**
   * Check if an element is currently in the set.
   * Present = has an add HLC that is greater than its remove HLC (or no remove).
   *
   * @param {string} elementId
   * @returns {boolean}
   */
  has(elementId) {
    const addHLC = this.adds.get(elementId);
    if (!addHLC) return false;

    const removeHLC = this.removes.get(elementId);
    if (!removeHLC) return true;

    return HLC.compare(addHLC, removeHLC) > 0;
  }

  /**
   * Get the set of all live (non-removed) element IDs.
   *
   * @returns {Set<string>}
   */
  elements() {
    const result = new Set();
    for (const elementId of this.adds.keys()) {
      if (this.has(elementId)) {
        result.add(elementId);
      }
    }
    return result;
  }

  /**
   * Merge remote state into local state.
   * For each element, keep the max HLC for both adds and removes.
   *
   * @param {Map<string, string>|Object} remoteAdds — elementId -> HLC
   * @param {Map<string, string>|Object} remoteRemoves — elementId -> HLC
   */
  merge(remoteAdds, remoteRemoves) {
    const addEntries = remoteAdds instanceof Map
      ? remoteAdds.entries()
      : Object.entries(remoteAdds || {});

    for (const [elementId, hlc] of addEntries) {
      this.add(elementId, hlc);
    }

    const removeEntries = remoteRemoves instanceof Map
      ? remoteRemoves.entries()
      : Object.entries(remoteRemoves || {});

    for (const [elementId, hlc] of removeEntries) {
      this.remove(elementId, hlc);
    }
  }

  /**
   * Serialize to a plain object for IndexedDB / JSON persistence.
   *
   * @returns {{ adds: Object, removes: Object }}
   */
  getState() {
    return {
      adds: Object.fromEntries(this.adds),
      removes: Object.fromEntries(this.removes),
    };
  }

  /**
   * Reconstruct an ORSet from serialized state.
   *
   * @param {{ adds: Object, removes: Object }} state
   * @returns {ORSet}
   */
  static fromState(state) {
    const set = new ORSet();
    if (state && state.adds) {
      for (const [id, hlc] of Object.entries(state.adds)) {
        set.adds.set(id, hlc);
      }
    }
    if (state && state.removes) {
      for (const [id, hlc] of Object.entries(state.removes)) {
        set.removes.set(id, hlc);
      }
    }
    return set;
  }
}


// ---------------------------------------------------------------------------
// Operation helpers — structured ops for broadcast / persistence
// ---------------------------------------------------------------------------
// These create plain objects that can be serialized, queued in IndexedDB,
// and sent over Supabase Realtime or any other transport.
// ---------------------------------------------------------------------------

/**
 * Create a field-update operation (scalar value change).
 * Used when a user edits a takeoff field like quantity, description, unit cost.
 *
 * @param {string} domain — e.g. 'takeoff', 'item', 'estimate'
 * @param {string} id — UUID of the entity being modified
 * @param {string} field — field name being changed
 * @param {*} value — new value
 * @param {string} hlc — HLC string from the writer's clock
 * @param {string} userId — ID of the user who made the change
 * @returns {Object}
 */
export function createSetOp(domain, id, field, value, hlc, userId) {
  return { op: 'set', domain, id, field, value, hlc, userId, ts: Date.now() };
}

/**
 * Create a collection-add operation.
 * Used when a user adds a new takeoff to an estimate, or a new item to a takeoff.
 *
 * @param {string} domain — e.g. 'takeoff', 'item'
 * @param {string} id — UUID of the element being added
 * @param {*} value — initial value/payload of the element
 * @param {string} hlc — HLC string
 * @param {string} userId — ID of the user
 * @returns {Object}
 */
export function createAddOp(domain, id, value, hlc, userId) {
  return { op: 'add', domain, id, value, hlc, userId, ts: Date.now() };
}

/**
 * Create a collection-remove operation.
 * Used when a user deletes a takeoff or item.
 *
 * @param {string} domain — e.g. 'takeoff', 'item'
 * @param {string} id — UUID of the element being removed
 * @param {string} hlc — HLC string
 * @param {string} userId — ID of the user
 * @returns {Object}
 */
export function createRemoveOp(domain, id, hlc, userId) {
  return { op: 'remove', domain, id, hlc, userId, ts: Date.now() };
}

/**
 * Batch multiple operations for efficient broadcast.
 * Wrap a group of ops into a single message so the transport
 * can send them as one payload.
 *
 * @param {Object[]} ops — array of operation objects
 * @returns {{ type: string, ops: Object[], count: number }}
 */
export function batchOps(ops) {
  return { type: 'crdt_batch', ops, count: ops.length };
}
