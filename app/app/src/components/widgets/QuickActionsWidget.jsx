import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

/* ────────────────────────────────────────────────────────
   QuickActionsWidget — One-click: new estimate, upload plans, import CSV, settings
   Grid widget version of Sprint 4.2 Quick Actions
   ──────────────────────────────────────────────────────── */

export default function QuickActionsWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const navigate = useNavigate();

  const actions = [
    {
      label: "New Estimate",
      icon: I.estimate,
      color: C.accent,
      action: () => navigate("/dashboard"),
      desc: "Start a fresh estimate",
    },
    {
      label: "Upload Plans",
      icon: I.upload,
      color: C.green,
      action: () => navigate("/planroom"),
      desc: "Scan drawings with NOVA",
    },
    {
      label: "Import CSV",
      icon: I.file,
      color: C.purple || C.accent,
      action: () => navigate("/core?tab=database"),
      desc: "Import cost data",
    },
    {
      label: "Settings",
      icon: I.settings,
      color: C.orange,
      action: () => navigate("/settings"),
      desc: "Company & preferences",
    },
  ];

  return (
    <div style={{ padding: "14px 16px", height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: ov(0.4),
          fontFamily: T.font.display,
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Ic d={I.grid} size={11} color={C.accent} />
        Quick Actions
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, flex: 1 }}>
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.action}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "10px 6px",
              background: dk ? `${a.color}08` : `${a.color}06`,
              border: `1px solid ${a.color}15`,
              borderRadius: 10,
              cursor: "pointer",
              transition: "background 0.15s, transform 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = dk ? `${a.color}15` : `${a.color}12`;
              e.currentTarget.style.transform = "scale(1.02)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = dk ? `${a.color}08` : `${a.color}06`;
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <Ic d={a.icon} size={16} color={a.color} />
            <span style={{ fontSize: 9, fontWeight: 600, color: C.text, fontFamily: T.font.display }}>{a.label}</span>
            <span style={{ fontSize: 7, color: ov(0.35), fontFamily: T.font.display }}>{a.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
