import { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useDatabaseStore } from '@/stores/databaseStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, bt } from '@/utils/styles';
import { nn, fmt2 } from '@/utils/format';

export default function AssemblySearch({ onInsertAssembly, onInsertItem, placeholder }) {
  const C = useTheme();
  const elements = useDatabaseStore(s => s.elements);
  const assemblies = useDatabaseStore(s => s.assemblies);

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [previewAsm, setPreviewAsm] = useState(null);
  const containerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setPreviewAsm(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Search results
  const results = useMemo(() => {
    if (!query.trim()) return { assemblies: [], items: [] };
    const q = query.toLowerCase();
    const asmResults = assemblies.filter(a =>
      (a.name || "").toLowerCase().includes(q) ||
      (a.code || "").toLowerCase().includes(q) ||
      (a.description || "").toLowerCase().includes(q)
    ).slice(0, 5);
    const itemResults = elements.filter(el =>
      (el.name || "").toLowerCase().includes(q) ||
      (el.code || "").toLowerCase().includes(q)
    ).slice(0, 8);
    return { assemblies: asmResults, items: itemResults };
  }, [query, assemblies, elements]);

  const hasResults = results.assemblies.length > 0 || results.items.length > 0;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); setPreviewAsm(null); }}
          onFocus={() => { if (query.trim()) setIsOpen(true); }}
          placeholder={placeholder || "Search assemblies & database..."}
          style={inp(C, { paddingLeft: 28, fontSize: 11 })}
        />
        <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>
          <Ic d={I.search} size={12} color={C.textDim} />
        </div>
      </div>

      {isOpen && query.trim() && hasResults && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: "100%", zIndex: 50,
          background: C.bg1, border: `1px solid ${C.border}`,
          borderRadius: C.T.radius.md, boxShadow: C.T.shadow.lg,
          maxHeight: 400, overflowY: "auto", minWidth: 320, marginTop: 4,
        }}>
          {/* Assembly results */}
          {results.assemblies.length > 0 && (
            <>
              <div style={{ padding: "5px 10px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.border}`, background: C.bg2, display: "flex", alignItems: "center", gap: 4 }}>
                <Ic d={I.assembly} size={10} color={C.accent} /> Assemblies
              </div>
              {results.assemblies.map(asm => {
                const totalPer = asm.elements.reduce((s, el) => s + (nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor), 0);
                const isPreviewing = previewAsm?.id === asm.id;
                return (
                  <div key={asm.id}>
                    <div className="nav-item" onClick={() => setPreviewAsm(isPreviewing ? null : asm)}
                      style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.bg}`, cursor: "pointer", background: isPreviewing ? C.accentBg : "transparent" }}>
                      <Ic d={I.assembly} size={12} color={C.accent} />
                      <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: C.text }}>{asm.name}</span>
                      <span style={{ fontSize: 8, color: C.textMuted, background: C.bg2, padding: "1px 6px", borderRadius: 8 }}>{asm.elements.length} items</span>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: C.accent, fontWeight: 600 }}>{fmt2(totalPer)}/ea</span>
                    </div>
                    {/* Inline preview when clicked */}
                    {isPreviewing && (
                      <div style={{ padding: "8px 12px", background: C.bg2, borderBottom: `1px solid ${C.border}` }}>
                        {asm.elements.map((el, i) => (
                          <div key={i} style={{ fontSize: 10, color: C.textMuted, padding: "2px 0", display: "flex", justifyContent: "space-between" }}>
                            <span>{el.desc}</span>
                            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: C.accent }}>{fmt2((nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor))}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                          <button className="accent-btn" onClick={() => {
                            onInsertAssembly(asm);
                            setQuery(""); setIsOpen(false); setPreviewAsm(null);
                          }} style={bt(C, { background: C.accent, color: "#fff", padding: "5px 12px", fontSize: 10 })}>
                            <Ic d={I.plus} size={10} color="#fff" sw={2.5} /> Insert All ({asm.elements.length} items)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Database items */}
          {results.items.length > 0 && (
            <>
              <div style={{ padding: "5px 10px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
                Database Items
              </div>
              {results.items.map(el => (
                <div key={el.id} className="nav-item" onClick={() => {
                  onInsertItem(el);
                  setQuery(""); setIsOpen(false);
                }}
                  style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.bg}`, cursor: "pointer" }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: C.purple, fontWeight: 600, minWidth: 60 }}>{el.code}</span>
                  <span style={{ flex: 1, fontSize: 11, color: C.text }}>{el.name}</span>
                  <span style={{ fontSize: 9, color: C.textDim }}>/{el.unit}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: C.accent, fontWeight: 600 }}>{fmt2(nn(el.material) + nn(el.labor) + nn(el.equipment))}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
