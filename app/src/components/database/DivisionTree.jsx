import { useState } from "react";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";
import { CODE_SYSTEMS } from "@/constants/codeSystems";
import { sortDivisionNames, sortCodes } from "@/utils/csiFormat";

export default function DivisionTree({
  C,
  T,
  codeSystem,
  activeCodes,
  dbTree,
  dbExpandedDivs,
  toggleDbDiv,
  dbSelectedSub,
  setDbSelectedSub,
  dbSearch,
  setDbSearch,
  elements,
  addSubdivision,
  showToast,
}) {
  const [addSubForDiv, setAddSubForDiv] = useState(null);
  const [newSubCode, setNewSubCode] = useState("");
  const [newSubName, setNewSubName] = useState("");

  return (
    <div
      style={{
        width: 280,
        minWidth: 280,
        background: C.bg,
        borderRadius: `${T.radius.md}px 0 0 ${T.radius.md}px`,
        border: `1px solid ${C.border}`,
        borderRight: "none",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          {(CODE_SYSTEMS[codeSystem] || CODE_SYSTEMS["csi-commercial"]).name}
        </span>
        <span style={{ fontSize: 9, color: C.textDim }}>{Object.keys(activeCodes).length} divisions</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
        <div
          className="nav-item"
          onClick={() => {
            setDbSelectedSub(null);
            setDbSearch("");
          }}
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            color: !dbSelectedSub && !dbSearch ? C.accent : C.textMuted,
            background: !dbSelectedSub && !dbSearch ? C.accentBg : "transparent",
            marginBottom: 2,
          }}
        >
          All Items ({elements.length})
        </div>
        {Object.entries(dbTree)
          .sort(([a], [b]) => sortDivisionNames(a, b))
          .map(([dc, div], dIdx) => (
            <div
              key={dc}
              style={{
                animation: `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${200 + dIdx * 18}ms both`,
              }}
            >
              <div
                className="nav-item"
                onClick={() => toggleDbDiv(dc)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: div.count > 0 ? C.text : C.textMuted,
                }}
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  stroke={div.count > 0 ? C.accent : C.textDim}
                  strokeWidth="1.5"
                  style={{
                    transform: dbExpandedDivs.has(dc) ? "rotate(90deg)" : "rotate(0)",
                    transition: "transform 200ms cubic-bezier(0.16,1,0.3,1)",
                    flexShrink: 0,
                  }}
                >
                  <path d="M2 0.5l3.5 3.5L2 7.5" />
                </svg>
                <Ic d={I.folder} size={12} color={div.count > 0 ? C.accent : C.textDim} />
                <span
                  style={{
                    color: div.count > 0 ? C.accent : C.textDim,
                    fontFamily: T.font.sans,
                    fontSize: 10,
                    minWidth: 18,
                  }}
                >
                  {dc}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {div.name}
                </span>
                {div.count > 0 && (
                  <span
                    style={{
                      fontSize: 9,
                      color: C.accent,
                      fontWeight: 600,
                      background: `${C.accent}12`,
                      padding: "1px 5px",
                      borderRadius: 6,
                    }}
                  >
                    {div.count}
                  </span>
                )}
              </div>
              {dbExpandedDivs.has(dc) && (
                <>
                  {Object.entries(div.subs)
                    .sort(([a], [b]) => sortCodes(a, b))
                    .map(([subKey, sub], sIdx) => {
                      const isActive = dbSelectedSub === subKey;
                      const hasItems = sub.count > 0;
                      return (
                        <div
                          key={subKey}
                          className="nav-item"
                          onClick={() => {
                            setDbSelectedSub(subKey);
                            setDbSearch("");
                          }}
                          style={{
                            padding: "5px 10px 5px 34px",
                            borderRadius: 4,
                            fontSize: 10,
                            color: isActive ? C.accent : hasItems ? C.text : C.textDim,
                            background: isActive ? C.accentBg : "transparent",
                            fontWeight: isActive ? 600 : hasItems ? 500 : 400,
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            opacity: isActive || hasItems ? 1 : 0.7,
                            animation: `staggerFadeRight 220ms cubic-bezier(0.16,1,0.3,1) ${sIdx * 25}ms both`,
                            borderLeft: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
                            transition: "border-color 200ms ease-out, background 150ms ease-out",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: T.font.sans,
                              color: isActive ? C.accent : hasItems ? C.textMuted : C.textDim,
                              fontSize: 9,
                            }}
                          >
                            {subKey}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {sub.name}
                          </span>
                          {hasItems && (
                            <span
                              style={{
                                fontSize: 9,
                                color: C.accent,
                                fontWeight: 600,
                                background: `${C.accent}10`,
                                padding: "0 4px",
                                borderRadius: 4,
                              }}
                            >
                              {sub.count}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  {/* Add subdivision */}
                  {addSubForDiv === dc ? (
                    <div
                      style={{ display: "flex", gap: 4, alignItems: "center", padding: "4px 10px 4px 34px" }}
                    >
                      <input
                        placeholder={`${dc}.`}
                        value={newSubCode}
                        onChange={e => setNewSubCode(e.target.value)}
                        autoFocus
                        style={inp(C, {
                          width: 56,
                          fontSize: 9,
                          fontFamily: T.font.sans,
                          textAlign: "center",
                          padding: "2px 3px",
                        })}
                      />
                      <input
                        placeholder="Name..."
                        value={newSubName}
                        onChange={e => setNewSubName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            const code = newSubCode.trim();
                            const name = newSubName.trim();
                            if (code && name) {
                              const fullCode = code.includes(".") ? code : `${dc}.${code}`;
                              addSubdivision(dc, fullCode, name);
                              setNewSubCode("");
                              setNewSubName("");
                              setAddSubForDiv(null);
                              showToast(`Added subdivision ${fullCode}`);
                            }
                          }
                          if (e.key === "Escape") setAddSubForDiv(null);
                        }}
                        style={inp(C, { flex: 1, fontSize: 9, padding: "2px 4px" })}
                      />
                      <button
                        onClick={() => {
                          const code = newSubCode.trim();
                          const name = newSubName.trim();
                          if (code && name) {
                            const fullCode = code.includes(".") ? code : `${dc}.${code}`;
                            addSubdivision(dc, fullCode, name);
                            setNewSubCode("");
                            setNewSubName("");
                            setAddSubForDiv(null);
                            showToast(`Added subdivision ${fullCode}`);
                          }
                        }}
                        style={bt(C, { background: C.accent, color: "#fff", padding: "2px 6px", fontSize: 8 })}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setAddSubForDiv(null)}
                        style={bt(C, {
                          background: "transparent",
                          border: `1px solid ${C.border}`,
                          color: C.textDim,
                          padding: "2px 5px",
                          fontSize: 8,
                        })}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div
                      className="nav-item"
                      onClick={() => {
                        setAddSubForDiv(dc);
                        setNewSubCode("");
                        setNewSubName("");
                      }}
                      style={{
                        padding: "4px 10px 4px 34px",
                        borderRadius: 4,
                        fontSize: 9,
                        color: C.accent,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        opacity: 0.6,
                      }}
                    >
                      <Ic d={I.plus} size={9} color={C.accent} sw={2} /> Add subdivision...
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
