// DuplicateProjectDialog — shown when an RFP import (or new estimate) matches
// an existing project by name + address. Three choices: open existing, create
// as new (intentional duplicate, e.g. alternate scope), or cancel.

import { useTheme } from "@/hooks/useTheme";
import Modal from "@/components/shared/Modal";

function fmtRelative(dateStr) {
  if (!dateStr) return "unknown date";
  const d = new Date(dateStr);
  if (isNaN(d)) return String(dateStr);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString();
}

export default function DuplicateProjectDialog({ open, existing, incomingName, incomingAddress, onOpenExisting, onCreateAsNew, onCancel }) {
  const C = useTheme();
  const T = C.T;

  if (!existing) return null;

  const Btn = ({ kind, onClick, children }) => {
    const styles = {
      primary: { background: C.accent || "#7C6BF0", color: "#fff", border: "none" },
      secondary: { background: "transparent", color: C.text, border: `1px solid ${C.border}` },
      danger: { background: "transparent", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" },
    };
    return (
      <button
        onClick={onClick}
        style={{
          ...styles[kind],
          padding: "9px 16px",
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 8,
          cursor: "pointer",
          fontFamily: T?.font?.sans || "Switzer, sans-serif",
          letterSpacing: "0.01em",
          transition: "transform 80ms",
        }}
      >
        {children}
      </button>
    );
  };

  return (
    <Modal open={open} onClose={onCancel} width={520}>
      <div style={{ padding: 24 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: "#F59E0B",
          textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8,
          fontFamily: T?.font?.sans,
        }}>
          Project Already Exists
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: T?.font?.sans }}>
          You already have an estimate for this project
        </div>
        <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.5, marginBottom: 16, fontFamily: T?.font?.sans }}>
          A matching estimate is already in your dashboard. To prevent the duplicate-project bug we used to see, we're checking before creating a new one.
        </div>

        {/* Existing estimate card */}
        <div style={{
          padding: 14,
          background: `${C.accent}10`,
          border: `1px solid ${C.accent}30`,
          borderRadius: 10,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontFamily: T?.font?.sans }}>
            Existing
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: T?.font?.sans }}>
            {existing.name || "(unnamed)"}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, fontFamily: T?.font?.sans }}>
            Last modified {fmtRelative(existing.lastModified)}
            {existing.estimateNumber ? ` · #${existing.estimateNumber}` : ""}
            {existing.client ? ` · ${existing.client}` : ""}
          </div>
        </div>

        {/* Incoming */}
        {(incomingName || incomingAddress) && (
          <div style={{
            padding: 12,
            background: "transparent",
            border: `1px dashed ${C.border}`,
            borderRadius: 10,
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontFamily: T?.font?.sans }}>
              Incoming
            </div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: T?.font?.sans }}>
              {incomingName || "(unnamed)"}
            </div>
            {incomingAddress && (
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2, fontFamily: T?.font?.sans }}>
                {incomingAddress}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Btn kind="danger" onClick={onCancel}>Cancel</Btn>
          <Btn kind="secondary" onClick={onCreateAsNew}>Create as New</Btn>
          <Btn kind="primary" onClick={onOpenExisting}>Open Existing</Btn>
        </div>

        <div style={{ fontSize: 10, color: C.textDim, marginTop: 14, fontFamily: T?.font?.sans, lineHeight: 1.5 }}>
          <strong style={{ color: C.text, opacity: 0.85 }}>Open Existing</strong> routes the new RFP data into the existing estimate.{" "}
          <strong style={{ color: C.text, opacity: 0.85 }}>Create as New</strong> creates a separate estimate (use for an alternate scope or distinct re-bid).
        </div>
      </div>
    </Modal>
  );
}
