/**
 * ConflictMergeModal — Shows when offline sync detects a conflict.
 * Options: Keep Mine, Use Theirs, Compare.
 */
import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";
import * as cloudSync from "@/utils/cloudSync";
import { loadEstimate } from "@/hooks/usePersistence";

const fmt = n => {
  if (!n) return "$0";
  return "$" + Math.round(n).toLocaleString();
};

export default function ConflictMergeModal() {
  const C = useTheme();
  const T = C.T;
  const conflictData = useUiStore(s => s.conflictData);
  const [showCompare, setShowCompare] = useState(false);
  const [resolving, setResolving] = useState(false);

  if (!conflictData) return null;
  const { estimateId, localBlob, cloudMeta } = conflictData;

  const handleKeepMine = async () => {
    setResolving(true);
    try {
      await cloudSync.pushEstimate?.(estimateId, localBlob);
    } catch { /* push error handled by cloudSync */ }
    useUiStore.getState().clearConflictData?.() || useUiStore.setState({ conflictData: null });
    setResolving(false);
  };

  const handleUseTheirs = async () => {
    setResolving(true);
    try {
      await cloudSync.pullAndApplyEstimate(estimateId);
      await loadEstimate(estimateId);
    } catch { /* pull error */ }
    useUiStore.getState().clearConflictData?.() || useUiStore.setState({ conflictData: null });
    setResolving(false);
  };

  const handleDismiss = () => {
    useUiStore.getState().clearConflictData?.() || useUiStore.setState({ conflictData: null });
  };

  // Comparison data
  const local = localBlob || {};
  const cloud = cloudMeta || {};
  const localItems = local.items?.length || local.itemCount || "?";
  const cloudItems = cloud.itemCount || "?";
  const localTotal = local.grandTotal || local.totalCost || 0;
  const cloudTotal = cloud.grandTotal || cloud.totalCost || 0;

  return (
    <Modal onClose={handleDismiss} title="Sync Conflict Detected">
      <div style={{ padding: T.space[3], maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: T.space[3] }}>
          <Ic d={I.warn} size={20} color={C.orange} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
              This estimate was modified by {cloud.savedByName || "a teammate"}
            </div>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
              while you were offline. Choose which version to keep.
            </div>
          </div>
        </div>

        {/* Compare view */}
        {showCompare && (
          <div style={{ marginBottom: T.space[3], borderRadius: T.radius.md, border: `1px solid ${C.border}15`, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", fontSize: 10 }}>
              <div style={{ padding: T.space[2], background: `${C.green}08`, borderRight: `1px solid ${C.border}10` }}>
                <div style={{ fontWeight: 700, color: C.green, marginBottom: 4 }}>Your Version</div>
                <div style={{ color: C.textDim }}>Items: <span style={{ color: C.text }}>{localItems}</span></div>
                <div style={{ color: C.textDim }}>Total: <span style={{ color: C.text }}>{fmt(localTotal)}</span></div>
                <div style={{ color: C.textDim, fontSize: 8, marginTop: 2 }}>
                  Last saved: {local._savedAt ? new Date(local._savedAt).toLocaleString() : "—"}
                </div>
              </div>
              <div style={{ padding: T.space[2], background: `${C.blue}08` }}>
                <div style={{ fontWeight: 700, color: C.blue, marginBottom: 4 }}>Their Version</div>
                <div style={{ color: C.textDim }}>Items: <span style={{ color: C.text }}>{cloudItems}</span></div>
                <div style={{ color: C.textDim }}>Total: <span style={{ color: C.text }}>{fmt(cloudTotal)}</span></div>
                <div style={{ color: C.textDim, fontSize: 8, marginTop: 2 }}>
                  Saved by: {cloud.savedByName || "teammate"} at {cloud.updatedAt ? new Date(cloud.updatedAt).toLocaleString() : "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            onClick={handleKeepMine}
            disabled={resolving}
            style={bt(C, {
              padding: "8px 16px", fontSize: 11, fontWeight: 600, width: "100%",
              background: C.green, color: "#fff", justifyContent: "center",
              opacity: resolving ? 0.5 : 1,
            })}
          >
            <Ic d={I.check} size={12} color="#fff" /> Keep My Version
          </button>
          <button
            onClick={handleUseTheirs}
            disabled={resolving}
            style={bt(C, {
              padding: "8px 16px", fontSize: 11, fontWeight: 600, width: "100%",
              background: C.blue, color: "#fff", justifyContent: "center",
              opacity: resolving ? 0.5 : 1,
            })}
          >
            <Ic d={I.download} size={12} color="#fff" /> Use Their Version
          </button>
          {!showCompare && (
            <button
              onClick={() => setShowCompare(true)}
              style={bt(C, {
                padding: "8px 16px", fontSize: 11, width: "100%",
                color: C.textDim, justifyContent: "center",
              })}
            >
              Compare Versions
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
