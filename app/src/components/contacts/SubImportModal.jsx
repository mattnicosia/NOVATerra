/**
 * SubImportModal — Bulk subcontractor import with NOVA trade categorization.
 * Three input modes: free-form paste, structured paste, CSV upload.
 * NOVA auto-categorizes companies by trade using AI.
 */
import { useState, useRef, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useUiStore } from "@/stores/uiStore";
import { callAnthropicStream } from "@/utils/ai";
import { fuzzyMatchTrade, TRADE_GROUPINGS, TRADE_MAP, TRADE_COLORS } from "@/constants/tradeGroupings";
import { TradeBadge } from "@/components/contacts/TradeMultiSelect";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, inp } from "@/utils/styles";

const TRADE_KEYS = TRADE_GROUPINGS.map(t => t.key);

export default function SubImportModal({ onClose, companyProfileId = "" }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const addBulkSubs = useMasterDataStore(s => s.addBulkSubs);
  const existingSubs = useMasterDataStore(s => s.masterData.subcontractors || []);
  const showToast = useUiStore(s => s.showToast);

  const [mode, setMode] = useState("freeform"); // "freeform" | "structured" | "csv"
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState([]); // parsed preview rows
  const [selected, setSelected] = useState(new Set());
  const [novaLoading, setNovaLoading] = useState(false);
  const [parseLoading, setParseLoading] = useState(false);
  const fileRef = useRef(null);

  // Dedup check
  const existingNames = useMemo(
    () => new Set(existingSubs.map(s => (s.company || "").toLowerCase().trim())),
    [existingSubs],
  );

  const isDuplicate = company => existingNames.has((company || "").toLowerCase().trim());

  // ── Parse: Free-form (NOVA) ─────────────────────────────────────────
  const parseFreeform = async () => {
    if (!rawText.trim()) return;
    setParseLoading(true);
    try {
      const fullText = await callAnthropicStream({
        max_tokens: 3000,
        system: `You are a data extraction assistant. Extract subcontractor/vendor company information from unstructured text. The text may be a plan holders list, email, bid invite, or any format.

For each company found, extract what you can: company name, contact person name, email, phone number.

Format each as:
COMPANY: [company name]
CONTACT: [contact person or empty]
EMAIL: [email or empty]
PHONE: [phone or empty]

Only include actual construction companies, vendors, or subcontractors. Skip general contractors, owners, and architects unless they appear to be subs on this project.`,
        messages: [
          {
            role: "user",
            content: `Extract subcontractor/vendor companies from this text:\n\n${rawText}`,
          },
        ],
        onText: () => {},
      });
      const parsed = parseCompanyBlocks(fullText);
      applyFuzzyTrades(parsed);
      setRows(parsed);
      setSelected(new Set(parsed.map((_, i) => i).filter(i => !isDuplicate(parsed[i].company))));
    } catch (err) {
      showToast(`Parse error: ${err.message}`, "error");
    } finally {
      setParseLoading(false);
    }
  };

  // ── Parse: Structured (local) ───────────────────────────────────────
  const parseStructured = () => {
    if (!rawText.trim()) return;
    const lines = rawText
      .split("\n")
      .map(l => l.trim())
      .filter(l => l);
    const parsed = lines.map(line => {
      // Try pipe-delimited first, then comma
      const delim = line.includes("|") ? "|" : ",";
      const parts = line.split(delim).map(p => p.trim());
      return {
        company: parts[0] || "",
        contact: parts[1] || "",
        email: parts[2] || "",
        phone: parts[3] || "",
        trades: [],
        tradeSource: "none",
      };
    }).filter(r => r.company);
    applyFuzzyTrades(parsed);
    setRows(parsed);
    setSelected(new Set(parsed.map((_, i) => i).filter(i => !isDuplicate(parsed[i].company))));
  };

  // ── CSV field parser (handles quoted fields with commas/newlines) ────
  const parseCSVRow = (line, delim) => {
    const fields = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        // Quoted field — read until closing quote (doubled quotes "" are escaped)
        let val = "";
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
              val += '"'; // escaped quote
              i += 2;
            } else {
              i++; // closing quote
              break;
            }
          } else {
            val += line[i++];
          }
        }
        fields.push(val.trim());
        if (i < line.length && line[i] === delim) i++; // skip delimiter
      } else {
        // Unquoted field
        const next = line.indexOf(delim, i);
        if (next === -1) {
          fields.push(line.substring(i).trim());
          break;
        } else {
          fields.push(line.substring(i, next).trim());
          i = next + 1;
        }
      }
    }
    return fields;
  };

  // ── Parse: CSV ──────────────────────────────────────────────────────
  const handleCSV = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
      if (lines.length < 2) { showToast("CSV appears empty", "error"); return; }

      // Detect delimiter: tab, semicolon, or comma
      const headerLine = lines[0];
      const delim = headerLine.includes("\t") ? "\t" : headerLine.includes(";") ? ";" : ",";
      const headers = parseCSVRow(headerLine, delim).map(h => h.toLowerCase());

      // Priority-based column detection — try exact/specific matches first
      const findCol = (pats) => {
        for (const pat of pats) {
          const idx = headers.findIndex(h => pat.test(h));
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const colIdx = {
        company:  findCol([/^company$/i, /\bcompany\b/i, /\bfirm\b/i]),
        contact:  findCol([/^contact$/i, /\bcontact\b/i, /^first\s*name$/i, /\bfirst\s*name\b/i]),
        lastName: findCol([/^last\s*name$/i, /\blast\s*name\b/i]),
        email:    findCol([/\bemail\b/i, /\be-mail\b/i]),
        phone:    findCol([/\bbusiness\s*phone\b/i, /\bphone\b/i, /\btel\b/i, /\bmobile\b/i]),
        trade:    findCol([/^trade/i, /\btrade/i, /\bscope\b/i, /\bdivision\b/i, /\bspecialt/i]),
      };
      // If no company column found, use first column
      if (colIdx.company === -1) colIdx.company = 0;

      const parsed = lines.slice(1).map(line => {
        const cols = parseCSVRow(line, delim);
        const rawTrade = colIdx.trade >= 0 ? cols[colIdx.trade] || "" : "";
        // Combine first + last name for contact if both columns exist
        let contact = colIdx.contact >= 0 ? cols[colIdx.contact] || "" : "";
        if (colIdx.lastName >= 0 && cols[colIdx.lastName] && cols[colIdx.lastName] !== ".") {
          const last = cols[colIdx.lastName] || "";
          contact = contact ? `${contact} ${last}`.trim() : last;
        }
        // Clean up placeholder dots in contact names
        if (contact === ".") contact = "";
        return {
          company: cols[colIdx.company] || "",
          contact,
          email: colIdx.email >= 0 ? cols[colIdx.email] || "" : "",
          phone: colIdx.phone >= 0 ? cols[colIdx.phone] || "" : "",
          trades: [],
          rawTrade,
          tradeSource: "none",
        };
      }).filter(r => r.company);

      applyFuzzyTrades(parsed);
      setRows(parsed);
      setSelected(new Set(parsed.map((_, i) => i).filter(i => !isDuplicate(parsed[i].company))));
    };
    reader.readAsText(file);
    // Reset file input
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Apply fuzzy trade matching ──────────────────────────────────────
  const applyFuzzyTrades = rows => {
    rows.forEach(r => {
      // Try rawTrade first (from CSV), then company name
      let matched = [];
      if (r.rawTrade) matched = fuzzyMatchTrade(r.rawTrade);
      if (matched.length === 0) matched = fuzzyMatchTrade(r.company);
      if (matched.length > 0) {
        r.trades = matched;
        r.tradeSource = "fuzzy";
      }
    });
  };

  // ── Parse COMPANY blocks from AI output ─────────────────────────────
  const parseCompanyBlocks = text => {
    const blocks = text.split(/COMPANY:\s*/i).filter(b => b.trim());
    return blocks.map(block => {
      const lines = block.split("\n");
      const company = (lines[0] || "").trim();
      const contact = (lines.find(l => /^CONTACT:/i.test(l.trim())) || "").replace(/^CONTACT:\s*/i, "").trim();
      const email = (lines.find(l => /^EMAIL:/i.test(l.trim())) || "").replace(/^EMAIL:\s*/i, "").trim();
      const phone = (lines.find(l => /^PHONE:/i.test(l.trim())) || "").replace(/^PHONE:\s*/i, "").trim();
      return { company, contact, email: email === "empty" ? "" : email, phone: phone === "empty" ? "" : phone, trades: [], tradeSource: "none" };
    }).filter(r => r.company && r.company !== "empty");
  };

  // ── NOVA Categorize unmatched ───────────────────────────────────────
  const novaCategorize = async () => {
    const unmatched = rows.filter((r, i) => selected.has(i) && r.trades.length === 0);
    if (unmatched.length === 0) { showToast("All companies already have trades"); return; }

    setNovaLoading(true);
    try {
      const companyList = unmatched.map((r, i) => `${i + 1}. ${r.company}`).join("\n");
      const tradeKeyList = TRADE_GROUPINGS.map(t => `${t.key} (${t.label})`).join(", ");

      const fullText = await callAnthropicStream({
        max_tokens: 2000,
        system: `You categorize construction subcontractors and vendors by trade based on their company name. Use ONLY these trade keys: ${tradeKeyList}.

For each company, infer the most likely trade(s) from the company name. Most companies have 1-2 trades. If the name is ambiguous, pick the most likely.

Format each result as:
COMPANY: [exact company name as given]
TRADES: [trade_key1, trade_key2]`,
        messages: [
          {
            role: "user",
            content: `Categorize these construction companies by trade:\n\n${companyList}`,
          },
        ],
        onText: () => {},
      });

      // Parse AI results
      const aiBlocks = fullText.split(/COMPANY:\s*/i).filter(b => b.trim());
      const aiMap = {};
      aiBlocks.forEach(block => {
        const lines = block.split("\n");
        const name = (lines[0] || "").trim();
        const tradesLine = lines.find(l => /^TRADES:/i.test(l.trim())) || "";
        const tradeStr = tradesLine.replace(/^TRADES:\s*/i, "").trim();
        const trades = tradeStr
          .split(/[,\s]+/)
          .map(t => t.trim().toLowerCase())
          .filter(t => TRADE_KEYS.includes(t));
        if (name && trades.length > 0) aiMap[name.toLowerCase()] = trades;
      });

      // Update rows with AI results
      setRows(prev =>
        prev.map(r => {
          if (r.trades.length > 0) return r;
          const matched = aiMap[r.company.toLowerCase()];
          if (matched) return { ...r, trades: matched, tradeSource: "nova" };
          return r;
        }),
      );

      const matchCount = Object.keys(aiMap).length;
      showToast(`NOVA categorized ${matchCount} of ${unmatched.length} companies`);
    } catch (err) {
      showToast(`NOVA error: ${err.message}`, "error");
    } finally {
      setNovaLoading(false);
    }
  };

  // ── Toggle row selection ────────────────────────────────────────────
  const toggleRow = idx => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((_, i) => i)));
  };

  // ── Remove trade from a row ─────────────────────────────────────────
  const removeTrade = (rowIdx, tradeKey) => {
    setRows(prev => prev.map((r, i) => (i === rowIdx ? { ...r, trades: r.trades.filter(t => t !== tradeKey) } : r)));
  };

  // ── Import selected ─────────────────────────────────────────────────
  const handleImport = () => {
    const toImport = rows.filter((_, i) => selected.has(i));
    const dupes = toImport.filter(r => isDuplicate(r.company));
    const fresh = toImport.filter(r => !isDuplicate(r.company));

    if (fresh.length === 0) {
      showToast("All selected subs are duplicates", "error");
      return;
    }

    const subs = fresh.map(r => ({
      company: r.company,
      contact: r.contact || "",
      email: r.email || "",
      phone: r.phone || "",
      trades: r.trades || [],
      markets: [],
      rating: "",
      certifications: [],
      notes: "",
      insuranceExpiry: "",
      bondingCapacity: "",
      emr: "",
      yearsInBusiness: "",
      licenseNo: "",
      website: "",
      address: "",
      companyProfileId: companyProfileId,
    }));

    addBulkSubs(subs);
    const msg = dupes.length > 0
      ? `Imported ${fresh.length} subs (${dupes.length} duplicates skipped)`
      : `Imported ${fresh.length} subcontractors`;
    showToast(msg);
    onClose();
  };

  // ── Stats ───────────────────────────────────────────────────────────
  const dupCount = rows.filter(r => isDuplicate(r.company)).length;
  const unmatchedCount = rows.filter((r, i) => selected.has(i) && r.trades.length === 0).length;
  const selectedCount = selected.size;

  const modes = [
    { key: "freeform", label: "Paste Text" },
    { key: "structured", label: "Structured" },
    { key: "csv", label: "CSV Upload" },
  ];

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.bg1,
          borderRadius: T.radius.lg,
          width: "min(680px, 92vw)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${C.border}`,
          boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: T.font.sans }}>Import Subcontractors</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4 }}>
            <Ic d={I.x} size={16} color={C.textDim} />
          </button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 4, padding: "10px 20px", borderBottom: `1px solid ${C.border}` }}>
          {modes.map(m => (
            <button
              key={m.key}
              onClick={() => { setMode(m.key); setRows([]); setRawText(""); }}
              style={bt(C, {
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: mode === m.key ? 700 : 500,
                background: mode === m.key ? `${C.accent}15` : "transparent",
                color: mode === m.key ? C.accent : C.textDim,
                border: `1px solid ${mode === m.key ? C.accent + "30" : "transparent"}`,
                borderRadius: T.radius.sm,
                cursor: "pointer",
                fontFamily: T.font.sans,
              })}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Input area */}
        <div style={{ padding: "12px 20px", flexShrink: 0 }}>
          {mode === "csv" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleCSV}
                style={{ fontSize: 12, fontFamily: T.font.sans, color: C.text }}
              />
              <span style={{ fontSize: 10, color: C.textDim }}>CSV with headers: company, contact, email, phone, trade</span>
            </div>
          ) : (
            <>
              <textarea
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder={
                  mode === "freeform"
                    ? "Paste a plan holders list, email, bid invite, or any text with sub/vendor names..."
                    : "Company Name | Contact | Email | Phone\nABC Mechanical | John Smith | john@abc.com | 555-1234"
                }
                style={{
                  ...inp(C),
                  width: "100%",
                  height: 100,
                  resize: "vertical",
                  fontSize: 11,
                  lineHeight: 1.5,
                  fontFamily: mode === "structured" ? "monospace" : T.font.sans,
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <button
                  onClick={mode === "freeform" ? parseFreeform : parseStructured}
                  disabled={!rawText.trim() || parseLoading}
                  style={bt(C, {
                    padding: "6px 16px",
                    fontSize: 11,
                    fontWeight: 600,
                    background: parseLoading ? C.bg3 : C.accent,
                    color: parseLoading ? C.textDim : "#fff",
                    border: "none",
                    cursor: parseLoading ? "default" : "pointer",
                    borderRadius: T.radius.sm,
                    fontFamily: T.font.sans,
                  })}
                >
                  {parseLoading ? (
                    <>
                      <span style={{
                        display: "inline-block", width: 10, height: 10,
                        border: "2px solid #fff3", borderTop: "2px solid #fff",
                        borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: 6,
                      }} />
                      {mode === "freeform" ? "NOVA Parsing..." : "Parsing..."}
                    </>
                  ) : (
                    "Parse"
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Preview table */}
        {rows.length > 0 && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Stats bar */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 20px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
              background: dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 10, fontFamily: T.font.sans }}>
                <span style={{ color: C.text, fontWeight: 600 }}>{rows.length} found</span>
                {dupCount > 0 && (
                  <span style={{ color: "#E67E22", fontWeight: 600 }}>{dupCount} duplicates</span>
                )}
                {unmatchedCount > 0 && (
                  <span style={{ color: C.textDim }}>{unmatchedCount} need trades</span>
                )}
              </div>
              {unmatchedCount > 0 && (
                <button
                  onClick={novaCategorize}
                  disabled={novaLoading}
                  style={bt(C, {
                    padding: "4px 10px",
                    fontSize: 10,
                    fontWeight: 600,
                    background: novaLoading ? C.bg3 : `linear-gradient(135deg, ${C.accent}15, ${C.purple || C.accent}15)`,
                    border: `1px solid ${C.accent}25`,
                    color: C.accent,
                    cursor: novaLoading ? "default" : "pointer",
                    borderRadius: T.radius.sm,
                    fontFamily: T.font.sans,
                  })}
                >
                  {novaLoading ? (
                    <>
                      <span style={{
                        display: "inline-block", width: 8, height: 8,
                        border: `1.5px solid ${C.accent}40`, borderTop: `1.5px solid ${C.accent}`,
                        borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: 4,
                      }} />
                      Categorizing...
                    </>
                  ) : (
                    <>
                      <Ic d={I.ai} size={10} color={C.accent} /> NOVA Categorize
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr 120px 140px 120px",
              gap: 0,
              padding: "4px 20px",
              fontSize: 9,
              fontWeight: 700,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontFamily: T.font.sans,
              borderBottom: `1px solid ${C.border}`,
              flexShrink: 0,
            }}>
              <span
                onClick={toggleAll}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <span style={{
                  width: 12, height: 12, borderRadius: 2,
                  border: `1.5px solid ${selected.size === rows.length ? C.accent : C.border}`,
                  background: selected.size === rows.length ? C.accent : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {selected.size === rows.length && <Ic d={I.check} size={7} color="#fff" />}
                </span>
              </span>
              <span>Company</span>
              <span>Contact</span>
              <span>Email</span>
              <span>Trades</span>
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {rows.map((r, i) => {
                const dup = isDuplicate(r.company);
                const isSelected = selected.has(i);

                return (
                  <div
                    key={i}
                    onClick={() => toggleRow(i)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr 120px 140px 120px",
                      gap: 0,
                      padding: "6px 20px",
                      fontSize: 11,
                      fontFamily: T.font.sans,
                      color: dup ? C.textDim : C.text,
                      opacity: dup ? 0.5 : 1,
                      background: isSelected ? (dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)") : "transparent",
                      cursor: "pointer",
                      borderBottom: `0.5px solid ${dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                      transition: "background 0.1s",
                      textDecoration: dup ? "line-through" : "none",
                    }}
                  >
                    {/* Checkbox */}
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{
                        width: 12, height: 12, borderRadius: 2,
                        border: `1.5px solid ${isSelected ? C.accent : C.border}`,
                        background: isSelected ? C.accent : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s",
                      }}>
                        {isSelected && <Ic d={I.check} size={7} color="#fff" />}
                      </span>
                    </span>

                    {/* Company */}
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>
                      {r.company}
                      {dup && <span style={{ fontSize: 8, color: "#E67E22", marginLeft: 4, fontWeight: 500, textDecoration: "none" }}>(dup)</span>}
                    </span>

                    {/* Contact */}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.textDim, fontSize: 10 }}>
                      {r.contact}
                    </span>

                    {/* Email */}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.textDim, fontSize: 10 }}>
                      {r.email}
                    </span>

                    {/* Trades */}
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                      {r.trades.length > 0 ? (
                        r.trades.map(tk => (
                          <span
                            key={tk}
                            onClick={() => removeTrade(i, tk)}
                            title={`${TRADE_MAP[tk]?.label || tk} — click to remove`}
                            style={{
                              fontSize: 8,
                              fontWeight: 600,
                              padding: "1px 5px",
                              borderRadius: 4,
                              background: r.tradeSource === "nova" ? `${C.accent}15` : `${TRADE_COLORS[tk] || C.accent}18`,
                              color: r.tradeSource === "nova" ? C.accent : TRADE_COLORS[tk] || C.text,
                              border: r.tradeSource === "nova" ? `1px solid ${C.accent}30` : "none",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {TRADE_MAP[tk]?.label?.split(" ")[0] || tk}
                            {r.tradeSource === "nova" && " *"}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: 9, color: C.textDim, opacity: 0.5 }}>?</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "12px 20px", borderTop: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={bt(C, {
              padding: "7px 16px",
              background: C.bg2,
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.sm,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: T.font.sans,
            })}
          >
            Cancel
          </button>
          {rows.length > 0 && (
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
              style={bt(C, {
                padding: "7px 20px",
                background: selectedCount > 0 ? C.accent : C.bg3,
                color: selectedCount > 0 ? "#fff" : C.textDim,
                border: "none",
                borderRadius: T.radius.sm,
                fontSize: 12,
                fontWeight: 700,
                cursor: selectedCount > 0 ? "pointer" : "default",
                fontFamily: T.font.sans,
              })}
            >
              Import {selectedCount} Sub{selectedCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}
