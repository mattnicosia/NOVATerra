// ============================================================
// NOVA Core — Admin Upload Proposal Page
// /admin/upload — Drag-and-drop PDF upload, parse, results
// Two states: UPLOAD → RESULTS
// ============================================================

import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { card } from "@/utils/styles";

const TRADES = [
  "Concrete", "Demolition", "Drywall", "Framing", "Rough Carpentry",
  "Insulation", "Sitework", "Roofing", "Waterproofing", "Electrical",
  "Plumbing", "HVAC", "Masonry", "Steel", "Metals", "Doors & Windows",
  "Fire Protection", "Finish Carpentry", "Flooring", "Tile",
  "Painting", "Ceilings", "Specialties", "Equipment",
];

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatCurrency(val) {
  if (val == null) return "—";
  return "$" + Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function AdminUploadPage() {
  const [view, setView] = useState("upload"); // "upload" | "results"
  const [result, setResult] = useState(null);
  const [userSubName, setUserSubName] = useState("");

  const handleParseComplete = useCallback((data, subName) => {
    setResult(data);
    setUserSubName(subName);
    setView("results");
  }, []);

  const handleReset = useCallback(() => {
    setView("upload");
    setResult(null);
    setUserSubName("");
  }, []);

  if (view === "results" && result) {
    return <ResultsView result={result} userSubName={userSubName} onReset={handleReset} />;
  }
  return <UploadView onComplete={handleParseComplete} />;
}

// ══════════════════════════════════════════════════════════════
// UPLOAD VIEW
// ══════════════════════════════════════════════════════════════
function UploadView({ onComplete }) {
  const C = useTheme();
  const T = C.T;
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [subName, setSubName] = useState("");
  const [projectRef, setProjectRef] = useState("");
  const [trade, setTrade] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileSelect = useCallback((f) => {
    if (!f) return;
    if (f.type !== "application/pdf") {
      setError("Only PDF files are accepted");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError("File must be under 20 MB");
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    handleFileSelect(f);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (subName.trim()) formData.append("sub_company_name", subName.trim());
      if (projectRef.trim()) formData.append("project_reference", projectRef.trim());
      if (trade) formData.append("trade", trade);

      const res = await fetch("/api/nova-core/upload-bid", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      if (data.duplicate) {
        setError(data.message || "This proposal was already uploaded recently");
        return;
      }

      onComplete(data, subName.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }, [file, subName, projectRef, trade, uploading, onComplete]);

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: T.radius.sm,
    border: `1px solid ${C.border}`,
    background: C.inputBg || "#0D0D0C",
    color: C.text,
    fontSize: 13,
    fontFamily: T.font.sans,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 6,
    display: "block",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 640 }}>
      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Upload Proposal</h1>

      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          ...card(C),
          minHeight: 200,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          cursor: "pointer",
          border: `2px dashed ${dragOver ? "#F59E0B" : C.border}`,
          transition: "border-color 0.2s",
          padding: 32,
        }}
      >
        {/* Upload icon */}
        <svg
          width={36}
          height={36}
          viewBox="0 0 24 24"
          fill="none"
          stroke={dragOver ? "#F59E0B" : C.textMuted}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: "stroke 0.2s" }}
        >
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <path d="M17 8l-5-5-5 5" />
          <path d="M12 3v12" />
        </svg>
        <div style={{ fontSize: 14, color: dragOver ? "#F59E0B" : C.textMuted, textAlign: "center", transition: "color 0.2s" }}>
          Drop proposal PDF here or click to browse
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />
      </div>

      {/* File info */}
      {file && (
        <div style={{ ...card(C), padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9l-7-7z" />
            <path d="M13 2v7h7" />
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{file.name}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{formatFileSize(file.size)}</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setFile(null); setError(null); }}
            style={{
              background: "none",
              border: "none",
              color: C.textMuted,
              cursor: "pointer",
              fontSize: 16,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Optional fields — fade in after file selected */}
      {file && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            animation: "fadeIn 0.3s ease-out",
          }}
        >
          <div>
            <label style={labelStyle}>Sub Company Name</label>
            <input
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="e.g. ABC Concrete Inc."
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Project Reference</label>
            <input
              value={projectRef}
              onChange={(e) => setProjectRef(e.target.value)}
              placeholder="e.g. Project #2024-150"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Trade / Division</label>
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              style={inputStyle}
            >
              <option value="">— Select trade —</option>
              {TRADES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          padding: "10px 14px",
          borderRadius: T.radius.sm,
          background: "#3B1111",
          border: "1px solid #7F1D1D",
          color: "#F87171",
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!file || uploading}
        style={{
          padding: "12px 28px",
          borderRadius: T.radius.sm,
          border: "none",
          background: !file || uploading ? C.border : C.accent,
          color: !file || uploading ? C.textMuted : "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: !file || uploading ? "not-allowed" : "pointer",
          fontFamily: T.font.sans,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          transition: "all 0.15s",
        }}
      >
        {uploading && (
          <svg width={16} height={16} viewBox="0 0 16 16" style={{ animation: "spin 1s linear infinite" }}>
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
        )}
        {uploading ? "Parsing proposal…" : "Upload & Parse"}
      </button>

      {/* Keyframe animations */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// RESULTS VIEW
// ══════════════════════════════════════════════════════════════
function ResultsView({ result, userSubName, onReset }) {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();

  const subName = result.subCompanyName || userSubName || "Unknown Sub";
  const autoWritten = result.autoWritten || 0;
  const queued = result.queued || 0;
  const totalAmount = result.totalBidAmount;

  const statCard = (label, value, color) => ({
    ...card(C),
    flex: 1,
    padding: 20,
    borderLeft: `3px solid ${color}`,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 640 }}>
      {/* Heading */}
      <div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, fontWeight: 500 }}>Parse complete</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{subName}</h1>
      </div>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: 16 }}>
        <div style={statCard("Auto-written", autoWritten, "#22C55E")}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#22C55E", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Auto-written
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{autoWritten}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>lines auto-accepted</div>
        </div>

        <div style={statCard("Needs review", queued, "#F59E0B")}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Needs review
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{queued}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>lines need review</div>
        </div>

        <div style={statCard("Total amount", totalAmount, C.textMuted)}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Total amount
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{formatCurrency(totalAmount)}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>bid total</div>
        </div>
      </div>

      {/* Review banner */}
      {queued > 0 && (
        <div style={{
          padding: "14px 18px",
          borderRadius: T.radius.sm,
          background: "#3D2E00",
          border: "1px solid #78550A",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}>
          <span style={{ fontSize: 13, color: "#F59E0B", fontWeight: 500 }}>
            {queued} line{queued !== 1 ? "s are" : " is"} queued for your review
          </span>
          <button
            onClick={() => navigate("/admin/bid-leveling")}
            style={{
              padding: "7px 16px",
              borderRadius: T.radius.sm,
              border: "none",
              background: "#F59E0B",
              color: "#1A1A18",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: T.font.sans,
              whiteSpace: "nowrap",
            }}
          >
            Review Lines →
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={onReset}
          style={{
            padding: "10px 22px",
            borderRadius: T.radius.sm,
            border: "none",
            background: C.accent,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: T.font.sans,
          }}
        >
          Parse Another Proposal
        </button>
        <button
          onClick={() => navigate("/admin/bid-leveling")}
          style={{
            padding: "10px 22px",
            borderRadius: T.radius.sm,
            border: `1px solid ${C.border}`,
            background: "transparent",
            color: C.textMuted,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: T.font.sans,
          }}
        >
          View in Bid Leveling
        </button>
      </div>
    </div>
  );
}
