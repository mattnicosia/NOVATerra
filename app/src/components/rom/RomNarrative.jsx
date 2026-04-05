// RomNarrative — Project narrative summary section
import React from "react";
import { card, sectionLabel } from "@/utils/styles";

export default function RomNarrative({ C, T, showNarrative, setShowNarrative, narrative }) {
  if (!showNarrative) return null;

  return (
    <div style={card(C, { padding: `${T.space[5]}px`, marginBottom: T.space[4] })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ ...sectionLabel(C) }}>PROJECT NARRATIVE</div>
        <button onClick={() => setShowNarrative(false)} style={{
          background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 11,
          fontFamily: T.font.sans,
        }}>Hide</button>
      </div>
      <div style={{
        fontSize: T.fontSize.sm, color: C.textMuted, lineHeight: 1.7,
        fontFamily: T.font.sans, whiteSpace: "pre-line",
      }}>
        {narrative}
      </div>
    </div>
  );
}
