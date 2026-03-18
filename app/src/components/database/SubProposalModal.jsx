import { useState, useRef, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useProjectStore } from "@/stores/projectStore";
import { useAuthStore } from "@/stores/authStore";
import { callAnthropic, pdfBlock } from "@/utils/ai";
import { parseXLSX } from "@/utils/xlsxParser";
import { parseCSV } from "@/utils/csvParser";
import { UNITS } from "@/constants/units";
import { TRADE_GROUPINGS } from "@/constants/tradeGroupings";
import { resolveLocationFactors } from "@/constants/locationFactors";
import { autoDirective } from "@/utils/directives";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, bt } from "@/utils/styles";
import { nn, uid } from "@/utils/format";

const TRADE_OPTIONS = TRADE_GROUPINGS.map(t => ({ key: t.key, label: t.label }));

export default function SubProposalModal({ onClose }) {
  const C = useTheme();
  const T = C.T;
  const showToast = useUiStore(s => s.showToast);
  const addElement = useDatabaseStore(s => s.addElement);
  const project = useProjectStore(s => s.project);
  const estimators = useMasterDataStore(s => s.masterData.estimators);
  const subcontractors = useMasterDataStore(s => s.masterData.subcontractors || []);
  const addMasterItem = useMasterDataStore(s => s.addMasterItem);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);
  const authUser = useAuthStore(s => s.user);

  const [step, setStep] = useState("upload"); // upload | processing | review | done
  const [file, setFile] = useState(null);
  const [subName, setSubName] = useState("");
  const [trade, setTrade] = useState("");
  const [error, setError] = useState("");
  const [extractedItems, setExtractedItems] = useState([]);
  const [rawItems, setRawItems] = useState([]); // un-normalized originals
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [pricingZip, setPricingZip] = useState(project?.zipCode || "");
  const [normalize, setNormalize] = useState(true);
  const [_importedCount, setImportedCount] = useState(0);
  const fileRef = useRef(null);

  // Resolve location factors from pricing zip
  const pricingLoc =
    pricingZip?.length >= 3
      ? resolveLocationFactors(pricingZip)
      : { mat: 1, lab: 1, equip: 1, label: "National Average", source: "none" };
  const hasLocationData = pricingLoc.source !== "none";

  const handleFile = async f => {
    setFile(f);
    setError("");
  };

  const tradeKeyList = TRADE_OPTIONS.map(t => `"${t.key}" (${t.label})`).join(", ");

  // Apply or remove normalization based on current pricingZip + normalize state
  const applyNormalization = useCallback((items, loc, shouldNormalize) => {
    if (!shouldNormalize || loc.source === "none") {
      return items.map(item => ({
        ...item,
        _normalized: false,
        _originalMaterial: undefined,
        _originalLabor: undefined,
        _originalEquipment: undefined,
      }));
    }
    return items.map(item => ({
      ...item,
      material: item.material ? Math.round((item.material / loc.mat) * 100) / 100 : 0,
      labor: item.labor ? Math.round((item.labor / loc.lab) * 100) / 100 : 0,
      equipment: item.equipment ? Math.round((item.equipment / loc.equip) * 100) / 100 : 0,
      _originalMaterial: item.material,
      _originalLabor: item.labor,
      _originalEquipment: item.equipment,
      _normalized: true,
    }));
  }, []);

  // Re-normalize when user changes zip or toggle in review step
  const reNormalize = useCallback(
    (newZip, newNormalize) => {
      if (rawItems.length === 0) return;
      const loc =
        newZip?.length >= 3
          ? resolveLocationFactors(newZip)
          : { mat: 1, lab: 1, equip: 1, label: "National Average", source: "none" };
      const shouldNorm = newNormalize && loc.source !== "none";
      const updated = applyNormalization(rawItems, loc, shouldNorm);
      setExtractedItems(updated);
    },
    [rawItems, applyNormalization],
  );

  const processFile = async () => {
    if (!file) return;

    setStep("processing");
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      let textContent = "";
      let isPdf = false;
      let pdfBase64 = "";

      const ext = (file.name || "").split(".").pop().toLowerCase();

      if (ext === "pdf") {
        isPdf = true;
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        pdfBase64 = btoa(binary);
      } else if (["xlsx", "xls", "xlsm"].includes(ext)) {
        const { headers, rows } = parseXLSX(buffer);
        textContent = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
      } else {
        const decoder = new TextDecoder();
        const rawText = decoder.decode(buffer);
        const { headers, rows } = parseCSV(rawText);
        textContent = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
      }

      const systemPrompt = `You are an expert construction cost estimator. Your job is to extract line items with unit rates from a subcontractor proposal/quote.

Extract EVERY line item that has a unit rate (cost per unit). For each item return:
- name: description of the scope item
- unit: the unit of measure (use standard abbreviations: SF, LF, SY, CY, EA, HR, LS, TON, LB, GAL, DAY, MO, CF, etc.)
- material: material cost per unit (0 if not broken out)
- labor: labor cost per unit (0 if not broken out)
- equipment: equipment cost per unit (0 if not broken out)
- subcontractor: the subcontractor's total unit rate if costs aren't broken out (put the full rate here)
- quantity: the quantity listed (0 if not specified)
- specSection: the most appropriate CSI MasterFormat 2020 subdivision code for this scope item based on its description. Use "XX.YYY" format (e.g. "07.610" for sheet metal flashing, "03.310" for structural concrete, "09.250" for gypsum board, "26.510" for interior luminaires). Always assign your best CSI code using your expert knowledge.
- specText: a brief written specification for THIS specific item describing materials, performance requirements, finishes, or standards referenced in the proposal (e.g. "24ga Galvalume, PVDF finish, Pac-Clad or equal" or "Type X, 5/8 inch, UL listed"). If the proposal doesn't specify, leave as empty string.
- trade: the best matching trade bundle key for this item. Valid keys: ${tradeKeyList}. Pick the single best match.
- subName: the subcontractor company name extracted from the proposal letterhead, signature, or header. Use the same value for all items.
- projectZip: the 5-digit US zip code of the project location mentioned in the proposal (from the project address, job site address, or "project location" field). Use the same value for all items. If no project location is found, use empty string.

If the proposal only shows a total rate per unit (not broken into material/labor/equipment), put the FULL unit rate in the "subcontractor" field.

IMPORTANT: Return ONLY valid JSON array. No markdown, no explanation. Example:
[{"name":"Concrete Footings","unit":"CY","material":0,"labor":0,"equipment":0,"subcontractor":185.00,"quantity":45,"specSection":"03.310","specText":"4000 PSI normal weight, air entrained","trade":"concrete","subName":"ABC Concrete Inc.","projectZip":"10001"}]`;

      const tradeHint = trade ? ` The trade is "${trade}".` : "";
      const subHint = subName ? ` The subcontractor is "${subName}".` : "";
      let userContent;
      if (isPdf) {
        userContent = [
          pdfBlock(pdfBase64),
          {
            type: "text",
            text: `Extract all line items with unit rates from this subcontractor proposal.${subHint}${tradeHint} Return as JSON array.`,
          },
        ];
      } else {
        userContent = `Extract all line items with unit rates from this subcontractor proposal data.${subHint}${tradeHint}\n\n${textContent}\n\nReturn as JSON array.`;
      }

      const result = await callAnthropic({
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
        temperature: 0,
      });

      // Parse JSON from response
      let items = [];
      try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          items = JSON.parse(jsonMatch[0]);
        } else {
          items = JSON.parse(result);
        }
      } catch {
        setError("Could not parse AI response. Try a different file format.");
        setStep("upload");
        return;
      }

      if (!Array.isArray(items) || items.length === 0) {
        setError("No line items found in the proposal. Try a different file.");
        setStep("upload");
        return;
      }

      // Normalize items from AI
      const normalized = items.map((item, idx) => ({
        id: uid(),
        name: item.name || item.description || `Item ${idx + 1}`,
        unit: (item.unit || "EA").toUpperCase(),
        material: nn(item.material),
        labor: nn(item.labor),
        equipment: nn(item.equipment),
        subcontractor: nn(item.subcontractor) || nn(item.sub) || nn(item.rate) || nn(item.unitRate),
        quantity: nn(item.quantity) || nn(item.qty),
        specSection: item.specSection || "",
        specText: item.specText || "",
        trade: item.trade || "",
        subName: item.subName || "",
        projectZip: item.projectZip || "",
      }));

      // Auto-fill subName from AI if user didn't provide one
      if (!subName) {
        const aiSub = normalized.find(i => i.subName)?.subName || "";
        if (aiSub) setSubName(aiSub);
      }

      // Auto-fill trade from AI if user didn't provide one
      if (!trade) {
        const aiTrade = normalized.find(i => i.trade)?.trade || "";
        if (aiTrade) setTrade(aiTrade);
      }

      // Auto-fill pricingZip from AI if user didn't already set one, or if it's still the project default
      const aiZip = normalized.find(i => i.projectZip)?.projectZip || "";
      if (aiZip && aiZip.length >= 3) {
        setPricingZip(aiZip);
        // Compute normalization with AI-detected zip
        const aiLoc = resolveLocationFactors(aiZip);
        const shouldNorm = normalize && aiLoc.source !== "none";
        const finalItems = applyNormalization(normalized, aiLoc, shouldNorm);
        setRawItems(normalized);
        setExtractedItems(finalItems);
        setSelectedIds(new Set(finalItems.map(i => i.id)));
      } else {
        // Use existing pricingZip (from project or user input)
        const shouldNorm = normalize && hasLocationData;
        const finalItems = applyNormalization(normalized, pricingLoc, shouldNorm);
        setRawItems(normalized);
        setExtractedItems(finalItems);
        setSelectedIds(new Set(finalItems.map(i => i.id)));
      }

      setStep("review");
    } catch (err) {
      setError(err.message || "Failed to process file");
      setStep("upload");
    }
  };

  const toggleItem = id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === extractedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(extractedItems.map(i => i.id)));
    }
  };

  const updateExtractedItem = (id, field, value) => {
    setExtractedItems(prev => prev.map(i => (i.id === id ? { ...i, [field]: value } : i)));
    // Also update rawItems so re-normalization uses latest user edits for non-normalized fields
    setRawItems(prev => prev.map(i => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const handleZipChange = newZip => {
    const cleaned = newZip.replace(/\D/g, "").slice(0, 5);
    setPricingZip(cleaned);
    reNormalize(cleaned, normalize);
  };

  const handleNormalizeToggle = checked => {
    setNormalize(checked);
    reNormalize(pricingZip, checked);
  };

  // Check if sub already exists in CRM
  const subAlreadyExists =
    subName && subcontractors.some(s => (s.company || "").toLowerCase().trim() === subName.toLowerCase().trim());

  const importSelected = () => {
    const userName =
      authUser?.user_metadata?.full_name || project?.estimator || (estimators.length > 0 ? estimators[0].name : "");
    const toImport = extractedItems.filter(i => selectedIds.has(i.id));
    let count = 0;
    for (const item of toImport) {
      const dir = autoDirective(item.material, item.labor, item.equipment, item.subcontractor);
      addElement({
        code: item.specSection || "",
        name: item.name,
        unit: item.unit,
        material: item.material,
        labor: item.labor,
        equipment: item.equipment,
        subcontractor: item.subcontractor,
        directive: dir,
        trade: item.trade || trade || "",
        addedBy: userName,
        addedDate: new Date().toLocaleDateString(),
        specVariants: [],
        specText: item.specText || "",
        source: subName ? `Sub: ${subName}` : "Sub Proposal",
        pricingBasis: item._normalized ? "national_avg" : "local",
        pricingSourceZip: pricingZip || "",
        pricingSourceLabel: hasLocationData ? pricingLoc.label : "",
      });
      count++;
    }
    setImportedCount(count);

    // Auto-add new sub to contacts and close
    if (subName && !subAlreadyExists) {
      addMasterItem("subcontractors", {
        company: subName,
        trades: trade ? [trade] : [],
        contact: "",
        email: "",
        phone: "",
        notes: "Imported from sub proposal",
        rating: "",
        markets: [],
        insuranceExpiry: "",
        bondingCapacity: "",
        emr: "",
        certifications: [],
        yearsInBusiness: "",
        licenseNo: "",
        website: "",
        address: "",
        companyProfileId: (activeCompanyId === "__all__" ? "" : activeCompanyId) || "",
      });
      showToast(`Imported ${count} item${count !== 1 ? "s" : ""} — "${subName}" added to People`);
    } else {
      showToast(`Imported ${count} item${count !== 1 ? "s" : ""} from sub proposal`);
    }
    onClose();
  };

  const overlay = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    animation: "backdropFadeIn 250ms ease-out both",
  };
  const modal = {
    background: C.bg,
    border: `1px solid ${C.glassBorder || "rgba(255,255,255,0.08)"}`,
    borderRadius: 12,
    width: step === "review" ? 1160 : 520,
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 16px 48px rgba(0,0,0,0.4), 0 0 40px rgba(0,0,0,0.15)",
    animation: "modalEnter 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
    transition: "width 0.2s ease",
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${C.accent}20, ${C.purple}20)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ic d={I.upload} size={16} color={C.accent} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Import Sub Proposal</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>
                Upload a subcontractor proposal to extract unit rates
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4 }}
          >
            <Ic d={I.close} size={16} color={C.textDim} />
          </button>
        </div>

        {/* Upload Step */}
        {step === "upload" && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>
                Subcontractor Name (optional — AI will detect)
              </label>
              <input
                value={subName}
                onChange={e => setSubName(e.target.value)}
                placeholder="e.g. ABC Electrical"
                style={inp(C, { fontSize: 12, padding: "8px 10px" })}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>
                Trade (optional — AI will detect)
              </label>
              <select
                value={trade}
                onChange={e => setTrade(e.target.value)}
                style={inp(C, { fontSize: 12, padding: "8px 10px" })}
              >
                <option value="">Auto-detect from proposal</option>
                {TRADE_OPTIONS.map(t => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              style={{
                border: `2px dashed ${file ? C.accent : C.border}`,
                borderRadius: 10,
                padding: 28,
                textAlign: "center",
                cursor: "pointer",
                background: file ? `${C.accent}08` : C.bg2,
                transition: "all 0.15s",
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.xlsm,.csv,.tsv,.txt"
                hidden
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {file ? (
                <div>
                  <Ic d={I.check} size={24} color={C.green} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 6 }}>{file.name}</div>
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                    {(file.size / 1024).toFixed(0)} KB — Click to change
                  </div>
                </div>
              ) : (
                <div>
                  <Ic d={I.upload} size={28} color={C.textDim} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginTop: 8 }}>
                    Drop proposal here or click to browse
                  </div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
                    Supports PDF, Excel (.xlsx/.xls), CSV
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div
                style={{ fontSize: 11, color: C.red, padding: "6px 10px", background: `${C.red}12`, borderRadius: 6 }}
              >
                {error}
              </div>
            )}

            <button
              className="accent-btn"
              onClick={processFile}
              disabled={!file}
              style={bt(C, {
                background: file ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.bg3,
                color: file ? "#fff" : C.textDim,
                padding: "10px 20px",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                width: "100%",
                boxShadow: file ? `0 2px 8px ${C.accent}30` : "none",
              })}
            >
              <Ic d={I.ai} size={14} color={file ? "#fff" : C.textDim} /> Extract Unit Rates with AI
            </button>
          </div>
        )}

        {/* Processing Step */}
        {step === "processing" && (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                border: `3px solid ${C.border}`,
                borderTopColor: C.accent,
                animation: "spin 0.8s linear infinite",
                margin: "0 auto",
              }}
            />
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 16 }}>Analyzing proposal...</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              AI is extracting line items, specifications, trade, and project location from {file?.name}
            </div>
          </div>
        )}

        {/* Review Step */}
        {step === "review" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            {/* Review toolbar */}
            <div
              style={{
                padding: "10px 20px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={toggleAll}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  padding: "4px 10px",
                  fontSize: 10,
                  fontWeight: 600,
                  color: C.textMuted,
                  cursor: "pointer",
                }}
              >
                {selectedIds.size === extractedItems.length ? "Deselect All" : "Select All"}
              </button>
              <span style={{ fontSize: 11, color: C.textMuted }}>
                {selectedIds.size} of {extractedItems.length} items selected
              </span>
              {subName && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: C.accent,
                    background: C.accentBg,
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  {subName}
                </span>
              )}
              {trade && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: C.purple,
                    background: `${C.purple}15`,
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  {TRADE_OPTIONS.find(t => t.key === trade)?.label || trade}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={() => {
                  setStep("upload");
                  setExtractedItems([]);
                  setRawItems([]);
                }}
                style={bt(C, {
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textMuted,
                  padding: "5px 12px",
                  fontSize: 10,
                })}
              >
                <Ic d={I.refresh} size={10} color={C.textMuted} /> Re-upload
              </button>
            </div>

            {/* Location Normalization Bar */}
            <div
              style={{
                padding: "8px 20px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: hasLocationData && normalize ? `${C.green}06` : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: C.textDim,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Project Location
                </span>
                <input
                  value={pricingZip}
                  onChange={e => handleZipChange(e.target.value)}
                  placeholder="Zip"
                  maxLength={5}
                  style={inp(C, {
                    fontSize: 11,
                    padding: "3px 6px",
                    width: 56,
                    textAlign: "center",
                    fontFamily: T.font.sans,
                  })}
                />
                {hasLocationData && (
                  <span style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>{pricingLoc.label}</span>
                )}
                {hasLocationData && (
                  <span style={{ fontSize: 9, color: C.textDim }}>
                    Mat {pricingLoc.mat}x · Lab {pricingLoc.lab}x · Equip {pricingLoc.equip}x
                  </span>
                )}
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input
                  type="checkbox"
                  checked={normalize && hasLocationData}
                  disabled={!hasLocationData}
                  onChange={e => handleNormalizeToggle(e.target.checked)}
                  style={{ accentColor: C.accent, cursor: hasLocationData ? "pointer" : "default" }}
                />
                <span style={{ fontSize: 10, fontWeight: 600, color: hasLocationData ? C.text : C.textDim }}>
                  Normalize to Natl Avg
                </span>
                {extractedItems[0]?._normalized && <Ic d={I.check} size={10} color={C.green} sw={2.5} />}
              </div>
            </div>

            {/* Table headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "28px 68px 1.2fr 1fr 100px 44px 58px 58px 58px 58px",
                gap: 4,
                padding: "8px 16px",
                borderBottom: `1px solid ${C.border}`,
                fontSize: 8,
                fontWeight: 600,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              <div></div>
              <div>Code</div>
              <div>Item</div>
              <div>Specification</div>
              <div>Trade</div>
              <div>Unit</div>
              <div style={{ textAlign: "right" }}>Matl</div>
              <div style={{ textAlign: "right" }}>Labor</div>
              <div style={{ textAlign: "right" }}>Equip</div>
              <div style={{ textAlign: "right" }}>
                Sub Rate
                {extractedItems[0]?._normalized && (
                  <div style={{ fontSize: 6, color: C.textDim, fontWeight: 400 }}>not adjusted</div>
                )}
              </div>
            </div>

            {/* Items */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
              {extractedItems.map((item, _idx) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 68px 1.2fr 1fr 100px 44px 58px 58px 58px 58px",
                      gap: 4,
                      padding: "5px 0",
                      borderBottom: `1px solid ${C.bg2}`,
                      alignItems: "center",
                      opacity: isSelected ? 1 : 0.4,
                    }}
                  >
                    <div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItem(item.id)}
                        style={{ cursor: "pointer", accentColor: C.accent }}
                      />
                    </div>
                    <input
                      value={item.specSection}
                      onChange={e => updateExtractedItem(item.id, "specSection", e.target.value)}
                      style={inp(C, {
                        fontFamily: T.font.sans,
                        fontSize: 9,
                        padding: "3px 3px",
                        textAlign: "center",
                        color: C.purple,
                      })}
                      placeholder="XX.YYY"
                    />
                    <input
                      value={item.name}
                      onChange={e => updateExtractedItem(item.id, "name", e.target.value)}
                      style={inp(C, { fontSize: 10, padding: "3px 5px" })}
                    />
                    <input
                      value={item.specText}
                      onChange={e => updateExtractedItem(item.id, "specText", e.target.value)}
                      style={inp(C, { fontSize: 9, padding: "3px 5px", color: C.textMuted })}
                      placeholder="Material/performance spec..."
                    />
                    <select
                      value={item.trade}
                      onChange={e => updateExtractedItem(item.id, "trade", e.target.value)}
                      style={inp(C, { fontSize: 9, padding: "3px 2px" })}
                    >
                      <option value="">—</option>
                      {TRADE_OPTIONS.map(t => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={item.unit}
                      onChange={e => updateExtractedItem(item.id, "unit", e.target.value)}
                      style={inp(C, { fontSize: 9, padding: "3px 1px", textAlign: "center" })}
                    >
                      {UNITS.map(u => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                      {!UNITS.includes(item.unit) && <option value={item.unit}>{item.unit}</option>}
                    </select>
                    {/* Material — with original value annotation */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <input
                        type="number"
                        value={item.material}
                        onChange={e => updateExtractedItem(item.id, "material", parseFloat(e.target.value) || 0)}
                        style={nInp(C, { fontSize: 10, padding: "3px 3px", color: C.green })}
                      />
                      {item._normalized && item._originalMaterial > 0 && item._originalMaterial !== item.material && (
                        <div style={{ fontSize: 7, color: C.textDim, textDecoration: "line-through", marginTop: 1 }}>
                          {item._originalMaterial.toFixed(2)}
                        </div>
                      )}
                    </div>
                    {/* Labor — with original value annotation */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <input
                        type="number"
                        value={item.labor}
                        onChange={e => updateExtractedItem(item.id, "labor", parseFloat(e.target.value) || 0)}
                        style={nInp(C, { fontSize: 10, padding: "3px 3px", color: C.blue })}
                      />
                      {item._normalized && item._originalLabor > 0 && item._originalLabor !== item.labor && (
                        <div style={{ fontSize: 7, color: C.textDim, textDecoration: "line-through", marginTop: 1 }}>
                          {item._originalLabor.toFixed(2)}
                        </div>
                      )}
                    </div>
                    {/* Equipment — with original value annotation */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <input
                        type="number"
                        value={item.equipment}
                        onChange={e => updateExtractedItem(item.id, "equipment", parseFloat(e.target.value) || 0)}
                        style={nInp(C, { fontSize: 10, padding: "3px 3px", color: C.orange })}
                      />
                      {item._normalized &&
                        item._originalEquipment > 0 &&
                        item._originalEquipment !== item.equipment && (
                          <div style={{ fontSize: 7, color: C.textDim, textDecoration: "line-through", marginTop: 1 }}>
                            {item._originalEquipment.toFixed(2)}
                          </div>
                        )}
                    </div>
                    {/* Subcontractor — never normalized */}
                    <input
                      type="number"
                      value={item.subcontractor}
                      onChange={e => updateExtractedItem(item.id, "subcontractor", parseFloat(e.target.value) || 0)}
                      style={nInp(C, { fontSize: 10, padding: "3px 3px", color: C.red })}
                    />
                  </div>
                );
              })}
            </div>

            {error && <div style={{ padding: "6px 20px", fontSize: 11, color: C.red }}>{error}</div>}

            {/* Footer */}
            <div
              style={{
                padding: "12px 20px",
                borderTop: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 10, color: C.textDim }}>
                {extractedItems[0]?._normalized
                  ? `Prices normalized to national average from ${pricingLoc.label}. Sub rates unchanged.`
                  : "Each item has its own spec, code, and trade. Edit inline before importing."}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={onClose}
                  style={bt(C, {
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    color: C.textMuted,
                    padding: "8px 16px",
                    fontSize: 11,
                  })}
                >
                  Cancel
                </button>
                <button
                  className="accent-btn"
                  onClick={importSelected}
                  disabled={selectedIds.size === 0}
                  style={bt(C, {
                    background: selectedIds.size > 0 ? C.accent : C.bg3,
                    color: selectedIds.size > 0 ? "#fff" : C.textDim,
                    padding: "8px 20px",
                    fontSize: 11,
                    fontWeight: 600,
                    border: "none",
                  })}
                >
                  <Ic d={I.check} size={12} color={selectedIds.size > 0 ? "#fff" : C.textDim} sw={2.5} />
                  Import {selectedIds.size} Item{selectedIds.size !== 1 ? "s" : ""} to Database
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
