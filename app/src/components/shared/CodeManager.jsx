import { useState, useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useProjectStore } from '@/stores/projectStore';
import { CODE_SYSTEMS } from '@/constants/codeSystems';
import Modal from '@/components/shared/Modal';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { bt, inp } from '@/utils/styles';

export default function CodeManager({ onClose }) {
  const C = useTheme();
  const T = C.T;

  const codeSystem = useProjectStore(s => s.codeSystem);
  const customCodes = useProjectStore(s => s.customCodes);
  const getActiveCodes = useProjectStore(s => s.getActiveCodes);
  const isCustomDivision = useProjectStore(s => s.isCustomDivision);
  const isCustomSubdivision = useProjectStore(s => s.isCustomSubdivision);
  const addDivision = useProjectStore(s => s.addDivision);
  const renameDivision = useProjectStore(s => s.renameDivision);
  const removeDivision = useProjectStore(s => s.removeDivision);
  const addSubdivision = useProjectStore(s => s.addSubdivision);
  const renameSubdivision = useProjectStore(s => s.renameSubdivision);
  const removeSubdivision = useProjectStore(s => s.removeSubdivision);
  const toggleHideDivision = useProjectStore(s => s.toggleHideDivision);
  const toggleHideSubdivision = useProjectStore(s => s.toggleHideSubdivision);
  const hiddenCodes = useProjectStore(s => s.hiddenCodes);

  const activeCodes = getActiveCodes();
  const sysName = CODE_SYSTEMS[codeSystem]?.name || codeSystem;

  // Hidden codes for current system
  const allBaseCodes = CODE_SYSTEMS[codeSystem]?.codes || {};
  const hidden = hiddenCodes[codeSystem] || { divisions: [], subdivisions: [] };
  const hiddenDivCount = hidden.divisions.length;
  const hiddenSubCount = hidden.subdivisions.length;
  const totalHidden = hiddenDivCount + hiddenSubCount;

  // Local state
  const [expandedDiv, setExpandedDiv] = useState(null);
  const [addDivOpen, setAddDivOpen] = useState(false);
  const [newDivCode, setNewDivCode] = useState("");
  const [newDivName, setNewDivName] = useState("");
  const [addSubOpen, setAddSubOpen] = useState(null); // divCode or null
  const [newSubCode, setNewSubCode] = useState("");
  const [newSubName, setNewSubName] = useState("");
  const [editingDiv, setEditingDiv] = useState(null);
  const [editDivName, setEditDivName] = useState("");
  const [editingSub, setEditingSub] = useState(null); // { div, sub }
  const [editSubName, setEditSubName] = useState("");
  const [filter, setFilter] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const customCodesForSystem = customCodes[codeSystem] || {};

  // Build full code list including hidden divisions when showHidden is on
  const allCodes = useMemo(() => {
    if (!showHidden) return activeCodes;
    // Merge active codes with hidden divisions/subs from base
    const merged = { ...activeCodes };
    hidden.divisions.forEach(dc => {
      if (allBaseCodes[dc] && !merged[dc]) {
        merged[dc] = allBaseCodes[dc];
      }
    });
    // For hidden subdivisions, add them back to their parent division
    hidden.subdivisions.forEach(sk => {
      const dc = sk.split(".")[0];
      if (merged[dc] && allBaseCodes[dc]?.subs?.[sk]) {
        merged[dc] = { ...merged[dc], subs: { ...merged[dc].subs, [sk]: allBaseCodes[dc].subs[sk] } };
      }
    });
    return merged;
  }, [activeCodes, showHidden, hidden, allBaseCodes]);

  // Sorted divisions
  const sortedDivisions = useMemo(() => {
    let entries = Object.entries(allCodes).sort(([a], [b]) => a.localeCompare(b));
    if (filter) {
      const q = filter.toLowerCase();
      entries = entries.filter(([dc, div]) =>
        dc.includes(q) || div.name.toLowerCase().includes(q) ||
        Object.entries(div.subs || {}).some(([sk, sn]) => sk.includes(q) || sn.toLowerCase().includes(q))
      );
    }
    return entries;
  }, [allCodes, filter]);

  const handleAddDivision = () => {
    const code = newDivCode.trim();
    const name = newDivName.trim();
    if (!code || !name) return;
    if (activeCodes[code]) return; // code already taken
    addDivision(code, name);
    setNewDivCode("");
    setNewDivName("");
    setAddDivOpen(false);
  };

  const handleAddSubdivision = (divCode) => {
    const code = newSubCode.trim();
    const name = newSubName.trim();
    if (!code || !name) return;
    // Ensure subdivision code starts with the division code
    const fullCode = code.includes(".") ? code : `${divCode}.${code}`;
    addSubdivision(divCode, fullCode, name);
    setNewSubCode("");
    setNewSubName("");
    setAddSubOpen(null);
  };

  const handleRenameDiv = (divCode) => {
    if (!editDivName.trim()) return;
    renameDivision(divCode, editDivName.trim());
    setEditingDiv(null);
  };

  const handleRenameSub = (divCode, subCode) => {
    if (!editSubName.trim()) return;
    renameSubdivision(divCode, subCode, editSubName.trim());
    setEditingSub(null);
  };

  const isDivHidden = (dc) => hidden.divisions.includes(dc);
  const isSubHidden = (sk) => hidden.subdivisions.includes(sk);

  return (
    <Modal onClose={onClose} wide>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[4] }}>
        <div>
          <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>Manage Cost Codes</div>
          <div style={{ fontSize: T.fontSize.xs, color: C.textDim, marginTop: 2 }}>{sysName} &middot; {Object.keys(activeCodes).length} divisions{totalHidden > 0 ? ` \u00b7 ${totalHidden} hidden` : ""}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <Ic d={I.x} size={16} color={C.textDim} />
        </button>
      </div>

      {/* Search + buttons */}
      <div style={{ display: "flex", gap: T.space[2], marginBottom: T.space[3] }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            placeholder="Filter divisions..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={inp(C, { paddingLeft: 28, fontSize: 12 })}
          />
          <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>
            <Ic d={I.search} size={12} color={C.textDim} />
          </div>
        </div>
        {totalHidden > 0 && (
          <button
            onClick={() => setShowHidden(!showHidden)}
            style={bt(C, {
              background: showHidden ? C.bg2 : "transparent",
              border: `1px solid ${C.border}`,
              color: showHidden ? C.text : C.textMuted,
              padding: "6px 12px", fontSize: 10,
            })}
          >
            <Ic d={showHidden ? I.eye : I.eyeOff} size={12} color={showHidden ? C.text : C.textDim} />
            {totalHidden} Hidden
          </button>
        )}
        <button
          onClick={() => { setAddDivOpen(true); setNewDivCode(""); setNewDivName(""); }}
          style={bt(C, { background: C.accent, color: "#fff", padding: "6px 14px", fontSize: 11 })}
        >
          <Ic d={I.plus} size={12} color="#fff" sw={2.5} /> Add Division
        </button>
      </div>

      {/* Add Division inline form */}
      {addDivOpen && (
        <div style={{
          background: C.accentBg, border: `1px solid ${C.accent}40`, borderRadius: T.radius.sm,
          padding: `${T.space[3]}px ${T.space[4]}px`, marginBottom: T.space[3],
          display: "flex", gap: T.space[2], alignItems: "center",
        }}>
          <input
            placeholder="Code (e.g. 50)"
            value={newDivCode}
            onChange={e => setNewDivCode(e.target.value)}
            autoFocus
            style={inp(C, { width: 80, fontSize: 12, fontFamily: "'DM Sans',sans-serif", textAlign: "center" })}
          />
          <input
            placeholder="Division name..."
            value={newDivName}
            onChange={e => setNewDivName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddDivision()}
            style={inp(C, { flex: 1, fontSize: 12 })}
          />
          <button onClick={handleAddDivision} style={bt(C, { background: C.accent, color: "#fff", padding: "5px 12px", fontSize: 10 })}>
            Add
          </button>
          <button onClick={() => setAddDivOpen(false)} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "5px 10px", fontSize: 10 })}>
            Cancel
          </button>
        </div>
      )}

      {/* Division list */}
      <div style={{ maxHeight: 420, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: T.radius.md }}>
        {sortedDivisions.map(([dc, div]) => {
          const isCustomDiv = isCustomDivision(dc);
          const divHidden = isDivHidden(dc);
          const isExpanded = expandedDiv === dc;

          // Get subdivisions — include hidden ones when showHidden is on
          let subs = Object.entries(div.subs || {}).sort(([a], [b]) => a.localeCompare(b));

          return (
            <div key={dc} style={{ opacity: divHidden ? 0.45 : 1 }}>
              {/* Division row */}
              <div
                style={{
                  display: "flex", alignItems: "center", gap: T.space[2],
                  padding: `${T.space[2]}px ${T.space[3]}px`,
                  borderBottom: `1px solid ${C.border}`,
                  background: divHidden ? `${C.red}08` : isExpanded ? C.bg2 : "transparent",
                  cursor: "pointer",
                }}
                onClick={() => setExpandedDiv(isExpanded ? null : dc)}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke={C.textDim} strokeWidth="1.5"
                  style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", flexShrink: 0 }}>
                  <path d="M2 0.5l3.5 3.5L2 7.5" />
                </svg>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.accent, fontWeight: 700, minWidth: 22 }}>{dc}</span>

                {editingDiv === dc ? (
                  <input
                    value={editDivName}
                    onChange={e => setEditDivName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleRenameDiv(dc); if (e.key === "Escape") setEditingDiv(null); }}
                    onBlur={() => handleRenameDiv(dc)}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                    style={inp(C, { fontSize: 11, padding: "2px 6px", flex: 1 })}
                  />
                ) : (
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: divHidden ? C.textDim : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: divHidden ? "line-through" : "none" }}>
                    {div.name}
                    {isCustomDiv && (
                      <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 700, color: C.accent, background: C.accentBg, padding: "1px 5px", borderRadius: 3, verticalAlign: "middle" }}>
                        CUSTOM
                      </span>
                    )}
                  </span>
                )}

                <span style={{ fontSize: 9, color: C.textDim }}>{subs.length} codes</span>

                {/* Hide/show toggle for standard divisions */}
                {!isCustomDiv && (
                  <button
                    className="icon-btn"
                    title={divHidden ? "Show division" : "Hide division"}
                    onClick={e => { e.stopPropagation(); toggleHideDivision(dc); }}
                    style={{ width: 22, height: 22, border: "none", background: "transparent", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  >
                    <Ic d={divHidden ? I.eyeOff : I.eye} size={11} color={divHidden ? C.red : C.textDim} />
                  </button>
                )}

                {isCustomDiv && (
                  <>
                    <button
                      className="icon-btn"
                      title="Rename division"
                      onClick={e => { e.stopPropagation(); setEditingDiv(dc); setEditDivName(div.name); }}
                      style={{ width: 22, height: 22, border: "none", background: "transparent", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      <Ic d={I.edit} size={11} color={C.textDim} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Delete division"
                      onClick={e => {
                        e.stopPropagation();
                        if (confirm(`Delete custom division "${dc} - ${div.name}" and all its subdivisions?`)) {
                          removeDivision(dc);
                          if (expandedDiv === dc) setExpandedDiv(null);
                        }
                      }}
                      style={{ width: 22, height: 22, border: "none", background: "transparent", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      <Ic d={I.trash} size={11} color={C.red} />
                    </button>
                  </>
                )}
              </div>

              {/* Expanded subdivisions */}
              {isExpanded && (
                <div style={{ background: C.bg2 + "60" }}>
                  {subs.map(([subKey, subName]) => {
                    const isCustomSub = isCustomSubdivision(dc, subKey);
                    const subHidden = isSubHidden(subKey);
                    // Only show hidden subs when showHidden is on (they're already filtered by getActiveCodes)
                    // but we re-add them in allCodes above when showHidden is true
                    return (
                      <div key={subKey} style={{
                        display: "flex", alignItems: "center", gap: T.space[2],
                        padding: `${T.space[1]}px ${T.space[3]}px ${T.space[1]}px 36px`,
                        borderBottom: `1px solid ${C.bg}`,
                        fontSize: 10,
                        opacity: subHidden ? 0.45 : 1,
                        background: subHidden ? `${C.red}06` : "transparent",
                      }}>
                        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.purple, fontWeight: 600, minWidth: 42 }}>
                          {subKey}
                        </span>

                        {editingSub?.div === dc && editingSub?.sub === subKey ? (
                          <input
                            value={editSubName}
                            onChange={e => setEditSubName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleRenameSub(dc, subKey); if (e.key === "Escape") setEditingSub(null); }}
                            onBlur={() => handleRenameSub(dc, subKey)}
                            autoFocus
                            style={inp(C, { fontSize: 10, padding: "1px 6px", flex: 1 })}
                          />
                        ) : (
                          <span style={{ flex: 1, color: subHidden ? C.textDim : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: subHidden ? "line-through" : "none" }}>
                            {subName}
                            {isCustomSub && (
                              <span style={{ marginLeft: 6, fontSize: 7, fontWeight: 700, color: C.accent, background: C.accentBg, padding: "0px 4px", borderRadius: 2, verticalAlign: "middle" }}>
                                CUSTOM
                              </span>
                            )}
                          </span>
                        )}

                        {/* Hide/show toggle for standard subdivisions */}
                        {!isCustomSub && !divHidden && (
                          <button
                            className="icon-btn"
                            title={subHidden ? "Show subdivision" : "Hide subdivision"}
                            onClick={() => toggleHideSubdivision(subKey)}
                            style={{ width: 18, height: 18, border: "none", background: "transparent", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                          >
                            <Ic d={subHidden ? I.eyeOff : I.eye} size={9} color={subHidden ? C.red : C.textDim} />
                          </button>
                        )}

                        {isCustomSub && (
                          <>
                            <button
                              className="icon-btn"
                              title="Rename subdivision"
                              onClick={() => { setEditingSub({ div: dc, sub: subKey }); setEditSubName(subName); }}
                              style={{ width: 18, height: 18, border: "none", background: "transparent", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                            >
                              <Ic d={I.edit} size={9} color={C.textDim} />
                            </button>
                            <button
                              className="icon-btn"
                              title="Remove subdivision"
                              onClick={() => {
                                if (confirm(`Remove custom subdivision "${subKey} - ${subName}"?`)) {
                                  removeSubdivision(dc, subKey);
                                }
                              }}
                              style={{ width: 18, height: 18, border: "none", background: "transparent", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                            >
                              <Ic d={I.trash} size={9} color={C.red} />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Add Subdivision inline form */}
                  {!divHidden && (addSubOpen === dc ? (
                    <div style={{
                      display: "flex", gap: T.space[2], alignItems: "center",
                      padding: `${T.space[2]}px ${T.space[3]}px ${T.space[2]}px 36px`,
                      background: C.accentBg + "60",
                    }}>
                      <input
                        placeholder={`${dc}.`}
                        value={newSubCode}
                        onChange={e => setNewSubCode(e.target.value)}
                        autoFocus
                        style={inp(C, { width: 70, fontSize: 10, fontFamily: "'DM Sans',sans-serif", textAlign: "center", padding: "2px 4px" })}
                      />
                      <input
                        placeholder="Subdivision name..."
                        value={newSubName}
                        onChange={e => setNewSubName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleAddSubdivision(dc)}
                        style={inp(C, { flex: 1, fontSize: 10, padding: "2px 6px" })}
                      />
                      <button onClick={() => handleAddSubdivision(dc)} style={bt(C, { background: C.accent, color: "#fff", padding: "3px 8px", fontSize: 9 })}>
                        Add
                      </button>
                      <button onClick={() => setAddSubOpen(null)} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "3px 6px", fontSize: 9 })}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => { setAddSubOpen(dc); setNewSubCode(""); setNewSubName(""); }}
                      style={{
                        padding: `${T.space[2]}px ${T.space[3]}px ${T.space[2]}px 36px`,
                        fontSize: 10, color: C.accent, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 4,
                        opacity: 0.7,
                      }}
                      className="nav-item"
                    >
                      <Ic d={I.plus} size={10} color={C.accent} sw={2} /> Add subdivision...
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {sortedDivisions.length === 0 && (
          <div style={{ padding: T.space[6], textAlign: "center", color: C.textMuted, fontSize: 12 }}>
            No divisions match your filter.
          </div>
        )}
      </div>

      {/* Footer info */}
      <div style={{ marginTop: T.space[3], fontSize: T.fontSize.xs, color: C.textDim, lineHeight: 1.5 }}>
        Click <Ic d={I.eye} size={10} color={C.textDim} style={{ verticalAlign: "middle" }} /> to hide standard codes you don't use. Hidden codes won't appear in the division tree or reports. Custom codes can be edited or deleted.
      </div>
    </Modal>
  );
}
