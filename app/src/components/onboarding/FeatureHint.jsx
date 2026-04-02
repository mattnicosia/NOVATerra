/**
 * FeatureHint — Subtle dismissible banner for contextual feature discovery.
 * Shows max N times, then auto-dismisses. Stored in localStorage.
 */
import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { FEATURE_HINTS } from "@/constants/featureHints";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const STORAGE_KEY = "nova_hints";

function getHintData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function setHintData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function FeatureHint({ hintId }) {
  const C = useTheme();
  const T = C.T;
  const [visible, setVisible] = useState(false);
  const hint = FEATURE_HINTS[hintId];

  useEffect(() => {
    if (!hint) return;
    const data = getHintData();
    const entry = data[hintId] || { impressions: 0, dismissed: false };
    if (entry.dismissed || entry.impressions >= (hint.maxImpressions || 3)) return;

    // Show after a brief delay
    const timer = setTimeout(() => {
      entry.impressions++;
      data[hintId] = entry;
      setHintData(data);
      setVisible(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [hintId, hint]);

  const handleDismiss = () => {
    setVisible(false);
    const data = getHintData();
    data[hintId] = { ...data[hintId], dismissed: true };
    setHintData(data);
  };

  if (!visible || !hint) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: `${T.space[2]}px ${T.space[3]}px`,
        background: `${C.accent}06`,
        borderRadius: T.radius.md,
        border: `1px solid ${C.accent}15`,
        marginBottom: T.space[2],
        fontSize: 10,
        animation: "fadeIn 300ms ease-out",
      }}
    >
      <Ic d={I.ai} size={10} color={C.accent} />
      <span style={{ color: C.textDim, flex: 1 }}>{hint.message}</span>
      <button
        onClick={handleDismiss}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.5 }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
      >
        <Ic d={I.x} size={8} color={C.textDim} />
      </button>
    </div>
  );
}
