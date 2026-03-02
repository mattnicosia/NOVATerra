import { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useDatabaseStore } from '@/stores/databaseStore';
import { useItemsStore } from '@/stores/itemsStore';
import { searchSimilar } from '@/utils/vectorSearch';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, bt } from '@/utils/styles';
import { nn, fmt2 } from '@/utils/format';

export default function AssemblySearch({ onInsertAssembly, onInsertItem, placeholder }) {
  const C = useTheme();
  const elements = useDatabaseStore(s => s.elements);
  const assemblies = useDatabaseStore(s => s.assemblies);
  const projectAssemblies = useItemsStore(s => s.projectAssemblies);

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [previewAsm, setPreviewAsm] = useState(null);
  const [vectorResults, setVectorResults] = useState([]);
  const [vectorLoading, setVectorLoading] = useState(false);
  const containerRef = useRef(null);
  const vectorDebounceRef = useRef(null);

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

  // Local substring search (instant)
  const localResults = useMemo(() => {
    if (!query.trim()) return { projectAssemblies: [], assemblies: [], items: [] };
    const q = query.toLowerCase();
    const projAsmResults = projectAssemblies.filter(a =>
      (a.name || "").toLowerCase().includes(q) ||
      (a.code || "").toLowerCase().includes(q) ||
      (a.description || "").toLowerCase().includes(q)
    ).slice(0, 5);
    const asmResults = assemblies.filter(a =>
      (a.name || "").toLowerCase().includes(q) ||
      (a.code || "").toLowerCase().includes(q) ||
      (a.description || "").toLowerCase().includes(q)
    ).slice(0, 5);
    const itemResults = elements.filter(el =>
      (el.name || "").toLowerCase().includes(q) ||
      (el.code || "").toLowerCase().includes(q)
    ).slice(0, 8);
    return { projectAssemblies: projAsmResults, assemblies: asmResults, items: itemResults };
  }, [query, assemblies, projectAssemblies, elements]);

  // Debounced vector search (300ms delay, fires alongside local search)
  useEffect(() => {
    if (!query.trim() || query.length < 3) {
      setVectorResults([]);
      setVectorLoading(false);
      return;
    }
    clearTimeout(vectorDebounceRef.current);
    setVectorLoading(true);
    vectorDebounceRef.current = setTimeout(async () => {
      try {
        const { results } = await searchSimilar(query, {
          kinds: ['seed_element', 'user_element', 'seed_assembly', 'assembly'],
          limit: 5,
          threshold: 0.35,
        });
        setVectorResults(results || []);
      } catch {
        setVectorResults([]);
      } finally {
        setVectorLoading(false);
      }
    }, 300);
    return () => clearTimeout(vectorDebounceRef.current);
  }, [query]);

  // Merge local + vector results, deduplicating by ID
  const mergedItems = useMemo(() => {
    const localIds = new Set(localResults.items.map(el => el.id));
    // Vector results that aren't already in local results
    const vectorItems = vectorResults
      .filter(vr => vr.kind === 'seed_element' || vr.kind === 'user_element')
      .filter(vr => !localIds.has(vr.source_id))
      .map(vr => ({
        id: vr.source_id,
        code: vr.metadata?.code || '',
        name: vr.metadata?.name || vr.content,
        unit: vr.metadata?.unit || '',
        material: vr.metadata?.material || 0,
        labor: vr.metadata?.labor || 0,
        equipment: vr.metadata?.equipment || 0,
        trade: vr.metadata?.trade || '',
        _vectorMatch: true,
        _similarity: vr.similarity,
      }));
    return [...localResults.items, ...vectorItems].slice(0, 12);
  }, [localResults.items, vectorResults]);

  const hasResults = localResults.projectAssemblies.length > 0 || localResults.assemblies.length > 0 || mergedItems.length > 0;

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
          {/* Project assembly results */}
          {localResults.projectAssemblies.length > 0 && (
            <>
              <div style={{ padding: "5px 10px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.border}`, background: C.bg2, display: "flex", alignItems: "center", gap: 4 }}>
                <Ic d={I.assembly} size={10} color={C.green} /> Project Assemblies
              </div>
              {localResults.projectAssemblies.map(asm => {
                const totalPer = asm.elements.reduce((s, el) => s + (nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor), 0);
                const isPreviewing = previewAsm?.id === asm.id;
                return (
                  <div key={asm.id}>
                    <div className="nav-item" onClick={() => setPreviewAsm(isPreviewing ? null : asm)}
                      style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.bg}`, cursor: "pointer", background: isPreviewing ? C.accentBg : "transparent" }}>
                      <Ic d={I.assembly} size={12} color={C.green} />
                      <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: C.text }}>{asm.name}</span>
                      <span style={{ fontSize: 7, color: C.green, background: `${C.green}15`, padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>PROJECT</span>
                      <span style={{ fontSize: 8, color: C.textMuted, background: C.bg2, padding: "1px 6px", borderRadius: 8 }}>{asm.elements.length} items</span>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.accent, fontWeight: 600 }}>{fmt2(totalPer)}/ea</span>
                    </div>
                    {isPreviewing && (
                      <div style={{ padding: "8px 12px", background: C.bg2, borderBottom: `1px solid ${C.border}` }}>
                        {asm.elements.map((el, i) => (
                          <div key={i} style={{ fontSize: 10, color: C.textMuted, padding: "2px 0", display: "flex", justifyContent: "space-between" }}>
                            <span>{el.desc}</span>
                            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.accent }}>{fmt2((nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor))}</span>
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

          {/* Database assembly results */}
          {localResults.assemblies.length > 0 && (
            <>
              <div style={{ padding: "5px 10px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.border}`, background: C.bg2, display: "flex", alignItems: "center", gap: 4 }}>
                <Ic d={I.assembly} size={10} color={C.accent} /> Assemblies
              </div>
              {localResults.assemblies.map(asm => {
                const totalPer = asm.elements.reduce((s, el) => s + (nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor), 0);
                const isPreviewing = previewAsm?.id === asm.id;
                return (
                  <div key={asm.id}>
                    <div className="nav-item" onClick={() => setPreviewAsm(isPreviewing ? null : asm)}
                      style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.bg}`, cursor: "pointer", background: isPreviewing ? C.accentBg : "transparent" }}>
                      <Ic d={I.assembly} size={12} color={C.accent} />
                      <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: C.text }}>{asm.name}</span>
                      <span style={{ fontSize: 8, color: C.textMuted, background: C.bg2, padding: "1px 6px", borderRadius: 8 }}>{asm.elements.length} items</span>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.accent, fontWeight: 600 }}>{fmt2(totalPer)}/ea</span>
                    </div>
                    {/* Inline preview when clicked */}
                    {isPreviewing && (
                      <div style={{ padding: "8px 12px", background: C.bg2, borderBottom: `1px solid ${C.border}` }}>
                        {asm.elements.map((el, i) => (
                          <div key={i} style={{ fontSize: 10, color: C.textMuted, padding: "2px 0", display: "flex", justifyContent: "space-between" }}>
                            <span>{el.desc}</span>
                            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.accent }}>{fmt2((nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor))}</span>
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

          {/* Database items (local + vector merged) */}
          {mergedItems.length > 0 && (
            <>
              <div style={{ padding: "5px 10px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.border}`, background: C.bg2, display: "flex", alignItems: "center", gap: 4 }}>
                Database Items
                {vectorLoading && <span style={{ fontSize: 8, color: C.purple, marginLeft: 4 }}>searching...</span>}
              </div>
              {mergedItems.map(el => (
                <div key={el.id} className="nav-item" onClick={() => {
                  onInsertItem(el);
                  setQuery(""); setIsOpen(false);
                }}
                  style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.bg}`, cursor: "pointer" }}>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.purple, fontWeight: 600, minWidth: 60 }}>{el.code}</span>
                  <span style={{ flex: 1, fontSize: 11, color: C.text }}>{el.name}</span>
                  {el._vectorMatch && (
                    <span style={{ fontSize: 7, color: C.purple, background: C.bg2, padding: "1px 4px", borderRadius: 4, fontWeight: 600 }}>
                      {Math.round((el._similarity || 0) * 100)}%
                    </span>
                  )}
                  <span style={{ fontSize: 9, color: C.textDim }}>/{el.unit}</span>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.accent, fontWeight: 600 }}>{fmt2(nn(el.material) + nn(el.labor) + nn(el.equipment))}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
