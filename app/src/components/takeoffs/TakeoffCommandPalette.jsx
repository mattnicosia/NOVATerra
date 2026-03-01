import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useTheme } from '@/hooks/useTheme';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

// Fuzzy match — case-insensitive substring
function fuzzy(text, query) {
  if (!query) return true;
  const lower = (text || '').toLowerCase();
  const terms = query.toLowerCase().split(/\s+/);
  return terms.every(t => lower.includes(t));
}

const RECENT_KEY = "tk_cmd_recent";
const MAX_RECENT = 5;

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}

function addRecent(id) {
  const prev = getRecent().filter(r => r !== id);
  const next = [id, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export default function TakeoffCommandPalette({
  open, onClose, takeoffs, drawings,
  onSelectTool, onSelectDrawing, onStartMeasuring,
  onRunAnalysis, onRunSchedules, onRunGeometry,
  onAiOutline, onAutoCount, getMeasuredQty,
}) {
  const C = useTheme();
  const T = C.T;
  const isDk = C.isDark;
  const ov = (a) => isDk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, onClose]);

  // Build all commands
  const allCommands = useMemo(() => {
    const cmds = [];

    // Tools
    cmds.push({ id: "tool-select", label: "Select", icon: I.pointer, category: "Tools", action: () => onSelectTool("select") });
    cmds.push({ id: "tool-linear", label: "Linear Measure", icon: I.ruler, category: "Tools", action: () => onSelectTool("linear") });
    cmds.push({ id: "tool-area", label: "Area Measure", icon: I.polygon, category: "Tools", action: () => onSelectTool("area") });
    cmds.push({ id: "tool-count", label: "Count", icon: I.hash, category: "Tools", action: () => onSelectTool("count") });
    cmds.push({ id: "tool-calibrate", label: "Calibrate Scale", icon: I.ruler, category: "Tools", action: () => onSelectTool("calibrate") });
    cmds.push({ id: "tool-outline", label: "Trace Outline", icon: I.polygon, category: "Tools", action: () => onSelectTool("outline") });

    // Takeoffs (dynamic)
    (takeoffs || []).forEach(t => {
      const qty = getMeasuredQty ? getMeasuredQty(t) : 0;
      cmds.push({
        id: `to-${t.id}`, label: t.description, sub: `${t.tool || t.unit} — ${qty} ${t.unit}`,
        icon: I.estimate, category: "Takeoffs", color: t.color,
        action: () => onStartMeasuring(t.id),
      });
    });

    // Drawings (dynamic)
    (drawings || []).forEach(d => {
      cmds.push({
        id: `dw-${d.id}`, label: `${d.sheetNumber || "?"} — ${d.sheetTitle || d.label || "Untitled"}`,
        icon: I.plans, category: "Drawings",
        action: () => onSelectDrawing(d.id),
      });
    });

    // AI Features
    cmds.push({ id: "ai-analyze", label: "AI Analyze Drawing", icon: I.ai, category: "AI", action: onRunAnalysis });
    cmds.push({ id: "ai-schedules", label: "Scan Schedules", icon: I.ai, category: "AI", action: onRunSchedules });
    cmds.push({ id: "ai-geometry", label: "Detect Geometry", icon: I.ai, category: "AI", action: onRunGeometry });
    cmds.push({ id: "ai-outline", label: "AI Detect Outline", icon: I.ai, category: "AI", action: onAiOutline });
    cmds.push({ id: "ai-autocount", label: "Auto Count", icon: I.ai, category: "AI", action: onAutoCount });

    return cmds;
  }, [takeoffs, drawings, onSelectTool, onSelectDrawing, onStartMeasuring, onRunAnalysis, onRunSchedules, onRunGeometry, onAiOutline, onAutoCount, getMeasuredQty]);

  // Build filtered results
  const results = useMemo(() => {
    if (!query) {
      // Show recent first, then Tools, then first few takeoffs
      const recentIds = getRecent();
      const recentItems = recentIds
        .map(id => allCommands.find(c => c.id === id))
        .filter(Boolean)
        .map(c => ({ ...c, category: "Recent" }));

      const tools = allCommands.filter(c => c.category === "Tools");
      const tkFirst = allCommands.filter(c => c.category === "Takeoffs").slice(0, 5);
      const ai = allCommands.filter(c => c.category === "AI");

      // Dedupe recent from other categories
      const recentSet = new Set(recentItems.map(r => r.id));
      return [
        ...recentItems,
        ...tools.filter(t => !recentSet.has(t.id)),
        ...tkFirst.filter(t => !recentSet.has(t.id)),
        ...ai.filter(t => !recentSet.has(t.id)),
      ];
    }
    return allCommands.filter(c => fuzzy(`${c.label} ${c.sub || ''} ${c.category}`, query));
  }, [query, allCommands]);

  // Clamp active index
  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1));
  }, [results.length, activeIndex]);

  // Execute
  const execute = useCallback((item) => {
    if (!item) return;
    addRecent(item.id);
    onClose();
    if (item.action) item.action();
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      execute(results[activeIndex]);
    }
  }, [results, activeIndex, execute]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[activeIndex];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  let lastCategory = '';

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: isDk ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.25)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
        animation: 'backdropFadeIn 0.15s ease both',
      }}
    >
      <div style={{
        width: 540, maxHeight: '60vh',
        background: isDk
          ? `linear-gradient(145deg, ${C.glassBg} 0%, ${C.glassBgDark || C.glassBg} 100%)`
          : C.bg1,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        boxShadow: isDk
          ? `0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px ${C.glassBorder || C.border}`
          : `0 25px 60px rgba(0,0,0,0.15), 0 0 0 1px ${C.border}`,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        animation: 'modalEnter 0.2s cubic-bezier(0.16,1,0.3,1) both',
        fontFamily: T.font.display,
      }}>
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px',
          borderBottom: `1px solid ${C.borderLight || C.border}`,
        }}>
          <Ic d={I.search} size={16} color={C.textDim} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tools, takeoffs, drawings, AI..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 15, fontWeight: 400, color: C.text,
              fontFamily: T.font.display,
              letterSpacing: '0.01em',
            }}
          />
          <kbd style={{
            fontSize: 10, fontWeight: 500, color: C.textDim,
            background: ov(0.05),
            border: `1px solid ${C.border}`,
            borderRadius: 5, padding: '2px 6px',
            fontFamily: T.font.mono,
          }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{
          overflowY: 'auto', flex: 1,
          padding: '6px 6px 8px',
        }}>
          {results.length === 0 && (
            <div style={{
              padding: '32px 18px', textAlign: 'center',
              color: C.textDim, fontSize: 13,
            }}>
              No results found
            </div>
          )}
          {results.map((item, i) => {
            const showHeader = item.category !== lastCategory;
            lastCategory = item.category;
            const isActive = i === activeIndex;

            return (
              <div key={item.id}>
                {showHeader && (
                  <div style={{
                    padding: '10px 12px 4px',
                    fontSize: 9.5, fontWeight: 600,
                    color: C.textDim,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}>{item.category}</div>
                )}
                <div
                  onClick={() => execute(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                    background: isActive ? `${C.accent}1F` : 'transparent',
                    border: isActive ? `1px solid ${C.accent}26` : '1px solid transparent',
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: isActive ? `${item.color || C.accent}26` : ov(0.04),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 0.1s',
                  }}>
                    <Ic d={item.icon} size={14} color={item.color || (isActive ? C.accent : C.textMuted)} />
                  </div>

                  {/* Label + sub */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500,
                      color: isActive ? C.text : C.textMuted,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{item.label}</div>
                    {item.sub && (
                      <div style={{
                        fontSize: 10.5, color: C.textDim, marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{item.sub}</div>
                    )}
                  </div>

                  {/* Color dot for takeoffs */}
                  {item.color && (
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: item.color,
                      boxShadow: `0 0 6px ${item.color}60`,
                    }} />
                  )}

                  {/* Enter hint on active */}
                  {isActive && (
                    <kbd style={{
                      fontSize: 9, fontWeight: 500, color: C.textDim,
                      background: ov(0.05),
                      border: `1px solid ${C.border}`,
                      borderRadius: 4, padding: '1px 5px',
                      fontFamily: T.font.mono, flexShrink: 0,
                    }}>&#9166;</kbd>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px',
          borderTop: `1px solid ${C.borderLight || C.border}`,
          fontSize: 10, color: C.textDim,
          fontFamily: T.font.mono,
        }}>
          <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>&#8593;&#8595; navigate</span>
            <span>&#9166; select</span>
          </div>
        </div>
      </div>
    </div>
  );
}
