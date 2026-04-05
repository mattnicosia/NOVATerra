import { useTheme } from "@/hooks/useTheme";
import { bt } from "@/utils/styles";
import Modal from "@/components/shared/Modal";

const GUIDE_VIDEO_URL = null; // Set to a Loom/YouTube embed URL to show video section

const GUIDE_STEPS = [
  {
    num: "1",
    title: "Create & Set Status",
    desc: 'Create an estimate from the Projects page, then set its status to "Bidding" to make it appear here.',
  },
  {
    num: "2",
    title: "Drag to Assign",
    desc: "Unassigned projects appear in the amber tray at the top. Drag any project card onto an estimator to assign it.",
  },
  {
    num: "3",
    title: "Reassign Anytime",
    desc: "Drag a project between estimator columns to reassign. Drop it back on the unassigned tray to remove the assignment.",
  },
  {
    num: "4",
    title: "Track Utilization",
    desc: "Each estimator shows a utilization percentage — green means capacity, amber means busy, red means overloaded.",
  },
  {
    num: "5",
    title: "NOVA Plan & Scenarios",
    desc: 'Use "NOVA Plan" to auto-balance workloads, or "Scenarios" to simulate adding or removing projects.',
  },
];

const GUIDE_TIPS = [
  "Use This Week view for day-by-day scheduling and drag-to-reschedule",
  "Double-click any project card to jump straight to the estimate",
  "The schedule status dot on each card shows if it's ahead, on-track, or behind",
  "Use the By Hours view to see detailed time breakdowns per estimator",
];

export default function ResourceGuideModal({ open, onClose }) {
  const C = useTheme();
  const T = C.T;

  return (
    <Modal open={open} onClose={onClose} wide>
      {/* Header */}
      <div style={{ marginBottom: T.space[5] }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div
              style={{
                fontSize: T.fontSize.xl,
                fontWeight: T.fontWeight.bold,
                color: C.text,
                letterSpacing: "-0.01em",
              }}
            >
              Resource Management
            </div>
            <div style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginTop: 2 }}>
              Assign estimators, balance workloads, and track capacity
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              ...bt(C),
              padding: "6px 14px",
              fontSize: T.fontSize.xs,
              fontWeight: 600,
              color: C.textMuted,
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.sm,
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Video Section (if URL is set) */}
      {GUIDE_VIDEO_URL && (
        <div
          style={{
            marginBottom: T.space[5],
            borderRadius: T.radius.md,
            overflow: "hidden",
            border: `1px solid ${C.border}`,
            aspectRatio: "16/9",
          }}
        >
          <iframe
            src={GUIDE_VIDEO_URL}
            title="Resource Management Guide"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>
      )}

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: T.space[3], marginBottom: T.space[5] }}>
        {GUIDE_STEPS.map(step => (
          <div
            key={step.num}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: T.space[3],
              padding: `${T.space[3]}px ${T.space[4]}px`,
              borderRadius: T.radius.md,
              background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              border: `1px solid ${C.border}30`,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: `${C.accent}15`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 800,
                color: C.accent,
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {step.num}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: T.fontSize.sm,
                  fontWeight: T.fontWeight.bold,
                  color: C.text,
                  marginBottom: 2,
                }}
              >
                {step.title}
              </div>
              <div style={{ fontSize: T.fontSize.xs, color: C.textMuted, lineHeight: 1.5 }}>{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Pro Tips */}
      <div
        style={{
          padding: `${T.space[3]}px ${T.space[4]}px`,
          borderRadius: T.radius.md,
          background: C.accentBg,
          border: `1px solid ${C.accent}20`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.accent,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: T.space[2],
          }}
        >
          Pro Tips
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {GUIDE_TIPS.map((tip, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: C.accent, fontSize: 10, marginTop: 2, flexShrink: 0 }}>&#9679;</span>
              <span style={{ fontSize: T.fontSize.xs, color: C.textMuted, lineHeight: 1.5 }}>{tip}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
