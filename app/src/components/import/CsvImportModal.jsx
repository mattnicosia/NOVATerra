import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSnapshotsStore } from "@/stores/snapshotsStore";
import { loadEstimate } from "@/hooks/usePersistence";
import { uid } from "@/utils/format";
import { autoDirective } from "@/utils/directives";
import { autoTradeFromCode } from "@/constants/tradeGroupings";
import { parseCSV } from "@/utils/csvParser";
import { parseXLSX } from "@/utils/xlsxParser";
import { isBluebeamXml, parseBluebeamXml } from "@/utils/bluebeamXmlParser";
import { OMNI_FIELDS, suggestColumnMappings, heuristicMapping, applyMappings } from "@/utils/csvColumnMapper";
import NovaOrb from "@/components/dashboard/NovaOrb";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";

/**
 * CSV Import Modal — 3-step workflow:
 *   1. Upload file
 *   2. Map columns (AI-assisted)
 *   3. Import items
 *
 * @param {{ onClose: () => void, mode: "new" | "append" }} props
 */
export default function CsvImportModal({ onClose, mode }) {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const fileRef = useRef(null);

  // Step state
  const [step, setStep] = useState("upload"); // "upload" | "mapping" | "importing"

  // Upload step state
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  // Mapping step state
  const [mappings, setMappings] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [divideTotals, setDivideTotals] = useState(false);
  const [importMode, setImportMode] = useState("append"); // "append" | "update"

  // Multi-sheet state
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [xlsxBuffer, setXlsxBuffer] = useState(null); // keep buffer for sheet switching

  // New estimate fields (mode="new")
  const [estName, setEstName] = useState("");
  const [estClient, setEstClient] = useState("");
  const [estNumber, setEstNumber] = useState("");
  const [estNumError, setEstNumError] = useState("");

  // Import progress
  const [importing, setImporting] = useState(false);

  // ─── File Handling ──────────────────────────────────────────────

  /**
   * Detect file encoding from BOM bytes and decode ArrayBuffer to string.
   * Handles UTF-16 LE/BE (common in Windows software like ProEst), UTF-8 with BOM, and plain UTF-8.
   */
  const decodeFile = useCallback(buffer => {
    const bytes = new Uint8Array(buffer);

    // Check for BOM (byte order mark)
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      // UTF-16 LE
      return new TextDecoder("utf-16le").decode(buffer);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      // UTF-16 BE
      return new TextDecoder("utf-16be").decode(buffer);
    }
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      // UTF-8 with BOM
      return new TextDecoder("utf-8").decode(buffer);
    }

    // Heuristic: if file has lots of null bytes, it's likely UTF-16 without BOM
    // (check first 100 bytes — UTF-16 LE has null byte after every ASCII char)
    const checkLen = Math.min(bytes.length, 100);
    let nullCount = 0;
    for (let i = 0; i < checkLen; i++) {
      if (bytes[i] === 0x00) nullCount++;
    }
    if (nullCount > checkLen * 0.2) {
      // Likely UTF-16 LE (most common on Windows)
      return new TextDecoder("utf-16le").decode(buffer);
    }

    // Default: UTF-8
    return new TextDecoder("utf-8").decode(buffer);
  }, []);

  /**
   * Detect if a file is an Excel binary format by checking for:
   * - File extension (.xlsx, .xls, .xlsm, .xlsb)
   * - ZIP magic bytes (PK\x03\x04) which all .xlsx files start with
   * - OLE2 magic bytes (\xD0\xCF\x11\xE0) for legacy .xls
   */
  const isExcelFile = useCallback((file, buffer) => {
    const ext = file.name.toLowerCase().split(".").pop();
    if (["xlsx", "xls", "xlsm", "xlsb"].includes(ext)) return true;

    // Check magic bytes
    const bytes = new Uint8Array(buffer, 0, 4);
    // ZIP (PK\x03\x04)
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return true;
    // OLE2 compound document (.xls)
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return true;

    return false;
  }, []);

  /** Parse a sheet and advance to mapping step */
  const applyParsed = useCallback(async (parsed, name) => {
    if (!parsed.headers.length) {
      useUiStore.getState().showToast("Could not parse file — no headers found", "error");
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    if (parsed.sheetNames?.length > 1) {
      setSheetNames(parsed.sheetNames);
      setActiveSheet(parsed.sheetNames.indexOf(name) >= 0 ? name : parsed.sheetNames[0]);
    }
    setStep("mapping");
    setAiLoading(true);
    try {
      const suggested = await suggestColumnMappings(null, parsed.headers, parsed.rows.slice(0, 5));
      setMappings(suggested);
    } catch {
      setMappings(heuristicMapping(parsed.headers));
    } finally {
      setAiLoading(false);
    }
  }, []);

  /** Switch to a different sheet in a multi-sheet workbook */
  const switchSheet = useCallback(
    async name => {
      if (!xlsxBuffer) return;
      setActiveSheet(name);
      const parsed = parseXLSX(xlsxBuffer, { sheetName: name });
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMappings({});
      setAiLoading(true);
      try {
        const suggested = await suggestColumnMappings(null, parsed.headers, parsed.rows.slice(0, 5));
        setMappings(suggested);
      } catch {
        setMappings(heuristicMapping(parsed.headers));
      } finally {
        setAiLoading(false);
      }
    },
    [xlsxBuffer],
  );

  const handleFile = useCallback(
    file => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async e => {
        const buffer = e.target.result;
        let parsed;

        if (isExcelFile(file, buffer)) {
          // Excel file → use XLSX parser (preserve buffer for sheet switching)
          setXlsxBuffer(buffer);
          parsed = parseXLSX(buffer);
        } else if (file.name.toLowerCase().endsWith(".xml") || isBluebeamXml(buffer)) {
          setXlsxBuffer(null);
          parsed = parseBluebeamXml(buffer);
        } else {
          setXlsxBuffer(null);
          const text = decodeFile(buffer);
          parsed = parseCSV(text);
        }

        setFileName(file.name);
        setEstName(file.name.replace(/\.[^.]+$/, ""));
        await applyParsed(parsed, parsed.sheetNames?.[0] || "");
      };
      reader.readAsArrayBuffer(file);
    },
    [decodeFile, isExcelFile, applyParsed],
  );

  const onFileChange = e => {
    handleFile(e.target.files?.[0]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onDrop = e => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  // ─── Mapping Helpers ────────────────────────────────────────────

  const updateMapping = (header, field) => {
    setMappings(prev => ({ ...prev, [header]: field || null }));
  };

  const mappedCount = Object.values(mappings).filter(Boolean).length;
  const { items: previewItems, skipped } = applyMappings(mappings, headers, rows, { divideTotals });

  // ─── Import Execution ───────────────────────────────────────────

  const executeImport = async () => {
    if (previewItems.length === 0) return;

    // Validate estimate number for new estimates
    if (mode === "new") {
      const trimmedNum = estNumber.trim();
      if (!trimmedNum) {
        setEstNumError("Estimate number is required");
        return;
      }
      const existing = useEstimatesStore.getState().estimatesIndex;
      const dup = existing.find(e => e.estimateNumber === trimmedNum);
      if (dup) {
        setEstNumError(`Estimate #${trimmedNum} already exists ("${dup.name}")`);
        return;
      }
    }

    setImporting(true);

    try {
      const newItems = previewItems.map(preset => ({
        id: preset.itemId || uid(),
        code: preset.code || "",
        description: preset.name || "",
        division: preset.division || "",
        quantity: preset.quantity || 1,
        unit: preset.unit || "EA",
        material: preset.material || 0,
        labor: preset.labor || 0,
        equipment: preset.equipment || 0,
        subcontractor: preset.subcontractor || 0,
        trade: preset.trade || autoTradeFromCode(preset.code) || "",
        directive: autoDirective(
          preset.material || 0,
          preset.labor || 0,
          preset.equipment || 0,
          preset.subcontractor || 0,
        ),
        notes: preset.notes || "",
        drawingRef: "",
        variables: [],
        formula: "",
        specSection: "",
        specText: "",
        specVariantLabel: "",
        allowanceOf: "",
        allowanceSubMarkup: "",
        locationLocked: false,
        subItems: [],
        bidContext: mode === "new" ? "base" : useUiStore.getState().activeGroupId || "base",
      }));

      if (mode === "new") {
        const companyId = useUiStore.getState().appSettings.activeCompanyId;
        const effectiveId = companyId === "__all__" ? "" : companyId;
        const id = await useEstimatesStore.getState().createEstimate(effectiveId, estNumber.trim());
        await loadEstimate(id);

        useProjectStore.getState().updateProject("name", estName);
        useProjectStore.getState().updateProject("estimateNumber", estNumber.trim());
        if (estClient) useProjectStore.getState().updateProject("client", estClient);

        useItemsStore.getState().setItems(newItems);

        useEstimatesStore.getState().updateIndexEntry(id, {
          name: estName,
          client: estClient,
          elementCount: newItems.length,
        });

        onClose();
        navigate(`/estimate/${id}/takeoffs`);
      } else {
        // Snapshot current state before modifying
        const activeId = useUiStore.getState().activeEstimateId;
        if (activeId) {
          const curItems = useItemsStore.getState().items;
          const curTotals = useItemsStore.getState().getTotals();
          const curProject = useProjectStore.getState().project;
          useSnapshotsStore
            .getState()
            .captureSnapshot(activeId, curItems, curTotals, {}, null, null, curProject, {
              label: `Pre-import (${fileName})`,
              trigger: "auto",
            });
        }

        const current = useItemsStore.getState().items;

        if (importMode === "update") {
          // Update/merge mode — match by ID, update existing items, add new ones
          const existingMap = new Map(current.map(it => [it.id, it]));
          let updated = 0;
          let added = 0;
          const merged = [...current];

          for (const item of newItems) {
            const existing = existingMap.get(item.id);
            if (existing) {
              // Update in place
              const idx = merged.findIndex(it => it.id === item.id);
              if (idx >= 0) {
                merged[idx] = { ...existing, ...item };
                updated++;
              }
            } else {
              merged.push(item);
              added++;
            }
          }
          useItemsStore.getState().setItems(merged);
          useUiStore
            .getState()
            .showToast(`Updated ${updated}, added ${added} item${added !== 1 ? "s" : ""} from import`, "success");
        } else {
          // Append mode
          useItemsStore.getState().setItems([...current, ...newItems]);
        }
        onClose();
      }

      useUiStore
        .getState()
        .showToast(`Imported ${newItems.length} item${newItems.length !== 1 ? "s" : ""} from CSV`, "success");
    } catch (err) {
      console.error("[CsvImport] Import failed:", err);
      useUiStore.getState().showToast("Import failed: " + (err.message || "Unknown error"), "error");
    } finally {
      setImporting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <Modal onClose={onClose} extraWide>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[5] }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: T.radius.md,
            background: C.accentBg,
            border: `1px solid ${C.borderAccent || C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Ic d={I.upload} size={20} color={C.accent} />
        </div>
        <div>
          <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>Import Estimate</div>
          <div style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>
            {mode === "new"
              ? "Create a new estimate from Excel, CSV, or Bluebeam XML"
              : "Add items from Excel, CSV, or Bluebeam XML"}
          </div>
        </div>
      </div>

      {/* ─── Step 1: Upload ─── */}
      {step === "upload" && (
        <div>
          <div
            onDragOver={e => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? C.accent : C.border}`,
              borderRadius: T.radius.md,
              padding: `${T.space[10]}px ${T.space[7]}px`,
              textAlign: "center",
              background: isDragging ? `${C.accent}08` : C.bg,
              transition: T.transition.fast,
              cursor: "pointer",
            }}
          >
            <Ic d={I.upload} size={32} color={C.textDim} />
            <div style={{ fontSize: T.fontSize.base, color: C.textMuted, marginTop: T.space[3] }}>
              Drop a file here, or <span style={{ color: C.accent, fontWeight: T.fontWeight.semibold }}>browse</span>
            </div>
            <div style={{ fontSize: T.fontSize.xs, color: C.textDim, marginTop: T.space[1] }}>
              Supports .xlsx, .xls, .csv, and Bluebeam .xml exports from ProEst, Sage, STACK, Excel, or any estimating
              software
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.xml"
            onChange={onFileChange}
            style={{ display: "none" }}
          />
        </div>
      )}

      {/* ─── Step 2: Mapping ─── */}
      {step === "mapping" && (
        <div>
          {/* File info bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: `${T.space[2]}px ${T.space[3]}px`,
              background: C.bg,
              borderRadius: T.radius.sm,
              marginBottom: T.space[4],
              border: `1px solid ${C.border}`,
            }}
          >
            <span style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>
              <strong style={{ color: C.text }}>{fileName}</strong> — {rows.length} rows, {headers.length} columns
            </span>
            <button
              onClick={() => {
                setStep("upload");
                setHeaders([]);
                setRows([]);
                setMappings({});
              }}
              style={{ ...bt(C, { background: "transparent", color: C.textMuted, padding: "4px 10px", fontSize: 11 }) }}
            >
              Change file
            </button>
          </div>

          {/* Sheet tabs for multi-sheet Excel files */}
          {sheetNames.length > 1 && (
            <div
              style={{
                display: "flex",
                gap: 2,
                marginBottom: T.space[3],
                overflowX: "auto",
              }}
            >
              {sheetNames.map(name => (
                <button
                  key={name}
                  onClick={() => switchSheet(name)}
                  style={bt(C, {
                    padding: "4px 12px",
                    fontSize: 10,
                    fontWeight: 600,
                    background: name === activeSheet ? `${C.accent}15` : "transparent",
                    color: name === activeSheet ? C.accent : C.textDim,
                    border: `1px solid ${name === activeSheet ? C.accent + "40" : C.border}`,
                    borderRadius: T.radius.full,
                  })}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* AI mapping badge */}
          {aiLoading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: T.space[2],
                padding: `${T.space[2]}px ${T.space[3]}px`,
                background: C.accentBg,
                borderRadius: T.radius.sm,
                marginBottom: T.space[3],
                border: `1px solid ${C.borderAccent || C.border}`,
                fontSize: T.fontSize.sm,
                color: C.accent,
              }}
            >
              <NovaOrb size={18} scheme="nova" /> ARTIFACT is mapping your columns...
            </div>
          )}

          {/* Mapping table */}
          <div style={{ maxHeight: 340, overflowY: "auto", marginBottom: T.space[4] }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle(C, T)}>CSV Column</th>
                  <th style={{ ...thStyle(C, T), width: 160 }}>Sample Data</th>
                  <th style={{ ...thStyle(C, T), width: 180 }}>Map To</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => {
                  const samples = rows
                    .slice(0, 3)
                    .map(r => (r[i] || "").trim())
                    .filter(Boolean);
                  const mapped = mappings[h];
                  return (
                    <tr key={h + i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={tdStyle(C, T)}>
                        <span style={{ fontWeight: T.fontWeight.medium, color: mapped ? C.text : C.textDim }}>{h}</span>
                      </td>
                      <td
                        style={{
                          ...tdStyle(C, T),
                          fontSize: T.fontSize.xs,
                          color: C.textDim,
                          fontFamily: T.font.sans,
                        }}
                      >
                        {samples.slice(0, 2).join(", ").slice(0, 40)}
                      </td>
                      <td style={tdStyle(C, T)}>
                        <select
                          value={mapped || ""}
                          onChange={e => updateMapping(h, e.target.value)}
                          style={{
                            ...inp(C),
                            padding: "4px 8px",
                            fontSize: T.fontSize.sm,
                            width: "100%",
                            color: mapped ? C.accent : C.textDim,
                          }}
                        >
                          <option value="">— Skip —</option>
                          {OMNI_FIELDS.map(f => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Divide totals toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: T.space[2],
              marginBottom: T.space[4],
            }}
          >
            <input
              type="checkbox"
              checked={divideTotals}
              onChange={e => setDivideTotals(e.target.checked)}
              style={{ accentColor: C.accent }}
            />
            <span style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>
              Cost columns are totals (divide by quantity to get unit rates)
            </span>
          </div>

          {/* Import mode toggle (append vs update) — only for existing estimates */}
          {mode !== "new" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: T.space[3],
                marginBottom: T.space[4],
              }}
            >
              <span style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>Mode:</span>
              {["append", "update"].map(m => (
                <button
                  key={m}
                  onClick={() => setImportMode(m)}
                  style={bt(C, {
                    padding: "4px 12px",
                    fontSize: 10,
                    fontWeight: 600,
                    background: importMode === m ? `${C.accent}15` : "transparent",
                    color: importMode === m ? C.accent : C.textDim,
                    border: `1px solid ${importMode === m ? C.accent + "40" : C.border}`,
                    borderRadius: T.radius.full,
                  })}
                >
                  {m === "append" ? "Add New Items" : "Update Existing (by ID)"}
                </button>
              ))}
            </div>
          )}

          {/* New estimate fields */}
          {mode === "new" && (
            <div style={{ marginBottom: T.space[4] }}>
              <div style={{ display: "flex", gap: T.space[3], marginBottom: estNumError ? 4 : 0 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle(C, T)}>Estimate Number *</label>
                  <input
                    value={estNumber}
                    onChange={e => {
                      setEstNumber(e.target.value);
                      setEstNumError("");
                    }}
                    style={{ ...inp(C), width: "100%", borderColor: estNumError ? C.red || "#f44" : undefined }}
                    placeholder="e.g. EST-2026-001"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle(C, T)}>Estimate Name</label>
                  <input
                    value={estName}
                    onChange={e => setEstName(e.target.value)}
                    style={{ ...inp(C), width: "100%" }}
                    placeholder="e.g. ProEst Import"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle(C, T)}>Client</label>
                  <input
                    value={estClient}
                    onChange={e => setEstClient(e.target.value)}
                    style={{ ...inp(C), width: "100%" }}
                    placeholder="Optional"
                  />
                </div>
              </div>
              {estNumError && <div style={{ fontSize: 11, color: C.red || "#f44", marginTop: 4 }}>{estNumError}</div>}
            </div>
          )}

          {/* Preview stats + import button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: `${T.space[3]}px 0`,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            <div style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>
              <strong style={{ color: C.text }}>{previewItems.length}</strong> items ready
              {skipped > 0 && <span> · {skipped} rows skipped</span>}
              {mappedCount > 0 && <span> · {mappedCount} columns mapped</span>}
            </div>
            <div style={{ display: "flex", gap: T.space[2] }}>
              <button
                onClick={onClose}
                style={bt(C, { background: "transparent", color: C.textMuted, padding: "7px 14px" })}
              >
                Cancel
              </button>
              <button
                onClick={executeImport}
                disabled={previewItems.length === 0 || importing}
                style={bt(C, {
                  background: previewItems.length > 0 ? C.gradient || C.accent : C.bg3,
                  color: previewItems.length > 0 ? "#fff" : C.textDim,
                  padding: "7px 18px",
                  opacity: importing ? 0.6 : 1,
                })}
              >
                {importing
                  ? "Importing..."
                  : `Import ${previewItems.length} Item${previewItems.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Style Helpers ──────────────────────────────────────────────────

const thStyle = (C, T) => ({
  textAlign: "left",
  padding: `${T.space[2]}px ${T.space[2]}px`,
  fontSize: T.fontSize.xs,
  fontWeight: T.fontWeight.semibold,
  color: C.textDim,
  textTransform: "uppercase",
  letterSpacing: T.tracking.wide,
  borderBottom: `1px solid ${C.border}`,
  position: "sticky",
  top: 0,
  background: C.bg1,
  zIndex: 1,
});

const tdStyle = (C, T) => ({
  padding: `${T.space[2]}px ${T.space[2]}px`,
  fontSize: T.fontSize.sm,
  verticalAlign: "middle",
});

const labelStyle = (C, T) => ({
  display: "block",
  fontSize: T.fontSize.xs,
  fontWeight: T.fontWeight.semibold,
  color: C.textDim,
  marginBottom: T.space[1],
  textTransform: "uppercase",
  letterSpacing: T.tracking.wide,
});
