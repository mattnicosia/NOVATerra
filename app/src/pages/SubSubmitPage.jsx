// ============================================================
// NOVA Core — Sub Portal Submit Page
// /portal?gc=<orgId> — Public, no auth required
//
// Light theme, minimal, professional form for subs to submit
// their proposals to a GC. Self-contained — no useTheme().
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";

const FONT = "'Switzer', -apple-system, BlinkMacSystemFont, sans-serif";

const L = {
  bg: "#FAFAFA",
  card: "#FFFFFF",
  text: "#1A1A1A",
  textMuted: "#6B7280",
  textDim: "#9CA3AF",
  border: "#E5E7EB",
  accent: "#2563EB",
  accentHover: "#1D4ED8",
  green: "#16A34A",
  red: "#DC2626",
  inputBg: "#FFFFFF",
  inputBorder: "#D1D5DB",
  inputFocus: "#2563EB",
  dropZoneBg: "#F9FAFB",
  dropZoneActive: "#EFF6FF",
};

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function SubSubmitPage() {
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState(null);
  const [orgName, setOrgName] = useState("");
  const [orgId, setOrgId] = useState("");

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [projectName, setProjectName] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  // ── On mount: verify org ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gc = params.get("gc");
    if (!gc) {
      setOrgError("Invalid submission link. Please contact the contractor who sent you this link.");
      setOrgLoading(false);
      return;
    }
    setOrgId(gc);

    fetch(`/api/nova-core/portal-lookup?gc=${encodeURIComponent(gc)}`)
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) {
          setOrgError("Invalid submission link. Please contact the contractor who sent you this link.");
        } else {
          setOrgName(data.orgName);
        }
        setOrgLoading(false);
      })
      .catch(() => {
        setOrgError("Unable to verify this link. Please try again later.");
        setOrgLoading(false);
      });
  }, []);

  // ── File handling ──
  const handleFileSelect = useCallback((f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setSubmitError("Only PDF files are accepted");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setSubmitError("File must be under 20 MB");
      return;
    }
    setFile(f);
    setSubmitError(null);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer?.files?.[0]);
  }, [handleFileSelect]);

  // ── Submit ──
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (submitting) return;

    // Validate
    if (!companyName.trim()) { setSubmitError("Company name is required"); return; }
    if (!contactEmail.trim()) { setSubmitError("Contact email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      setSubmitError("Please enter a valid email address");
      return;
    }
    if (!file) { setSubmitError("Please attach your proposal PDF"); return; }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("company_name", companyName.trim());
      formData.append("contact_email", contactEmail.trim());
      if (contactPhone.trim()) formData.append("contact_phone", contactPhone.trim());
      if (projectName.trim()) formData.append("project_name", projectName.trim());
      if (notes.trim()) formData.append("notes", notes.trim());
      formData.append("gc_id", orgId);

      const res = await fetch("/api/nova-core/portal-submit", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Submission failed (${res.status})`);
      }

      if (data.duplicate) {
        setSubmitError("This proposal was already submitted recently.");
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [companyName, contactEmail, contactPhone, projectName, notes, file, orgId, submitting]);

  // ── Styles ──
  const containerStyle = {
    minHeight: "100vh",
    background: L.bg,
    fontFamily: FONT,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "48px 16px",
  };

  const cardStyle = {
    width: "100%",
    maxWidth: 600,
    background: L.card,
    borderRadius: 12,
    border: `1px solid ${L.border}`,
    padding: "40px 36px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  };

  const labelStyle = {
    fontSize: 13,
    fontWeight: 600,
    color: L.text,
    marginBottom: 6,
    display: "block",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${L.inputBorder}`,
    background: L.inputBg,
    color: L.text,
    fontSize: 14,
    fontFamily: FONT,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };

  // ── Loading state ──
  if (orgLoading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: "40px 0", color: L.textMuted, fontSize: 14 }}>
            Verifying link...
          </div>
        </div>
      </div>
    );
  }

  // ── Error state (invalid link) ──
  if (orgError) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={L.red} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div style={{ fontSize: 15, color: L.text, lineHeight: 1.6 }}>{orgError}</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Success state ──
  if (submitted) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke={L.green} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 20 }}>
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div style={{ fontSize: 20, fontWeight: 600, color: L.text, marginBottom: 8 }}>
              Your proposal has been received.
            </div>
            <div style={{ fontSize: 14, color: L.textMuted }}>
              A confirmation will be sent to {contactEmail}.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: L.textDim, textTransform: "uppercase" }}>
            NOVA
          </span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: L.text, margin: "0 0 4px" }}>
          Submit Your Proposal
        </h1>
        <div style={{ fontSize: 14, color: L.textMuted, marginBottom: 24 }}>
          Submitting to <strong style={{ color: L.text }}>{orgName}</strong>
        </div>
        <div style={{ height: 1, background: L.border, marginBottom: 28 }} />

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Company Name */}
          <div>
            <label style={labelStyle}>Company Name <span style={{ color: L.red }}>*</span></label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Your company name"
              required
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = L.inputFocus; }}
              onBlur={e => { e.target.style.borderColor = L.inputBorder; }}
            />
          </div>

          {/* Contact Email */}
          <div>
            <label style={labelStyle}>Contact Email <span style={{ color: L.red }}>*</span></label>
            <input
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="you@company.com"
              required
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = L.inputFocus; }}
              onBlur={e => { e.target.style.borderColor = L.inputBorder; }}
            />
          </div>

          {/* Contact Phone */}
          <div>
            <label style={labelStyle}>Contact Phone</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              placeholder="(555) 123-4567"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = L.inputFocus; }}
              onBlur={e => { e.target.style.borderColor = L.inputBorder; }}
            />
          </div>

          {/* Project Name */}
          <div>
            <label style={labelStyle}>Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="Project this proposal is for"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = L.inputFocus; }}
              onBlur={e => { e.target.style.borderColor = L.inputBorder; }}
            />
          </div>

          {/* Proposal PDF */}
          <div>
            <label style={labelStyle}>Proposal PDF <span style={{ color: L.red }}>*</span></label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              style={{
                minHeight: 120,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
                border: `2px dashed ${dragOver ? L.accent : L.inputBorder}`,
                borderRadius: 8,
                background: dragOver ? L.dropZoneActive : L.dropZoneBg,
                transition: "border-color 0.2s, background 0.2s",
                padding: 24,
              }}
            >
              {file ? (
                <>
                  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={L.green} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9l-7-7z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                  <div style={{ fontSize: 14, color: L.text, fontWeight: 500 }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: L.textMuted }}>{formatFileSize(file.size)}</div>
                  <div
                    onClick={e => { e.stopPropagation(); setFile(null); }}
                    style={{ fontSize: 12, color: L.accent, cursor: "pointer", marginTop: 4 }}
                  >
                    Remove
                  </div>
                </>
              ) : (
                <>
                  <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={dragOver ? L.accent : L.textDim} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.2s" }}>
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <path d="M17 8l-5-5-5 5" />
                    <path d="M12 3v12" />
                  </svg>
                  <div style={{ fontSize: 13, color: L.textMuted, textAlign: "center" }}>
                    Drop PDF here or click to browse
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={e => handleFileSelect(e.target.files?.[0])}
              />
            </div>
          </div>

          {/* Notes / Exclusions */}
          <div>
            <label style={labelStyle}>Notes / Exclusions</label>
            <textarea
              value={notes}
              onChange={e => { if (e.target.value.length <= 500) setNotes(e.target.value); }}
              placeholder="Any exclusions, clarifications, or notes..."
              rows={4}
              style={{
                ...inputStyle,
                resize: "vertical",
                minHeight: 80,
              }}
              onFocus={e => { e.target.style.borderColor = L.inputFocus; }}
              onBlur={e => { e.target.style.borderColor = L.inputBorder; }}
            />
            <div style={{ fontSize: 11, color: L.textDim, textAlign: "right", marginTop: 4 }}>
              {notes.length}/500
            </div>
          </div>

          {/* Error message */}
          {submitError && (
            <div style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: L.red,
              fontSize: 13,
            }}>
              {submitError}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "12px 24px",
              borderRadius: 8,
              border: "none",
              background: submitting ? L.textDim : L.accent,
              color: "#FFFFFF",
              fontSize: 15,
              fontWeight: 600,
              fontFamily: FONT,
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "background 0.15s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {submitting && (
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ animation: "spin 1s linear infinite" }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            {submitting ? "Submitting..." : "Submit Proposal"}
          </button>
        </form>

        {/* Spinner keyframes */}
        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, fontSize: 12, color: L.textDim }}>
        Powered by NOVATerra
      </div>
    </div>
  );
}
