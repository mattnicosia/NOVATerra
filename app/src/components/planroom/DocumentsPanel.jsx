import { useState, useMemo, useRef } from "react";
import { useDocumentsStore } from "@/stores/documentsStore";
import { useCorrectionStore } from "@/nova/learning/correctionStore";
import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { card, inp, bt } from "@/utils/styles";

/* ── helpers ────────────────────────────────────────────────── */
function fmtBytes(b) {
  if (!b || b === 0) return "";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
const DOC_TYPES = [
  { key: "drawing", label: "DWG", color: (C) => C.blue },
  { key: "specification", label: "SPEC", color: (C) => C.purple || C.accent },
  { key: "general", label: "DOC", color: (C) => C.textDim },
];
const TAG_COLORS = ["#4A90D9", "#50B83C", "#E07B39", "#DE3618", "#9C6ADE", "#47C1BF", "#F49342", "#6B7280"];
const METHODS = ["email", "planroom", "hand-delivery", "ftp"];

// ── Construction Change Management — Color-Coded Document Types ──────────
// Based on AIA/CSI standards for document control in construction
const CHANGE_TYPES = [
  { key: "bid-set",    label: "BID SET",   color: "#8B95A2", description: "Original issue" },
  { key: "addendum",   label: "ADDENDUM",  color: "#E8913A", description: "Pre-bid modification — reprice" },
  { key: "revision",   label: "REVISION",  color: "#4A90D9", description: "Drawing update" },
  { key: "bulletin",   label: "BULLETIN",  color: "#D94A4A", description: "Post-contract change — price this" },
  { key: "asi",        label: "ASI",       color: "#2EAA7B", description: "Architect clarification — no cost impact" },
  { key: "rfi-sketch", label: "RFI SK",    color: "#8B5CF6", description: "Supplemental sketch" },
];
const CHANGE_TYPE_MAP = Object.fromEntries(CHANGE_TYPES.map(ct => [ct.key, ct]));

// Smart detection from filename patterns
function detectChangeType(filename) {
  if (!filename) return null;
  const f = filename.toLowerCase();
  if (/\badd(endum|enda)\b/i.test(f) || /\badd[-_]?\d/i.test(f)) return "addendum";
  if (/\bbull(etin)?\b/i.test(f) || /\bblt[-_]?\d/i.test(f)) return "bulletin";
  if (/\basi[-_]?\d/i.test(f) || /\basi\b/i.test(f)) return "asi";
  if (/\bsk[-_]\d/i.test(f) || /\brfi[-_]?sk/i.test(f)) return "rfi-sketch";
  if (/\brev[-_]?[a-z0-9]/i.test(f)) return "revision";
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   DocumentsPanel — full document management for Discovery page
   ═══════════════════════════════════════════════════════════════ */
export default function DocumentsPanel({ onRemove, categoryFilter }) {
  const C = useTheme();
  const T = C.T;

  /* ── store ── */
  const documents = useDocumentsStore((s) => s.documents);
  const tagPalette = useDocumentsStore((s) => s.tagPalette);
  const transmittals = useDocumentsStore((s) => s.transmittals);

  /* ── local state ── */
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(null); // null = all
  const [statusFilter, setStatusFilter] = useState(null);
  const [folderFilter, setFolderFilter] = useState(null); // null = all
  const [tagFilter, setTagFilter] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  const [showTransmittals, setShowTransmittals] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [editingDoc, setEditingDoc] = useState(null); // { id, filename, docType, notes }
  const [showTransmittalForm, setShowTransmittalForm] = useState(false);
  const [txForm, setTxForm] = useState({ direction: "sent", party: "", method: "email", notes: "" });
  const [showVersionUpload, setShowVersionUpload] = useState(null); // docId
  const [hideSuperseded, setHideSuperseded] = useState(true);
  const [imagePreview, setImagePreview] = useState(null);
  const versionFileRef = useRef(null);

  /* ── derived ── */
  const folders = useDocumentsStore((s) => s.getFolders());

  const filtered = useMemo(() => {
    let list = documents;
    // Category filter from parent (DocumentsPage cards)
    if (categoryFilter) {
      const CAT_DOCTYPE_MAP = {
        drawings: ["drawing"],
        specifications: ["specification"],
        bidding: ["rfp", "bidding"],
        contracts: ["contract"],
        insurance: ["insurance"],
        permits: ["permit"],
        reports: ["report"],
        submittals: ["submittal"],
        photos: ["photo", "rendering"],
        schedule: ["schedule"],
        rules: ["rules"],
      };
      const CAT_CHANGE_MAP = {
        addenda: ["addendum", "bulletin", "asi"],
      };
      const docTypes = CAT_DOCTYPE_MAP[categoryFilter];
      const changeTypes = CAT_CHANGE_MAP[categoryFilter];
      if (docTypes) list = list.filter(d => docTypes.includes(d.docType));
      else if (changeTypes) list = list.filter(d => changeTypes.includes(d.changeType || detectChangeType(d.filename)));
    }
    if (hideSuperseded) list = list.filter((d) => !d.replacedById);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.filename.toLowerCase().includes(q));
    }
    if (typeFilter) list = list.filter((d) => d.docType === typeFilter);
    if (statusFilter) list = list.filter((d) => d.processingStatus === statusFilter);
    if (folderFilter === "__unfiled") list = list.filter((d) => !d.folder);
    else if (folderFilter) list = list.filter((d) => d.folder === folderFilter);
    if (tagFilter) list = list.filter((d) => (d.tags || []).includes(tagFilter));
    return list;
  }, [documents, search, typeFilter, statusFilter, folderFilter, tagFilter, hideSuperseded, categoryFilter]);

  if (documents.length === 0) return null;

  /* ── actions ── */
  const store = useDocumentsStore.getState;
  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };
  const handleDownload = (doc) => {
    if (doc.data) {
      const blob = new Blob([doc.data], { type: doc.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename;
      a.click();
      URL.revokeObjectURL(url);
    } else if (doc.storagePath) {
      window.open(doc.storagePath, "_blank");
    }
  };
  const handlePreview = (doc) => {
    if (doc.contentType?.startsWith("image/") && doc.data) {
      const blob = new Blob([doc.data], { type: doc.contentType });
      setImagePreview(URL.createObjectURL(blob));
    } else if (doc.data) {
      const blob = new Blob([doc.data], { type: doc.contentType });
      window.open(URL.createObjectURL(blob), "_blank");
    } else if (doc.storagePath) {
      window.open(doc.storagePath, "_blank");
    }
  };
  const saveEdit = () => {
    if (!editingDoc) return;
    store().updateDocument(editingDoc.id, {
      filename: editingDoc.filename,
      docType: editingDoc.docType,
    });
    setEditingDoc(null);
  };
  const handleAddTag = () => {
    if (!newTagName.trim()) return;
    store().addTag(newTagName.trim(), newTagColor);
    setNewTagName("");
    setShowNewTag(false);
  };
  const handleAddTransmittal = () => {
    store().addTransmittal({ ...txForm, docIds: [...selectedIds] });
    setTxForm({ direction: "sent", party: "", method: "email", notes: "" });
    setShowTransmittalForm(false);
    setSelectedIds(new Set());
  };
  const handleNewFolder = () => {
    if (!newFolder.trim()) return;
    // Moving first selected doc to create the folder, or just note it
    if (selectedIds.size > 0) {
      selectedIds.forEach((id) => store().moveToFolder(id, newFolder.trim()));
      setSelectedIds(new Set());
    }
    setNewFolder("");
  };
  const handleVersionUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !showVersionUpload) return;
    const reader = new FileReader();
    reader.onload = () => {
      store().uploadNewVersion(showVersionUpload, {
        filename: file.name,
        contentType: file.type,
        size: file.size,
        data: reader.result,
        source: "upload",
      });
      setShowVersionUpload(null);
    };
    reader.readAsArrayBuffer(file);
  };
  const bulkMoveToFolder = (folder) => {
    selectedIds.forEach((id) => store().moveToFolder(id, folder));
    setSelectedIds(new Set());
  };
  const bulkAddTag = (tagId) => {
    selectedIds.forEach((id) => {
      const doc = documents.find((d) => d.id === id);
      if (doc && !(doc.tags || []).includes(tagId)) store().toggleDocTag(id, tagId);
    });
  };
  const bulkDownload = () => {
    selectedIds.forEach((id) => {
      const doc = documents.find((d) => d.id === id);
      if (doc) handleDownload(doc);
    });
  };
  const bulkRemove = () => {
    selectedIds.forEach((id) => onRemove(id));
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  /* ── chip helper ── */
  const chip = (active, label, onClick, color) => (
    <button
      onClick={onClick}
      style={{
        ...bt(C, {
          padding: "2px 8px",
          fontSize: 9,
          fontWeight: active ? 700 : 500,
          background: active ? `${color || C.accent}18` : "transparent",
          color: active ? color || C.accent : C.textMuted,
          border: active ? `1px solid ${color || C.accent}30` : `1px solid ${C.border}10`,
        }),
      }}
    >
      {label}
    </button>
  );

  const getVersionChain = (docId) => store().getVersionHistory(docId);

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ marginBottom: T.space[4] }}>
      {/* ── Header ── */}
      <div style={{ ...card(C), padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: `${T.space[2]}px ${T.space[3]}px`,
            display: "flex",
            alignItems: "center",
            gap: 6,
            borderBottom: `1px solid ${C.border}08`,
          }}
        >
          <Ic d={I.folder} size={12} color={C.textMuted} />
          <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", flex: 1 }}>
            Documents ({documents.length})
          </span>
          {/* counts */}
          {documents.filter((d) => d.docType === "drawing").length > 0 && (
            <span style={{ fontSize: 9, color: C.blue, fontWeight: 500 }}>
              {documents.filter((d) => d.docType === "drawing").length} drawings
            </span>
          )}
          {documents.filter((d) => d.docType === "specification").length > 0 && (
            <span style={{ fontSize: 9, color: C.purple || C.accent, fontWeight: 500 }}>
              {documents.filter((d) => d.docType === "specification").length} specs
            </span>
          )}
          {/* toolbar buttons */}
          <button onClick={() => setShowFolders(!showFolders)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
            <Ic d={I.folder} size={11} color={showFolders ? C.accent : C.textDim} />
          </button>
          <button onClick={() => setShowTransmittals(!showTransmittals)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
            <Ic d={I.send} size={11} color={showTransmittals ? C.accent : C.textDim} />
          </button>
          <button
            onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
          >
            <Ic d={I.check} size={11} color={bulkMode ? C.accent : C.textDim} />
          </button>
        </div>

        {/* ── Change Type Legend ── */}
        <div style={{
          padding: `4px ${T.space[3]}px`, display: "flex", gap: 6, alignItems: "center",
          borderBottom: `1px solid ${C.border}06`, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 8, color: C.textDim, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Type:
          </span>
          {CHANGE_TYPES.map(ct => (
            <span key={ct.key} style={{
              fontSize: 7, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
              background: `${ct.color}12`, color: ct.color, letterSpacing: "0.02em",
              cursor: "default",
            }} title={ct.description}>
              {ct.label}
            </span>
          ))}
        </div>

        {/* ── Search + Filters ── */}
        <div style={{ padding: `${T.space[2]}px ${T.space[3]}px`, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            style={{ ...inp(C, { padding: "3px 8px", fontSize: 10, width: 140, borderRadius: 6 }) }}
          />
          {/* type chips */}
          {chip(typeFilter === null, "All", () => setTypeFilter(null))}
          {DOC_TYPES.map((dt) =>
            chip(typeFilter === dt.key, dt.label, () => setTypeFilter(typeFilter === dt.key ? null : dt.key), dt.color(C))
          )}
          {/* status chips */}
          {chip(statusFilter === "processing", "Processing", () => setStatusFilter(statusFilter === "processing" ? null : "processing"), C.yellow || "#F59E0B")}
          {chip(statusFilter === "error", "Error", () => setStatusFilter(statusFilter === "error" ? null : "error"), C.red || "#EF4444")}
          {/* tag chips */}
          {tagPalette.map((tag) =>
            chip(tagFilter === tag.id, tag.name, () => setTagFilter(tagFilter === tag.id ? null : tag.id), tag.color)
          )}
          <button onClick={() => setShowNewTag(!showNewTag)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>
            <span style={{ fontSize: 9, color: C.accent }}>+ Tag</span>
          </button>
          {/* superseded toggle */}
          <button
            onClick={() => setHideSuperseded(!hideSuperseded)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", marginLeft: "auto" }}
          >
            <span style={{ fontSize: 9, color: C.textDim }}>{hideSuperseded ? "Show superseded" : "Hide superseded"}</span>
          </button>
        </div>

        {/* ── New Tag Form ── */}
        {showNewTag && (
          <div style={{ padding: `0 ${T.space[3]}px ${T.space[2]}px`, display: "flex", gap: 4, alignItems: "center" }}>
            <input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name"
              style={{ ...inp(C, { padding: "2px 6px", fontSize: 10, width: 100, borderRadius: 4 }) }}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
            />
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewTagColor(c)}
                style={{
                  width: 14, height: 14, borderRadius: "50%", border: newTagColor === c ? `2px solid ${C.text}` : "2px solid transparent",
                  background: c, cursor: "pointer", padding: 0,
                }}
              />
            ))}
            <button onClick={handleAddTag} style={{ ...bt(C, { padding: "2px 8px", fontSize: 9, background: `${C.accent}15`, color: C.accent }) }}>
              Add
            </button>
          </div>
        )}

        {/* ── Folder sidebar (inline) ── */}
        {showFolders && (
          <div style={{ padding: `0 ${T.space[3]}px ${T.space[2]}px`, borderBottom: `1px solid ${C.border}06` }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              {chip(folderFilter === null, "All", () => setFolderFilter(null))}
              {chip(folderFilter === "__unfiled", "Unfiled", () => setFolderFilter(folderFilter === "__unfiled" ? null : "__unfiled"))}
              {folders.map((f) => chip(folderFilter === f, f, () => setFolderFilter(folderFilter === f ? null : f)))}
              <input
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                placeholder="New folder…"
                style={{ ...inp(C, { padding: "2px 6px", fontSize: 9, width: 90, borderRadius: 4 }) }}
                onKeyDown={(e) => e.key === "Enter" && handleNewFolder()}
              />
            </div>
          </div>
        )}

        {/* ── Bulk Action Bar ── */}
        {bulkMode && selectedIds.size > 0 && (
          <div style={{ padding: `${T.space[1]}px ${T.space[3]}px`, display: "flex", gap: 6, alignItems: "center", background: `${C.accent}08`, borderBottom: `1px solid ${C.border}08` }}>
            <span style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>{selectedIds.size} selected</span>
            {/* move to folder dropdown */}
            {folders.length > 0 && (
              <select
                onChange={(e) => { if (e.target.value) bulkMoveToFolder(e.target.value); e.target.value = ""; }}
                style={{ ...inp(C, { padding: "2px 6px", fontSize: 9, width: "auto", borderRadius: 4 }) }}
                defaultValue=""
              >
                <option value="" disabled>Move to…</option>
                {folders.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
            {/* add tag dropdown */}
            {tagPalette.length > 0 && (
              <select
                onChange={(e) => { if (e.target.value) bulkAddTag(e.target.value); e.target.value = ""; }}
                style={{ ...inp(C, { padding: "2px 6px", fontSize: 9, width: "auto", borderRadius: 4 }) }}
                defaultValue=""
              >
                <option value="" disabled>+ Tag</option>
                {tagPalette.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <button onClick={bulkDownload} style={{ ...bt(C, { padding: "2px 8px", fontSize: 9 }) }}>
              <Ic d={I.download} size={9} color={C.textMuted} /> Download
            </button>
            <button onClick={() => setShowTransmittalForm(true)} style={{ ...bt(C, { padding: "2px 8px", fontSize: 9 }) }}>
              <Ic d={I.send} size={9} color={C.textMuted} /> Log Transmittal
            </button>
            <button onClick={bulkRemove} style={{ ...bt(C, { padding: "2px 8px", fontSize: 9, color: C.red || "#EF4444" }) }}>
              <Ic d={I.trash} size={9} color={C.red || "#EF4444"} /> Remove
            </button>
          </div>
        )}

        {/* ── Document List ── */}
        {filtered.map((doc) => {
          const isExpanded = expandedId === doc.id;
          const dtMeta = DOC_TYPES.find((dt) => dt.key === doc.docType) || DOC_TYPES[2];
          const docTags = (doc.tags || []).map((tid) => tagPalette.find((t) => t.id === tid)).filter(Boolean);
          const hasVersions = doc.replacesId || doc.replacedById;
          const versionChain = isExpanded && hasVersions ? getVersionChain(doc.id) : [];

          return (
            <div key={doc.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[2],
                  padding: `4px ${T.space[3]}px`,
                  borderBottom: `1px solid ${C.border}06`,
                  fontSize: 11,
                  opacity: doc.replacedById ? 0.4 : 1,
                  cursor: "pointer",
                }}
                onClick={() => !bulkMode && setExpandedId(isExpanded ? null : doc.id)}
              >
                {/* checkbox for bulk */}
                {bulkMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(doc.id)}
                    onChange={() => toggleSelect(doc.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: C.accent }}
                  />
                )}
                {/* type badge */}
                <span style={{ fontSize: 8, fontWeight: 700, color: dtMeta.color(C), textTransform: "uppercase", minWidth: 30 }}>
                  {dtMeta.label}
                </span>
                {/* change type badge (addendum/revision/bulletin/ASI) */}
                {(() => {
                  const ct = CHANGE_TYPE_MAP[doc.changeType || detectChangeType(doc.filename)];
                  if (!ct || ct.key === "bid-set") return null;
                  return (
                    <span style={{
                      fontSize: 7, fontWeight: 700, letterSpacing: "0.04em",
                      padding: "1px 5px", borderRadius: 3,
                      background: `${ct.color}18`, color: ct.color,
                    }}>
                      {ct.label}
                    </span>
                  );
                })()}
                {/* folder indicator */}
                {doc.folder && (
                  <span style={{ fontSize: 8, color: C.textDim, opacity: 0.6 }}>{doc.folder}/</span>
                )}
                {/* filename */}
                <span style={{ flex: 1, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {doc.filename}
                </span>
                {/* tags */}
                {docTags.map((tag) => (
                  <span
                    key={tag.id}
                    style={{
                      fontSize: 8, padding: "1px 4px", borderRadius: 3,
                      background: `${tag.color}18`, color: tag.color, fontWeight: 600,
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
                {/* version badge */}
                {hasVersions && (
                  <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: `${C.blue}18`, color: C.blue, fontWeight: 600 }}>
                    v{doc.version || 1}
                  </span>
                )}
                {doc.replacedById && (
                  <span style={{ fontSize: 8, color: C.textDim, fontStyle: "italic" }}>(superseded)</span>
                )}
                {/* size */}
                <span style={{ fontSize: 9, color: C.textDim }}>{fmtBytes(doc.size)}</span>
                {/* status */}
                {doc.processingStatus === "processing" && (
                  <span style={{ display: "inline-block", width: 8, height: 8, border: `2px solid ${C.accent}40`, borderTop: `2px solid ${C.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                )}
                {doc.processingStatus === "complete" && <Ic d={I.check} size={10} color={C.green} />}
                {doc.processingStatus === "error" && <Ic d={I.warn} size={10} color={C.red || "#EF4444"} />}
                {/* actions */}
                <button onClick={(e) => { e.stopPropagation(); handlePreview(doc); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.4 }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}>
                  <Ic d={I.eye} size={10} color={C.textDim} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDownload(doc); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.4 }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}>
                  <Ic d={I.download} size={10} color={C.textDim} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onRemove(doc.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.4 }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}>
                  <Ic d={I.trash} size={10} color={C.textDim} />
                </button>
              </div>

              {/* ── Expanded Detail Panel ── */}
              {isExpanded && (
                <div style={{ padding: `${T.space[2]}px ${T.space[3]}px ${T.space[2]}px ${T.space[4] + 30}px`, background: `${C.bg1}40`, borderBottom: `1px solid ${C.border}06`, fontSize: 10 }}>
                  <div style={{ display: "flex", gap: T.space[3], flexWrap: "wrap" }}>
                    {/* metadata */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 140 }}>
                      <span style={{ color: C.textDim }}>Uploaded: {fmtDate(doc.uploadDate)}</span>
                      <span style={{ color: C.textDim }}>Size: {fmtBytes(doc.size)}</span>
                      <span style={{ color: C.textDim }}>Type: {doc.contentType}</span>
                      {doc.pageCount && <span style={{ color: C.textDim }}>Pages: {doc.pageCount}</span>}
                      <span style={{ color: C.textDim }}>Status: {doc.processingStatus}</span>
                      {doc.processingError && <span style={{ color: C.red || "#EF4444" }}>Error: {doc.processingError}</span>}
                    </div>
                    {/* edit fields */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 180 }}>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <span style={{ color: C.textDim, minWidth: 50 }}>Name:</span>
                        {editingDoc?.id === doc.id ? (
                          <input
                            value={editingDoc.filename}
                            onChange={(e) => setEditingDoc({ ...editingDoc, filename: e.target.value })}
                            style={{ ...inp(C, { padding: "2px 6px", fontSize: 10, width: 160, borderRadius: 4 }) }}
                            onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                          />
                        ) : (
                          <span style={{ color: C.text, cursor: "pointer" }} onClick={() => setEditingDoc({ id: doc.id, filename: doc.filename, docType: doc.docType })}>
                            {doc.filename} <Ic d={I.edit} size={8} color={C.textDim} />
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <span style={{ color: C.textDim, minWidth: 50 }}>Category:</span>
                        <select
                          value={doc.docType || "general"}
                          onChange={(e) => store().updateDocument(doc.id, { docType: e.target.value })}
                          style={{ ...inp(C, { padding: "2px 6px", fontSize: 10, width: "auto", borderRadius: 4 }) }}
                        >
                          <option value="drawing">Drawing</option>
                          <option value="specification">Specification</option>
                          <option value="general">General</option>
                        </select>
                      </div>
                      {/* Change type (addendum/revision/bulletin/ASI) */}
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <span style={{ color: C.textDim, minWidth: 50 }}>Change:</span>
                        <select
                          value={doc.changeType || detectChangeType(doc.filename) || "bid-set"}
                          onChange={(e) => store().updateDocument(doc.id, { changeType: e.target.value })}
                          style={{ ...inp(C, { padding: "2px 6px", fontSize: 10, width: "auto", borderRadius: 4 }) }}
                        >
                          {CHANGE_TYPES.map(ct => (
                            <option key={ct.key} value={ct.key}>{ct.label} — {ct.description}</option>
                          ))}
                        </select>
                      </div>
                      {editingDoc?.id === doc.id && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={saveEdit} style={{ ...bt(C, { padding: "2px 8px", fontSize: 9, background: `${C.accent}15`, color: C.accent }) }}>
                            Save
                          </button>
                          <button onClick={() => setEditingDoc(null)} style={{ ...bt(C, { padding: "2px 8px", fontSize: 9 }) }}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                    {/* folder + tags */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 140 }}>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <span style={{ color: C.textDim, minWidth: 50 }}>Folder:</span>
                        <select
                          value={doc.folder || ""}
                          onChange={(e) => store().moveToFolder(doc.id, e.target.value)}
                          style={{ ...inp(C, { padding: "2px 6px", fontSize: 10, width: "auto", borderRadius: 4 }) }}
                        >
                          <option value="">None</option>
                          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ color: C.textDim, minWidth: 50 }}>Tags:</span>
                        {tagPalette.map((tag) => {
                          const active = (doc.tags || []).includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              onClick={() => store().toggleDocTag(doc.id, tag.id)}
                              style={{
                                fontSize: 8, padding: "1px 5px", borderRadius: 3, cursor: "pointer", border: "none",
                                background: active ? `${tag.color}25` : `${C.border}10`,
                                color: active ? tag.color : C.textDim, fontWeight: active ? 600 : 400,
                              }}
                            >
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* ── Version History ── */}
                  <div style={{ marginTop: T.space[2], display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      onClick={() => { setShowVersionUpload(doc.id); versionFileRef.current?.click(); }}
                      style={{ ...bt(C, { padding: "2px 8px", fontSize: 9, background: `${C.blue}10`, color: C.blue }) }}
                    >
                      <Ic d={I.upload} size={9} color={C.blue} /> Upload New Version
                    </button>
                    <input ref={versionFileRef} type="file" style={{ display: "none" }} onChange={handleVersionUpload} />
                    {versionChain.length > 1 && (
                      <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 9, color: C.textDim }}>
                        <span>History:</span>
                        {versionChain.map((v, i) => (
                          <span key={v.id} style={{ color: v.id === doc.id ? C.accent : C.textDim, fontWeight: v.id === doc.id ? 600 : 400 }}>
                            v{v.version || i + 1}{i < versionChain.length - 1 ? " → " : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ── Empty state for filters ── */}
        {filtered.length === 0 && documents.length > 0 && (
          <div style={{ padding: T.space[4], textAlign: "center", fontSize: 11, color: C.textDim }}>
            No documents match filters
          </div>
        )}
      </div>

      {/* ── Transmittals Section ── */}
      {showTransmittals && (
        <div style={{ ...card(C), marginTop: T.space[2], padding: 0, overflow: "hidden" }}>
          <div style={{ padding: `${T.space[2]}px ${T.space[3]}px`, display: "flex", alignItems: "center", gap: 6, borderBottom: `1px solid ${C.border}08` }}>
            <Ic d={I.send} size={12} color={C.textMuted} />
            <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", flex: 1 }}>
              Transmittal Log ({transmittals.length})
            </span>
            <button onClick={() => setShowTransmittalForm(true)} style={{ ...bt(C, { padding: "2px 8px", fontSize: 9, background: `${C.accent}10`, color: C.accent }) }}>
              + Log Transmittal
            </button>
          </div>

          {/* form */}
          {showTransmittalForm && (
            <div style={{ padding: `${T.space[2]}px ${T.space[3]}px`, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", borderBottom: `1px solid ${C.border}06` }}>
              <select value={txForm.direction} onChange={(e) => setTxForm({ ...txForm, direction: e.target.value })} style={{ ...inp(C, { padding: "2px 6px", fontSize: 10, width: "auto", borderRadius: 4 }) }}>
                <option value="sent">Sent</option>
                <option value="received">Received</option>
              </select>
              <input value={txForm.party} onChange={(e) => setTxForm({ ...txForm, party: e.target.value })} placeholder="Company / Person" style={{ ...inp(C, { padding: "2px 6px", fontSize: 10, width: 140, borderRadius: 4 }) }} />
              <select value={txForm.method} onChange={(e) => setTxForm({ ...txForm, method: e.target.value })} style={{ ...inp(C, { padding: "2px 6px", fontSize: 10, width: "auto", borderRadius: 4 }) }}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} placeholder="Notes…" style={{ ...inp(C, { padding: "2px 6px", fontSize: 10, width: 160, borderRadius: 4 }) }} />
              {selectedIds.size > 0 && <span style={{ fontSize: 9, color: C.accent }}>{selectedIds.size} docs attached</span>}
              <button onClick={handleAddTransmittal} style={{ ...bt(C, { padding: "2px 8px", fontSize: 9, background: `${C.accent}15`, color: C.accent }) }}>
                Save
              </button>
              <button onClick={() => setShowTransmittalForm(false)} style={{ ...bt(C, { padding: "2px 8px", fontSize: 9 }) }}>
                Cancel
              </button>
            </div>
          )}

          {/* list */}
          {transmittals.length === 0 && !showTransmittalForm && (
            <div style={{ padding: T.space[3], textAlign: "center", fontSize: 10, color: C.textDim }}>No transmittals logged</div>
          )}
          {transmittals.map((tx) => (
            <div key={tx.id} style={{ display: "flex", gap: T.space[2], padding: `3px ${T.space[3]}px`, borderBottom: `1px solid ${C.border}06`, fontSize: 10, alignItems: "center" }}>
              <Ic d={tx.direction === "sent" ? I.upload : I.download} size={9} color={tx.direction === "sent" ? C.blue : C.green} />
              <span style={{ color: C.text, fontWeight: 500 }}>{tx.party || "—"}</span>
              <span style={{ color: C.textDim }}>{tx.method}</span>
              <span style={{ color: C.textDim }}>{tx.docIds?.length || 0} docs</span>
              {tx.notes && <span style={{ color: C.textDim, fontStyle: "italic", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.notes}</span>}
              <span style={{ color: C.textDim, marginLeft: "auto" }}>{fmtDate(tx.date)}</span>
              <button onClick={() => store().removeTransmittal(tx.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.4 }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}>
                <Ic d={I.trash} size={9} color={C.textDim} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── NOVA Learning Stats ── */}
      {(() => {
        const stats = useCorrectionStore.getState().getStats();
        if (stats.totalCorrections === 0) return null;
        return (
          <div style={{ marginTop: T.space[2], padding: `${T.space[2]}px ${T.space[3]}px`, ...card(C), display: "flex", alignItems: "center", gap: 6, fontSize: 9 }}>
            <Ic d={I.ai} size={10} color={C.accent} />
            <span style={{ color: C.accent, fontWeight: 600 }}>NOVA Learning</span>
            <span style={{ color: C.textDim }}>
              {stats.totalCorrections} correction{stats.totalCorrections !== 1 ? "s" : ""} across {stats.uniquePatterns} pattern{stats.uniquePatterns !== 1 ? "s" : ""}
            </span>
            {stats.topPatterns.length > 0 && (
              <span style={{ color: C.textDim, marginLeft: "auto", fontSize: 8 }}>
                Top: {stats.topPatterns.slice(0, 2).map((p) => `${p.type}:${p.field} (${p.frequency}x)`).join(", ")}
              </span>
            )}
          </div>
        );
      })()}

      {/* ── Image Preview Modal ── */}
      {imagePreview && (
        <div
          onClick={() => setImagePreview(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}
        >
          <img src={imagePreview} alt="preview" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: T.radius.md }} />
        </div>
      )}
    </div>
  );
}
