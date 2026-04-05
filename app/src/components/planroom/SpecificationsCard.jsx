// SpecificationsCard — Spec sections list with allocation status
import { useState } from "react";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { card } from "@/utils/styles";

export default function SpecificationsCard({ C, T, specs, items }) {
  const [specsExpanded, setSpecsExpanded] = useState(false);
  const allocatedSpecs = specs.filter(sp => items.some(i => i.specSection === sp.section));

  if (specs.length === 0) return null;

  return (
    <div style={{ ...card(C), padding: T.space[5] }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: T.space[3],
          cursor: "pointer",
        }}
        onClick={() => setSpecsExpanded(!specsExpanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <Ic d={I.plans} size={16} color={C.purple || C.accent} />
          <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>Specifications</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <span
            style={{
              fontSize: 10,
              color: allocatedSpecs.length === specs.length ? C.green : C.orange,
              fontWeight: 600,
            }}
          >
            {allocatedSpecs.length}/{specs.length} allocated
          </span>
          <Ic
            d={I.chevron}
            size={10}
            color={C.textDim}
            style={{
              transform: specsExpanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          />
        </div>
      </div>

      <div
        style={{
          maxHeight: specsExpanded ? "none" : 200,
          overflowY: specsExpanded ? "visible" : "auto",
          transition: "max-height 0.3s ease",
        }}
      >
        {specs.map(sp => {
          const allocated = items.some(i => i.specSection === sp.section);
          return (
            <div
              key={sp.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: T.space[2],
                padding: "4px 0",
                borderBottom: `1px solid ${C.border}08`,
                fontSize: T.fontSize.xs,
              }}
            >
              <span
                style={{
                  fontFamily: T.font.sans,
                  fontWeight: 600,
                  color: C.purple || C.accent,
                  minWidth: 70,
                  fontSize: 10,
                }}
              >
                {sp.section || "\u2014"}
              </span>
              <span
                style={{
                  flex: 1,
                  color: C.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {sp.title || "Untitled"}
              </span>
              {allocated ? (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: C.green,
                    background: `${C.green}12`,
                    padding: "2px 6px",
                    borderRadius: 3,
                  }}
                >
                  ALLOC
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    color: C.orange,
                    background: `${C.orange}12`,
                    padding: "2px 6px",
                    borderRadius: 3,
                  }}
                >
                  GAP
                </span>
              )}
            </div>
          );
        })}
      </div>

      {specs.length > 0 && allocatedSpecs.length < specs.length && (
        <div style={{ marginTop: T.space[2], fontSize: 10, color: C.orange, fontWeight: 500 }}>
          {specs.length - allocatedSpecs.length} unallocated spec section
          {specs.length - allocatedSpecs.length > 1 ? "s" : ""} — add scope items to cover
        </div>
      )}
      {!specsExpanded && specs.length > 8 && (
        <div
          onClick={() => setSpecsExpanded(true)}
          style={{
            textAlign: "center",
            padding: "6px 0",
            fontSize: 10,
            color: C.accent,
            cursor: "pointer",
            fontWeight: 600,
            marginTop: 2,
          }}
        >
          Show all {specs.length} sections
        </div>
      )}
    </div>
  );
}
