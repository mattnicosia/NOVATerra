import { useTheme } from "@/hooks/useTheme";
import { cardRaised, accentButton, bt } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { BT_BRAND } from "@/constants/btBrand";

// Map teaser icon keys to actual icon path data
const ICON_MAP = {
  dashboard: I.dashboard,
  inbox: I.inbox,
  database: I.database,
  insights: I.insights,
  people: I.user,
  settings: I.settings,
};

export default function LockedFeatureModal({ isOpen, onClose, feature }) {
  const C = useTheme();
  const T = C.T;

  if (!isOpen || !feature) return null;

  const iconPath = ICON_MAP[feature.icon] || I.eye;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: C.isDark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.25)",
        backdropFilter: "blur(12px) saturate(140%)",
        WebkitBackdropFilter: "blur(12px) saturate(140%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: T.z.modal,
        animation: "backdropFadeIn 250ms ease-out both",
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...cardRaised(C),
          padding: T.space[8],
          width: 380,
          maxWidth: "90vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: T.space[5],
          animation: "modalEnter 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Feature icon — large, dimmed purple */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: T.radius.lg,
            background: `${C.accent}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ic d={iconPath} size={32} color={`${C.accent}60`} sw={1.5} />
        </div>

        {/* Feature title */}
        <div
          style={{
            fontSize: T.fontSize.lg,
            fontWeight: T.fontWeight.bold,
            fontFamily: "'DM Sans', sans-serif",
            color: C.text,
            lineHeight: T.lineHeight.tight,
          }}
        >
          {feature.title}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: T.fontSize.base,
            fontFamily: "'DM Sans', sans-serif",
            color: C.textMuted,
            lineHeight: T.lineHeight.normal,
            maxWidth: 280,
          }}
        >
          {feature.desc}
        </div>

        {/* CTA button */}
        <button
          onClick={() => window.open(BT_BRAND.novaTerraUrl, "_blank")}
          style={accentButton(C, {
            padding: "10px 28px",
            fontSize: T.fontSize.base,
            marginTop: T.space[1],
          })}
        >
          Explore NOVATerra
          <Ic d={I.externalLink} size={14} color="#fff" sw={2} />
        </button>

        {/* Close link */}
        <button
          onClick={onClose}
          style={bt(C, {
            background: "none",
            color: C.textDim,
            fontSize: T.fontSize.sm,
            fontFamily: "'DM Sans', sans-serif",
            padding: "4px 12px",
          })}
        >
          Close
        </button>
      </div>
    </div>
  );
}
