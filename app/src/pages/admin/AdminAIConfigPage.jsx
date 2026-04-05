// AdminAIConfigPage — /admin/ai-config
// AI feature configuration — admin only

import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp } from "@/utils/styles";

export default function AdminAIConfigPage() {
  const C = useTheme();
  const T = C.T;
  const appSettings = useUiStore(s => s.appSettings);
  const updateSetting = useUiStore(s => s.updateSetting);

  const features = [
    { name: "Spec Book Parsing", desc: "Upload PDF auto-extract CSI sections", icon: I.layers, color: C.purple },
    { name: "Smart Label / Auto Label", desc: "AI reads sheet numbers from title blocks", icon: I.plans, color: C.blue },
    { name: "Auto-Count (Vision)", desc: "AI counts repeated elements on drawings", icon: I.takeoff, color: C.green },
    { name: "AI Pricing Lookup", desc: "Get material/labor pricing estimates", icon: I.dollar, color: C.orange },
    { name: "Scope Suggestions", desc: "AI suggests takeoff items from drawings", icon: I.ai, color: C.accent },
    { name: "AI Chat Assistant", desc: "Context-aware project assistant", icon: I.send, color: C.cyan },
  ];

  return (
    <div style={{ maxWidth: 700, fontFamily: T.font.sans }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>AI Configuration</h1>
      <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 24 }}>
        Configure the AI features used for spec parsing, auto-labeling, scope suggestions, pricing lookup, and the AI chat assistant.
      </p>

      {/* Status */}
      <div
        style={{
          padding: "12px 16px",
          background: `${C.green}08`,
          borderRadius: 8,
          border: `1px solid ${C.green}25`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <Ic d={I.check} size={16} color={C.green} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>AI is built-in</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
            NOVA AI features are included with your account. No API key needed.
          </div>
        </div>
      </div>

      {/* FRED API Key */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            display: "block",
            marginBottom: 6,
          }}
        >
          FRED API Key (Market Data)
        </label>
        <input
          type="password"
          value={appSettings.fredApiKey || ""}
          onChange={e => updateSetting("fredApiKey", e.target.value)}
          placeholder="Your FRED API key..."
          style={inp(C, {
            padding: "8px 12px",
            fontSize: 12,
            fontFamily: T.font.sans,
            width: "100%",
            maxWidth: 500,
          })}
        />
        <div style={{ fontSize: 10, color: C.textDim, marginTop: 6 }}>
          Free API key for live construction market data (lumber, steel, housing starts). Get one at{" "}
          <a
            href="https://fred.stlouisfed.org/docs/api/api_key.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: C.accent, fontWeight: 500, textDecoration: "none" }}
          >
            fred.stlouisfed.org
          </a>
        </div>
      </div>

      {/* Datalab API Key */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            display: "block",
            marginBottom: 6,
          }}
        >
          Datalab API Key (Proposal Extraction)
        </label>
        <input
          type="password"
          value={appSettings.datalabApiKey || ""}
          onChange={e => updateSetting("datalabApiKey", e.target.value)}
          placeholder="Your Datalab API key..."
          style={inp(C, {
            padding: "8px 12px",
            fontSize: 12,
            fontFamily: T.font.sans,
            width: "100%",
            maxWidth: 500,
          })}
        />
        <div style={{ fontSize: 10, color: C.textDim, marginTop: 6 }}>
          Extracts structured data ($/SF, unit rates, material costs) from proposal PDFs. Get a key at{" "}
          <a
            href="https://www.datalab.to"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: C.accent, fontWeight: 500, textDecoration: "none" }}
          >
            datalab.to
          </a>
        </div>
      </div>

      {/* Feature List */}
      <div style={{ padding: "14px 16px", background: C.bg2, borderRadius: 8, border: `1px solid ${C.border}` }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 10,
          }}
        >
          AI-Powered Features
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {features.map(f => (
            <div
              key={f.name}
              style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 4 }}
            >
              <Ic d={f.icon} size={14} color={f.color} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{f.name}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
