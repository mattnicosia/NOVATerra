/**
 * useCollaborativeSync — CRDT-based real-time collaborative editing
 *
 * Replaces pessimistic locking with conflict-free concurrent editing.
 * Multiple users can edit the same estimate simultaneously — conflicts
 * are resolved algorithmically using Hybrid Logical Clocks (HLC).
 *
 * Architecture:
 *   Local store mutation → diff → CRDT ops → Supabase Broadcast → peers
 *   Peer broadcast → receive ops → HLC check → apply to local stores
 *
 * The existing blob-based auto-save (IndexedDB → Supabase) remains as
 * the durable persistence layer. CRDTs are the ephemeral real-time layer.
 *
 * Feature-gated: only active when VITE_ENABLE_CRDT=true AND org mode.
 */

import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/utils/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useOrgStore } from "@/stores/orgStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useProjectStore } from "@/stores/projectStore";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { tick, receive, isInitialized } from "@/lib/crdtClock";
import { shouldApply, recordHLC, resetState, serialize } from "@/lib/crdtState";
import { createSetOp, createAddOp, createRemoveOp, batchOps, HLC } from "@/lib/crdt";
import { storage } from "@/utils/storage";

// ── Feature flag ──
const CRDT_ENABLED = import.meta.env.VITE_ENABLE_CRDT === "true";

// ── Constants ──
const BROADCAST_EVENT = "crdt_ops";
const DIFF_THROTTLE_MS = 100; // min interval between outbound diffs
const MAX_OPS_PER_BATCH = 50; // cap ops per broadcast to avoid payload limits

// ── Diff helpers ──────────────────────────────────────────────

/**
 * Diff two arrays of entities (by id), producing CRDT ops.
 * Detects adds, removes, and field-level edits.
 */
function diffEntityArray(domain, prev, next, userId) {
  const ops = [];
  if (prev === next) return ops; // same reference — no change

  const prevMap = new Map((prev || []).map(e => [e.id, e]));
  const nextMap = new Map((next || []).map(e => [e.id, e]));

  // Additions
  for (const [id, entity] of nextMap) {
    if (!prevMap.has(id)) {
      const hlc = tick();
      ops.push(createAddOp(domain, id, entity, hlc, userId));
      recordHLC(domain, id, null, hlc);
    }
  }

  // Removals
  for (const [id] of prevMap) {
    if (!nextMap.has(id)) {
      const hlc = tick();
      ops.push(createRemoveOp(domain, id, hlc, userId));
      recordHLC(domain, id, null, hlc);
    }
  }

  // Field-level edits
  for (const [id, nextEntity] of nextMap) {
    const prevEntity = prevMap.get(id);
    if (!prevEntity) continue; // already handled as add

    for (const field of Object.keys(nextEntity)) {
      if (field === "id") continue;
      const pv = prevEntity[field];
      const nv = nextEntity[field];
      // Skip reference-equal values (unchanged)
      if (pv === nv) continue;
      // Skip deep-equal for simple types
      if (typeof nv !== "object" && pv === nv) continue;
      // For objects/arrays, do a fast JSON comparison
      if (typeof nv === "object" && JSON.stringify(pv) === JSON.stringify(nv)) continue;

      const hlc = tick();
      ops.push(createSetOp(domain, id, field, nv, hlc, userId));
      recordHLC(domain, id, field, hlc);
    }
  }

  return ops;
}

/**
 * Diff two plain objects (like project), producing field-level set ops.
 * Uses a synthetic "singleton" ID for the domain.
 */
function diffObject(domain, prev, next, userId) {
  const ops = [];
  if (prev === next) return ops;
  const singletonId = "_root";

  for (const field of new Set([...Object.keys(prev || {}), ...Object.keys(next || {})])) {
    const pv = (prev || {})[field];
    const nv = (next || {})[field];
    if (pv === nv) continue;
    if (typeof nv === "object" && JSON.stringify(pv) === JSON.stringify(nv)) continue;

    const hlc = tick();
    ops.push(createSetOp(domain, singletonId, field, nv, hlc, userId));
    recordHLC(domain, singletonId, field, hlc);
  }

  return ops;
}

// ── Apply helpers ─────────────────────────────────────────────

/**
 * Apply a received CRDT op to the appropriate Zustand store.
 * Returns true if applied, false if skipped (stale).
 */
function applyRemoteOp(op) {
  // Check HLC ordering
  if (!shouldApply(op.domain, op.id, op.field, op.hlc)) {
    return false;
  }

  // Merge remote clock
  receive(op.hlc);
  recordHLC(op.domain, op.id, op.field, op.hlc);

  switch (op.domain) {
    case "items":
      applyItemOp(op);
      break;
    case "takeoffs":
      applyTakeoffOp(op);
      break;
    case "project":
      applyProjectOp(op);
      break;
    case "subBidSubs":
    case "selections":
    case "overrides":
      applyBidOp(op);
      break;
    default:
      console.warn(`[crdt] Unknown domain: ${op.domain}`);
      return false;
  }
  return true;
}

function applyItemOp(op) {
  const store = useItemsStore;
  if (op.op === "add") {
    store.setState(s => {
      if (s.items.some(i => i.id === op.id)) return s; // already exists
      return { items: [...s.items, op.value] };
    });
  } else if (op.op === "remove") {
    store.setState(s => ({
      items: s.items.filter(i => i.id !== op.id),
    }));
  } else if (op.op === "set") {
    store.setState(s => ({
      items: s.items.map(i => (i.id === op.id ? { ...i, [op.field]: op.value } : i)),
    }));
  }
}

function applyTakeoffOp(op) {
  const store = useDrawingPipelineStore;
  if (op.op === "add") {
    store.setState(s => {
      if (s.takeoffs.some(t => t.id === op.id)) return s;
      return { takeoffs: [...s.takeoffs, op.value] };
    });
  } else if (op.op === "remove") {
    store.setState(s => ({
      takeoffs: s.takeoffs.filter(t => t.id !== op.id),
    }));
  } else if (op.op === "set") {
    store.setState(s => ({
      takeoffs: s.takeoffs.map(t => (t.id === op.id ? { ...t, [op.field]: op.value } : t)),
    }));
  }
}

function applyProjectOp(op) {
  if (op.op === "set") {
    useProjectStore.setState(s => ({
      project: { ...s.project, [op.field]: op.value },
    }));
  }
}

function applyBidOp(op) {
  const store = useBidManagementStore;
  const domain = op.domain; // 'subBidSubs', 'selections', 'overrides'
  if (op.op === "add") {
    store.setState(s => {
      const arr = s[domain] || [];
      if (arr.some(e => e.id === op.id)) return s;
      return { [domain]: [...arr, op.value] };
    });
  } else if (op.op === "remove") {
    store.setState(s => ({
      [domain]: (s[domain] || []).filter(e => e.id !== op.id),
    }));
  } else if (op.op === "set") {
    store.setState(s => ({
      [domain]: (s[domain] || []).map(e => (e.id === op.id ? { ...e, [op.field]: op.value } : e)),
    }));
  }
}

// ══════════════════════════════════════════════════════════════
// Hook
// ══════════════════════════════════════════════════════════════

export function useCollaborativeSync() {
  const user = useAuthStore(s => s.user);
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const orgReady = useOrgStore(s => s.orgReady);
  const org = useOrgStore(s => s.org);

  const channelRef = useRef(null);
  const applyingRemote = useRef(false);
  const lastDiffTime = useRef(0);
  const diffTimer = useRef(null);
  const prevSnapRef = useRef(null);

  // ── Snapshot the current store state for diffing ──
  const takeSnapshot = useCallback(() => ({
    items: useItemsStore.getState().items,
    takeoffs: useDrawingPipelineStore.getState().takeoffs,
    project: useProjectStore.getState().project,
    subBidSubs: useBidManagementStore.getState().subBidSubs,
    selections: useBidManagementStore.getState().selections,
    overrides: useBidManagementStore.getState().overrides,
  }), []);

  // ── Produce and broadcast CRDT ops from store diffs ──
  const broadcastDiff = useCallback(() => {
    if (!channelRef.current || !isInitialized() || applyingRemote.current) return;

    const userId = user?.id;
    if (!userId) return;

    const prev = prevSnapRef.current;
    const next = takeSnapshot();
    prevSnapRef.current = next;
    if (!prev) return; // first snapshot — no diff

    const ops = [
      ...diffEntityArray("items", prev.items, next.items, userId),
      ...diffEntityArray("takeoffs", prev.takeoffs, next.takeoffs, userId),
      ...diffObject("project", prev.project, next.project, userId),
      ...diffEntityArray("subBidSubs", prev.subBidSubs, next.subBidSubs, userId),
      ...diffEntityArray("selections", prev.selections, next.selections, userId),
      ...diffEntityArray("overrides", prev.overrides, next.overrides, userId),
    ];

    if (ops.length === 0) return;

    // Chunk if too many ops
    for (let i = 0; i < ops.length; i += MAX_OPS_PER_BATCH) {
      const chunk = ops.slice(i, i + MAX_OPS_PER_BATCH);
      channelRef.current.send({
        type: "broadcast",
        event: BROADCAST_EVENT,
        payload: batchOps(chunk),
      });
    }
  }, [user?.id, takeSnapshot]);

  // ── Main effect: channel lifecycle + store subscriptions ──
  useEffect(() => {
    if (!CRDT_ENABLED || !supabase || !user || !activeEstimateId || !orgReady || !org?.id) {
      return;
    }
    if (!isInitialized()) return;

    // Reset CRDT state for new estimate
    resetState(activeEstimateId);

    // Take initial snapshot
    prevSnapRef.current = takeSnapshot();

    // ── Create channel ──
    const channelName = `collab-${activeEstimateId}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } }, // don't echo own broadcasts
    });

    // ── Inbound: receive remote ops ──
    channel.on("broadcast", { event: BROADCAST_EVENT }, ({ payload }) => {
      if (!payload?.ops?.length) return;

      applyingRemote.current = true;
      let applied = 0;

      try {
        for (const op of payload.ops) {
          // Skip own ops (belt-and-suspenders — self:false should handle this)
          if (op.userId === user.id) continue;
          if (applyRemoteOp(op)) applied++;
        }
      } finally {
        applyingRemote.current = false;
        // Re-snapshot after applying remote ops so next diff doesn't echo them
        if (applied > 0) {
          prevSnapRef.current = takeSnapshot();
        }
      }
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[crdt] Joined channel ${channelName}`);
      }
    });

    channelRef.current = channel;

    // ── Outbound: subscribe to store changes and diff ──
    // Use the same slices as useAutoSave for consistency
    const schedDiff = () => {
      if (applyingRemote.current) return; // don't diff during remote apply
      const now = Date.now();
      const elapsed = now - lastDiffTime.current;
      if (elapsed < DIFF_THROTTLE_MS) {
        // Throttle: schedule for later
        if (diffTimer.current) clearTimeout(diffTimer.current);
        diffTimer.current = setTimeout(() => {
          lastDiffTime.current = Date.now();
          broadcastDiff();
        }, DIFF_THROTTLE_MS - elapsed);
      } else {
        lastDiffTime.current = now;
        broadcastDiff();
      }
    };

    const unsubs = [
      useItemsStore.subscribe(schedDiff),
      useDrawingPipelineStore.subscribe(schedDiff),
      useProjectStore.subscribe(schedDiff),
      useBidManagementStore.subscribe(schedDiff),
    ];

    // ── Persist CRDT state periodically (for offline recovery) ──
    const persistInterval = setInterval(() => {
      const crdtData = serialize();
      storage.setItem(`bldg-crdt-${activeEstimateId}`, JSON.stringify(crdtData)).catch(() => {});
    }, 30_000); // every 30s

    // ── Cleanup ──
    return () => {
      unsubs.forEach(u => u());
      if (diffTimer.current) clearTimeout(diffTimer.current);
      clearInterval(persistInterval);

      // Persist final state before leaving
      const crdtData = serialize();
      storage.setItem(`bldg-crdt-${activeEstimateId}`, JSON.stringify(crdtData)).catch(() => {});

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      prevSnapRef.current = null;
    };
  }, [CRDT_ENABLED, user, activeEstimateId, orgReady, org?.id, takeSnapshot, broadcastDiff]);

  return { enabled: CRDT_ENABLED && !!org?.id };
}
