import { useState, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useUiStore } from '@/stores/uiStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, bt } from '@/utils/styles';
import { uid, today } from '@/utils/format';

/* ── tiny rating badge ────────────────────────── */
function RatingBadge({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <span style={{ fontSize: 7, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.7 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color, width: 22, height: 22, borderRadius: 4, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>{value}</span>
    </div>
  );
}

/* ── default roadmap seed data ────────────────── */
const DEFAULT_ROADMAP = [
  { id: "rm-1", tier: "now", name: "Project Activity Timer", desc: "Per-project timer that tracks active work time. Detects idle/downtime after 5 min of no mouse movement or clicks \u2014 auto-pauses, auto-resumes on activity. Shows active vs idle breakdown per session and cumulative per project. Helps track estimating hours for billing and productivity.", status: "Not started", value: 5, complexity: 3, impact: 4 },
  { id: "rm-2", tier: "now", name: "Proposal / Bid Export", desc: "Generate formatted proposal documents with cover letter, scope, pricing, notes & clarifications, exclusions, and bid form. Export as PDF or Word doc.", status: "\u2705 Built", value: 5, complexity: 4, impact: 5 },
  { id: "rm-3", tier: "now", name: "Alternates System", desc: "Add/deduct alternates with line items, shown on proposals and bid forms. Track accepted alternates and their impact on project total.", status: "\u2705 Built", value: 4, complexity: 3, impact: 4 },
  { id: "rm-4", tier: "now", name: "Logo Upload & Brand Colors", desc: "Upload company logo \u2192 system auto-extracts brand colors \u2192 generates 3-5 palette options for proposals and reports.", status: "\u2705 Built", value: 3, complexity: 2, impact: 3 },
  { id: "rm-5", tier: "now", name: "AI Value Engineering", desc: "AI scans project specs and estimate to suggest deduct alternates for less expensive options. Considers structural requirements and local code constraints.", status: "Not started", value: 5, complexity: 4, impact: 5 },
  { id: "rm-6", tier: "now", name: "Chain of Implications", desc: "When adding an item, system suggests related/dependent items. e.g. adding 'Ceramic Tile Floor' suggests underlayment, thinset, grout, transition strips.", status: "Not started", value: 5, complexity: 4, impact: 4 },
  { id: "rm-7", tier: "now", name: "AI Chat Panel", desc: "Live AI chatbot embedded in the estimating environment. Ask questions about the project, get CSI code suggestions.", status: "\u2705 Built", value: 4, complexity: 3, impact: 4 },
  { id: "rm-8", tier: "next", name: "ROM at Import + AI Learning Loop", desc: "AI generates a Rough Order of Magnitude ($/SF by CSI division) when an RFP is imported, using project SF, job type, location, scope, and PDF content. After the estimate is finalized, system compares ROM vs actual and stores deltas. Over time, the AI calibrates to YOUR market, subs, and region \u2014 getting more accurate with every project.", status: "Not started", value: 5, complexity: 5, impact: 5 },
  { id: "rm-9", tier: "next", name: "Estimating Log & Calendar", desc: "Track all active estimates in a single view with bid due dates, walkthrough dates, RFI due dates. Calendar view with color-coded status.", status: "Not started", value: 4, complexity: 3, impact: 3 },
  { id: "rm-10", tier: "next", name: "AI Chief Estimators", desc: "Different AI reviewer personalities: Old School GC (catches missed scope), Scope Hawk (line-by-line coverage), Value Engineer (cost-saving alternates).", status: "Not started", value: 4, complexity: 4, impact: 4 },
  { id: "rm-11", tier: "next", name: "Scheduling Tab", desc: "Auto-populates as bid is built. Sequence of operations with lead times, procurement timelines, construction duration.", status: "Not started", value: 4, complexity: 4, impact: 3 },
  { id: "rm-12", tier: "next", name: "Scope Matrix", desc: "Visual grid showing scope responsibility across trades. Prevents gaps and overlaps between subcontractors.", status: "Not started", value: 4, complexity: 3, impact: 4 },
  { id: "rm-13", tier: "later", name: "Bid Memory", desc: "Remember past bids for similar work. Historical pricing intelligence across projects.", status: "Not started", value: 4, complexity: 3, impact: 4 },
  { id: "rm-14", tier: "later", name: "Risk Scoring", desc: "AI assigns confidence scores to each line item. Flags items with high cost variance, missing quantities, or unusual pricing.", status: "Not started", value: 4, complexity: 4, impact: 4 },
  { id: "rm-15", tier: "later", name: "Sub Intelligence / CRM", desc: "Track subcontractor performance across projects: pricing accuracy, responsiveness, change order frequency, quality.", status: "Not started", value: 3, complexity: 4, impact: 4 },
  { id: "rm-16", tier: "later", name: "Post-Award Feedback Loop", desc: "After project completion, compare estimated vs actual costs. Feed actuals back into the database.", status: "Not started", value: 5, complexity: 3, impact: 5 },
  { id: "rm-17", tier: "later", name: "Buyout Tracker", desc: "Post-award tool to track subcontract buyout against estimated budget. Tracks committed costs, savings, and remaining exposure.", status: "Not started", value: 4, complexity: 3, impact: 4 },
  { id: "rm-18", tier: "later", name: "Bid Day Worksheet", desc: "Dedicated last-minute worksheet for bid day. Quick adjustments, alternates, add/deducts.", status: "Not started", value: 3, complexity: 2, impact: 3 },
  { id: "rm-19", tier: "later", name: "Drawing \u2194 Estimate Connection", desc: "Click an estimate line item, see the drawing markup it came from. Full traceability.", status: "Not started", value: 5, complexity: 5, impact: 4 },
  { id: "rm-20", tier: "later", name: "Scope-First Paradigm", desc: "Start from CSI structure and work through plans confirming what IS and ISN'T in scope. Coverage tracker shows % reviewed per division.", status: "Not started", value: 4, complexity: 4, impact: 4 },
  { id: "rm-21", tier: "later", name: "Human-in-the-Loop Staging", desc: "AI extractions go to staging area, not directly into estimate. Estimator confirms each item.", status: "Not started", value: 4, complexity: 3, impact: 3 },
];

const STORAGE_KEY = "bldg-roadmap";

export default function BrainstormPage() {
  const C = useTheme();
  const T = C.T;
  const showToast = useUiStore(s => s.showToast);
  const newIdeaOpen = useUiStore(s => s.newIdeaOpen);
  const setNewIdeaOpen = useUiStore(s => s.setNewIdeaOpen);
  const newIdea = useUiStore(s => s.newIdea);
  const setNewIdea = useUiStore(s => s.setNewIdea);

  /* ── editing state ── */
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  // User ideas persisted to localStorage
  const [userIdeas, setUserIdeas] = useState(() => {
    try {
      const raw = localStorage.getItem("bldg-ideas");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("bldg-ideas", JSON.stringify(userIdeas));
  }, [userIdeas]);

  // Roadmap items persisted to localStorage (seeded from defaults)
  const [roadmapItems, setRoadmapItems] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_ROADMAP;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roadmapItems));
  }, [roadmapItems]);

  /* ── helpers ── */
  const score = (it) => (it.value || 0) + (it.impact || 0) - (it.complexity || 0);

  const tiers = [
    { key: "now", title: "BUILD NOW \u2014 Next Priority", color: C.green },
    { key: "next", title: "BUILD NEXT \u2014 High Value", color: C.blue },
    { key: "later", title: "BUILD LATER \u2014 Strategic", color: C.purple },
  ];

  const deleteItem = (id) => {
    if (!confirm("Delete this brainstorm item?")) return;
    setRoadmapItems(prev => prev.filter(i => i.id !== id));
    if (editingId === id) { setEditingId(null); setEditDraft(null); }
    showToast("Item deleted");
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditDraft({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editDraft || !editDraft.name.trim()) return;
    setRoadmapItems(prev => prev.map(i => i.id === editDraft.id ? { ...editDraft, name: editDraft.name.trim(), desc: editDraft.desc.trim() } : i));
    setEditingId(null);
    setEditDraft(null);
    showToast("Item updated");
  };

  const statusOptions = ["\u2705 Built", "Not started", "In progress", "Planned"];

  /* ── small inline input style ── */
  const sInp = (extra) => inp(C, { fontSize: 12, padding: "6px 10px", ...extra });

  /* ── icon button style ── */
  const iconBtn = (color, extra) => ({ width: 24, height: 24, border: "none", background: C.bg2, color, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", ...extra });

  return (
    <div style={{ padding: T.space[7], minHeight: "100%", animation: "fadeIn 0.15s ease-out" }}>
      <div style={{ maxWidth: 1000 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: `linear-gradient(135deg,${C.accent},${C.accentDim})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ic d={I.ai} size={20} color="#fff" sw={2.5} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.accent, letterSpacing: 1 }}>BRAINSTORM</div>
              <div style={{ fontSize: 11, color: C.textDim }}>Feature ideas & roadmap &mdash; built-in ideas + yours</div>
            </div>
          </div>
          <button className="accent-btn" onClick={() => setNewIdeaOpen(true)} style={bt(C, { background: C.accent, color: "#fff", padding: "8px 16px" })}>
            <Ic d={I.plus} size={14} color="#fff" sw={2.5} /> Add Your Idea
          </button>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginBottom: 16, padding: "8px 14px", background: C.bg1, borderRadius: 6, border: `1px solid ${C.border}`, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.textDim }}>RATINGS (1-5):</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: C.green }}></span>
            <span style={{ fontSize: 10, color: C.textMuted }}>Value — user impact</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: C.orange }}></span>
            <span style={{ fontSize: 10, color: C.textMuted }}>Complexity — build effort</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: C.blue }}></span>
            <span style={{ fontSize: 10, color: C.textMuted }}>Impact — revenue / strategic</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: C.accent }}></span>
            <span style={{ fontSize: 10, color: C.textMuted }}>Score — val + impact − complexity</span>
          </div>
        </div>

        {/* New Idea Form */}
        {newIdeaOpen && (
          <div style={{ marginBottom: 20, padding: "16px 18px", background: C.bg1, borderRadius: 8, border: `2px solid ${C.accent}`, animation: "fadeIn 0.2s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>New Idea</div>
              <button className="icon-btn" onClick={() => { setNewIdeaOpen(false); setNewIdea({ title: "", desc: "", priority: "unsorted" }); }}
                style={{ width: 22, height: 22, border: "none", background: "transparent", color: C.textDim, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Ic d={I.x} size={12} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={newIdea.title} onChange={e => setNewIdea({ ...newIdea, title: e.target.value })} placeholder="Feature name or title..." style={inp(C, { fontSize: 14, fontWeight: 600, padding: "10px 12px" })} />
              <textarea value={newIdea.desc} onChange={e => setNewIdea({ ...newIdea, desc: e.target.value })} placeholder="Describe what it should do, why it matters..." rows={3} style={inp(C, { resize: "vertical", lineHeight: 1.5, fontSize: 12, padding: "10px 12px" })} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.textDim }}>Priority:</span>
                  {[{ k: "unsorted", l: "Unsorted", c: C.textDim }, { k: "now", l: "High", c: C.green }, { k: "next", l: "Medium", c: C.blue }, { k: "later", l: "Low", c: C.purple }].map(p => (
                    <button key={p.k} onClick={() => setNewIdea({ ...newIdea, priority: p.k })}
                      style={bt(C, { padding: "4px 10px", fontSize: 9, fontWeight: 600, borderRadius: 4, background: newIdea.priority === p.k ? `${p.c}18` : "transparent", border: `1px solid ${newIdea.priority === p.k ? p.c : C.border}`, color: newIdea.priority === p.k ? p.c : C.textDim })}>{p.l}</button>
                  ))}
                </div>
                <button className="accent-btn" onClick={() => {
                  if (!newIdea.title.trim()) return;
                  setUserIdeas(prev => [{ id: uid(), title: newIdea.title.trim(), desc: newIdea.desc.trim(), priority: newIdea.priority, date: today(), status: "idea", votes: 1 }, ...prev]);
                  setNewIdea({ title: "", desc: "", priority: "unsorted" }); setNewIdeaOpen(false);
                  showToast("Idea added!");
                }} disabled={!newIdea.title.trim()} style={bt(C, { background: newIdea.title.trim() ? C.accent : C.bg3, color: newIdea.title.trim() ? "#fff" : C.textDim, padding: "8px 20px" })}>
                  <Ic d={I.check} size={13} color={newIdea.title.trim() ? "#fff" : C.textDim} /> Submit Idea
                </button>
              </div>
            </div>
          </div>
        )}

        {/* User Ideas */}
        {userIdeas.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, padding: "6px 12px", background: C.accentBg, borderRadius: 5, borderLeft: `3px solid ${C.accent}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Your Ideas ({userIdeas.length})</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {userIdeas.map(idea => {
                const pc = { unsorted: C.textDim, now: C.green, next: C.blue, later: C.purple }[idea.priority] || C.textDim;
                const sc = { idea: C.textDim, planned: C.blue, building: C.orange, done: C.green }[idea.status] || C.textDim;
                return (
                  <div key={idea.id} style={{ padding: "10px 14px", background: C.bg1, borderRadius: T.radius.sm, border: `1px solid ${C.border}`, borderLeft: `3px solid ${pc}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{idea.title}</div>
                          <span style={{ fontSize: 7, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: `${pc}18`, color: pc, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            {{ unsorted: "Unsorted", now: "High", next: "Medium", later: "Low" }[idea.priority]}
                          </span>
                          <span style={{ fontSize: 7, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: `${sc}18`, color: sc, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            {idea.status}
                          </span>
                        </div>
                        {idea.desc && <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>{idea.desc}</div>}
                        <div style={{ fontSize: 9, color: C.textDim, marginTop: 4 }}>Added {idea.date}</div>
                      </div>
                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        <button className="icon-btn" title="Change priority" onClick={() => {
                          const order = ["unsorted", "now", "next", "later"];
                          const next = order[(order.indexOf(idea.priority) + 1) % order.length];
                          setUserIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, priority: next } : i));
                        }} style={{ width: 22, height: 22, border: "none", background: C.bg2, color: pc, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <Ic d={I.layers} size={10} color={pc} />
                        </button>
                        <button className="icon-btn" title="Change status" onClick={() => {
                          const order = ["idea", "planned", "building", "done"];
                          const next = order[(order.indexOf(idea.status) + 1) % order.length];
                          setUserIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, status: next } : i));
                        }} style={{ width: 22, height: 22, border: "none", background: C.bg2, color: sc, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <Ic d={I.check} size={10} color={sc} />
                        </button>
                        <button className="icon-btn" onClick={() => { if (confirm("Delete this idea?")) setUserIdeas(prev => prev.filter(i => i.id !== idea.id)); }}
                          style={{ width: 22, height: 22, border: "none", background: "transparent", color: C.red, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.5 }}>
                          <Ic d={I.trash} size={10} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Roadmap sections */}
        {tiers.map(tier => {
          const items = roadmapItems.filter(i => i.tier === tier.key);
          if (items.length === 0) return null;
          return (
            <div key={tier.key} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: tier.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, padding: "6px 12px", background: `${tier.color}11`, borderRadius: 5, borderLeft: `3px solid ${tier.color}` }}>{tier.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map(item => {
                  const isEditing = editingId === item.id;

                  /* ── EDIT MODE ── */
                  if (isEditing && editDraft) return (
                    <div key={item.id} style={{ padding: "14px 16px", background: C.bg1, borderRadius: T.radius.sm, border: `2px solid ${C.accent}`, animation: "fadeIn 0.15s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>Editing</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={saveEdit} style={bt(C, { background: C.green, color: "#fff", padding: "5px 14px", fontSize: 11 })}>
                            <Ic d={I.check} size={11} color="#fff" /> Save
                          </button>
                          <button onClick={cancelEdit} style={bt(C, { background: C.bg3, color: C.textDim, padding: "5px 14px", fontSize: 11 })}>Cancel</button>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input value={editDraft.name} onChange={e => setEditDraft({ ...editDraft, name: e.target.value })} placeholder="Feature name..." style={sInp({ fontWeight: 700 })} />
                        <textarea value={editDraft.desc} onChange={e => setEditDraft({ ...editDraft, desc: e.target.value })} placeholder="Description..." rows={3} style={sInp({ resize: "vertical", lineHeight: 1.5 })} />
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          {/* Tier */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: C.textDim }}>TIER</span>
                            <div style={{ display: "flex", gap: 3 }}>
                              {tiers.map(t => (
                                <button key={t.key} onClick={() => setEditDraft({ ...editDraft, tier: t.key })}
                                  style={bt(C, { padding: "4px 8px", fontSize: 9, fontWeight: 600, borderRadius: 4, background: editDraft.tier === t.key ? `${t.color}22` : "transparent", border: `1px solid ${editDraft.tier === t.key ? t.color : C.border}`, color: editDraft.tier === t.key ? t.color : C.textDim })}>
                                  {{ now: "Now", next: "Next", later: "Later" }[t.key]}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Status */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: C.textDim }}>STATUS</span>
                            <div style={{ display: "flex", gap: 3 }}>
                              {statusOptions.map(s => (
                                <button key={s} onClick={() => setEditDraft({ ...editDraft, status: s })}
                                  style={bt(C, { padding: "4px 8px", fontSize: 9, fontWeight: 600, borderRadius: 4, background: editDraft.status === s ? `${C.accent}22` : "transparent", border: `1px solid ${editDraft.status === s ? C.accent : C.border}`, color: editDraft.status === s ? C.accent : C.textDim })}>
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Ratings */}
                          {[{ k: "value", l: "Value", c: C.green }, { k: "complexity", l: "Complexity", c: C.orange }, { k: "impact", l: "Impact", c: C.blue }].map(r => (
                            <div key={r.k} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: r.c }}>{r.l}</span>
                              <div style={{ display: "flex", gap: 2 }}>
                                {[1, 2, 3, 4, 5].map(n => (
                                  <button key={n} onClick={() => setEditDraft({ ...editDraft, [r.k]: n })}
                                    style={{ width: 22, height: 22, border: `1px solid ${editDraft[r.k] === n ? r.c : C.border}`, background: editDraft[r.k] === n ? `${r.c}22` : "transparent", color: editDraft[r.k] === n ? r.c : C.textDim, borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    {n}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );

                  /* ── DISPLAY MODE ── */
                  return (
                    <div key={item.id} style={{ padding: "10px 14px", background: C.bg1, borderRadius: T.radius.sm, border: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{item.name}</div>
                          <span style={{ fontSize: 8, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: item.status === "\u2705 Built" ? "rgba(22,163,74,0.1)" : C.bg2, color: item.status === "\u2705 Built" ? C.green : C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.status}</span>
                        </div>
                        {/* Rating badges + actions */}
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                          <RatingBadge label="Val" value={item.value} color={C.green} />
                          <RatingBadge label="Cpx" value={item.complexity} color={C.orange} />
                          <RatingBadge label="Imp" value={item.impact} color={C.blue} />
                          <RatingBadge label="Scr" value={score(item)} color={C.accent} />
                          <div style={{ width: 1, height: 20, background: C.border, margin: "0 2px" }} />
                          <button className="icon-btn" title="Edit" onClick={() => startEdit(item)} style={iconBtn(C.accent)}>
                            <Ic d={I.edit || I.settings} size={11} color={C.accent} />
                          </button>
                          <button className="icon-btn" title="Delete" onClick={() => deleteItem(item.id)} style={iconBtn(C.red, { background: "transparent", opacity: 0.5 })}>
                            <Ic d={I.trash} size={11} color={C.red} />
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div style={{ padding: 14, background: C.bg1, borderRadius: 6, border: `1px solid ${C.border}`, marginTop: 8 }}>
          <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
            <strong style={{ color: C.accent }}>Already built:</strong> Dashboard with pipeline visualization & win rate, Plan Room with PDF support & Smart Label, Takeoffs with drawing viewer & scale-reactive measurements, Estimate with subdivision-scoped bid leveling, Alternates (add/deduct with line items), AI Pricing Lookup, Cost Database (full CSI 968 subdivisions), Assemblies, SOV with draggable blocks & custom markups, Reports (cost summary + proposal letter + bid form + detailed breakdown + alternates), Contacts with subcontractors & company profile, Logo upload with brand color extraction & palette options, Notes & Exclusions with AI-written exclusions, Allowances, AI Chat Panel, Auto-Count, Directives (F/I, F/O, I/O).
          </div>
        </div>
      </div>
    </div>
  );
}
