// Auto-Response Settings — toggle triggers, view status
import { useTheme } from "@/hooks/useTheme";
import { useAutoResponseStore, TRIGGER_TYPES } from "@/stores/autoResponseStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const TRIGGER_ORDER = [
  "portalOpened",
  "proposalSubmitted",
  "bidDue48h",
  "bidDue24h",
  "noResponse72h",
  "postAwardWinner",
  "postAwardLoser",
];

export default function AutoResponseSettings() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark !== false;
  const triggerConfig = useAutoResponseStore(s => s.triggerConfig);
  const updateTrigger = useAutoResponseStore(s => s.updateTrigger);
  const drafts = useAutoResponseStore(s => s.drafts);

  const sentCount = drafts.filter(d => d.status === "sent").length;
  const pendingCount = drafts.filter(d => d.status === "pending").length;

  return (
    <div style={{ fontFamily: T.font.sans }}>
      {/* Description */}
      <p style={{ fontSize: 12, color: C.textDim, margin: "0 0 16px", lineHeight: 1.5 }}>
        NOVA automatically drafts email responses when subcontractors interact with your bid packages. All drafts are
        queued for your review before sending.
      </p>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 16,
          padding: "10px 14px",
          background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
          borderRadius: 8,
          border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.green, fontFeatureSettings: "'tnum'" }}>
            {sentCount}
          </div>
          <div
            style={{ fontSize: 9, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            Sent
          </div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontFeatureSettings: "'tnum'" }}>
            {pendingCount}
          </div>
          <div
            style={{ fontSize: 9, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            Pending
          </div>
        </div>
      </div>

      {/* Trigger table */}
      <div
        style={{
          borderRadius: 8,
          border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          overflow: "hidden",
        }}
      >
        {TRIGGER_ORDER.map((type, idx) => {
          const meta = TRIGGER_TYPES[type];
          const config = triggerConfig[type] || { enabled: false };

          return (
            <div
              key={type}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderBottom:
                  idx < TRIGGER_ORDER.length - 1
                    ? `1px solid ${dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`
                    : "none",
                background: config.enabled ? (dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)") : "transparent",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: config.enabled ? meta.color : C.textDim,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{meta.label}</span>
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 2, paddingLeft: 12 }}>{meta.description}</div>
              </div>

              {/* Toggle switch */}
              <button
                onClick={() => updateTrigger(type, { enabled: !config.enabled })}
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  border: "none",
                  background: config.enabled
                    ? "linear-gradient(135deg, #7C5CFC, #BF5AF2)"
                    : dk
                      ? "rgba(255,255,255,0.10)"
                      : "rgba(0,0,0,0.12)",
                  cursor: "pointer",
                  position: "relative",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    background: "#fff",
                    position: "absolute",
                    top: 2,
                    left: config.enabled ? 18 : 2,
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </button>
            </div>
          );
        })}
      </div>

      {/* Note */}
      <p style={{ fontSize: 10, color: C.textDim, margin: "12px 0 0", lineHeight: 1.5 }}>
        Auto-responses are AI-drafted and always queued for your review before sending. A notification banner appears
        when drafts are ready.
      </p>
    </div>
  );
}
