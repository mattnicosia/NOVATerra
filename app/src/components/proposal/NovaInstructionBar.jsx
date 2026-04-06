/**
 * NovaInstructionBar — Inline NOVA prompt for regenerating AI section content.
 * Shows a text input + regenerate button. Hidden in print.
 */
import { useState } from "react";

export default function NovaInstructionBar({ onRegenerate, generating, color, font }) {
  const [instruction, setInstruction] = useState("");
  const accentColor = color?.accent || "#1a1a2e";
  const dimColor = color?.textDim || "#666";

  const handleSubmit = (e) => {
    e.preventDefault();
    onRegenerate(instruction.trim());
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="no-print"
      style={{
        display: "flex", gap: 6, alignItems: "center",
        marginTop: 8, padding: "6px 0",
        borderTop: `1px dashed ${color?.borderLight || "#eee"}`,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: 9,
        background: generating ? accentColor : `${accentColor}20`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 800, color: generating ? "#fff" : accentColor,
        flexShrink: 0,
        animation: generating ? "pulse 1.5s ease-in-out infinite" : "none",
      }}>
        N
      </div>
      <input
        value={instruction}
        onChange={e => setInstruction(e.target.value)}
        placeholder={generating ? "Generating..." : "Tell NOVA how to improve this section..."}
        disabled={generating}
        style={{
          flex: 1, fontSize: 10, fontFamily: font || "inherit",
          padding: "4px 8px", borderRadius: 4,
          border: `1px solid ${color?.borderLight || "#eee"}`,
          background: "transparent", color: color?.text || "#333",
          outline: "none",
        }}
        onFocus={e => { e.target.style.borderColor = accentColor; }}
        onBlur={e => { e.target.style.borderColor = color?.borderLight || "#eee"; }}
      />
      <button
        type="submit"
        disabled={generating}
        style={{
          fontSize: 9, fontWeight: 700, padding: "4px 10px",
          borderRadius: 4, border: "none", cursor: generating ? "not-allowed" : "pointer",
          background: generating ? `${accentColor}30` : accentColor,
          color: generating ? dimColor : "#fff",
          whiteSpace: "nowrap",
        }}
      >
        {generating ? "..." : instruction.trim() ? "Regenerate" : "Regenerate"}
      </button>
    </form>
  );
}
