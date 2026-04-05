// RomAssumptions — Assumptions, exclusions, and footer disclaimer
import React from "react";
import { card, sectionLabel } from "@/utils/styles";
import { BUILDING_TYPE_LABELS } from "./romFormatters";

export default function RomAssumptions({ C, T, jobType, hasSoftCosts }) {
  const listStyle = {
    margin: 0,
    paddingLeft: T.space[5],
    color: C.textMuted,
    fontFamily: T.font.sans,
    fontSize: T.fontSize.sm,
    lineHeight: T.lineHeight.relaxed,
  };

  return (
    <>
      {/* Assumptions */}
      <div style={card(C, { padding: T.space[5], marginBottom: T.space[5] })}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Assumptions</div>
        <ul style={listStyle}>
          <li style={{ marginBottom: 4 }}>Building type: {BUILDING_TYPE_LABELS[jobType] || jobType}</li>
          <li style={{ marginBottom: 4 }}>Standard structural and envelope systems assumed</li>
          <li style={{ marginBottom: 4 }}>Typical MEP systems for building type</li>
          <li style={{ marginBottom: 4 }}>Mid-range finish levels</li>
          <li style={{ marginBottom: 4 }}>Normal site conditions and access</li>
          <li>Competitive market pricing in a metropolitan area</li>
        </ul>
      </div>

      {/* Exclusions */}
      <div style={card(C, { padding: T.space[5], marginBottom: T.space[5] })}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Exclusions</div>
        <ul style={listStyle}>
          <li style={{ marginBottom: 4 }}>Land acquisition costs</li>
          {!hasSoftCosts && <li style={{ marginBottom: 4 }}>Soft costs (A/E fees, permits, inspections)</li>}
          <li style={{ marginBottom: 4 }}>Owner contingency</li>
          <li style={{ marginBottom: 4 }}>FF&E (furniture, fixtures, and equipment)</li>
          <li style={{ marginBottom: 4 }}>Unusual site conditions or hazardous material abatement</li>
          <li>Escalation beyond current market conditions</li>
        </ul>
      </div>

      {/* Footer disclaimer */}
      <div style={{
        textAlign: "center",
        padding: `${T.space[4]}px 0`,
        fontSize: T.fontSize.xs,
        color: C.textDim,
        fontFamily: T.font.sans,
        lineHeight: T.lineHeight.relaxed,
        letterSpacing: 0.3,
      }}>
        This ROM is a preliminary estimate based on industry benchmarks.
        <br />
        Powered by NOVA Estimating Intelligence
      </div>
    </>
  );
}
