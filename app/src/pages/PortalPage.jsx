import { useState, useEffect, useCallback } from "react";

// Self-contained portal page — renders outside auth gate, no useTheme() dependency
// Uses hardcoded NOVA dark theme colors

const C = {
  bg: "#0D0F14",
  bg1: "#1C1E24",
  bg2: "#2A2D35",
  text: "#F5F5F7",
  textMuted: "#8E8E93",
  textDim: "#636366",
  accent: "#7C5CFC",
  accentGlow: "#BF5AF2",
  border: "#2C2C2E",
  green: "#30D158",
  red: "#FF453A",
  orange: "#FF9F0A",
};

export default function PortalPage() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Structured bid form
  const [bidAmount, setBidAmount] = useState("");
  const [subInclusions, setSubInclusions] = useState("");
  const [subExclusions, setSubExclusions] = useState("");

  // Extract token from URL
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/portal\/([A-Za-z0-9_-]+)/);
    if (match) {
      setToken(match[1]);
    } else {
      setError("Invalid portal link");
      setLoading(false);
    }
  }, []);

  // Fetch portal data
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const resp = await fetch(`/api/portal?token=${token}`);
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || "Invalid or expired invitation");
        }
        const portalData = await resp.json();
        setData(portalData);
        if (portalData.alreadySubmitted) {
          setSubmitted(true);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleUpload = useCallback(
    async file => {
      if (!file || !token) return;

      // Validate file type
      const validTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|xlsx)$/i)) {
        setError("Please upload a PDF, image (JPG/PNG), or Excel file");
        return;
      }

      // Validate file size (50MB max)
      if (file.size > 50 * 1024 * 1024) {
        setError("File size must be under 50MB");
        return;
      }

      setUploading(true);
      setUploadProgress(10);
      setError(null);

      try {
        // Step 1: Get signed upload URL
        setUploadProgress(20);
        const uploadResp = await fetch("/api/portal-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            filename: file.name,
            contentType: file.type,
          }),
        });

        if (!uploadResp.ok) {
          const err = await uploadResp.json().catch(() => ({}));
          throw new Error(err.error || "Failed to initiate upload");
        }

        const { proposalId, signedUrl } = await uploadResp.json();
        setUploadProgress(40);

        // Step 2: Upload file directly to Supabase Storage
        const putResp = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!putResp.ok) {
          throw new Error("Failed to upload file");
        }
        setUploadProgress(70);

        // Step 3: Confirm upload + trigger parsing
        const confirmResp = await fetch("/api/portal-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            proposalId,
            bidAmount: bidAmount ? parseFloat(bidAmount.replace(/[^0-9.]/g, "")) : null,
            subInclusions: subInclusions.trim() || null,
            subExclusions: subExclusions.trim() || null,
          }),
        });

        if (!confirmResp.ok) {
          const err = await confirmResp.json().catch(() => ({}));
          throw new Error(err.error || "Failed to confirm upload");
        }

        setUploadProgress(100);
        setSubmitted(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setUploading(false);
      }
    },
    [token],
  );

  const handleDrop = useCallback(
    e => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const handleFileInput = useCallback(
    e => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  // ── Loading State ──
  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <LogoHeader />
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div
              style={{
                width: 40,
                height: 40,
                border: `3px solid ${C.border}`,
                borderTopColor: C.accent,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <p style={{ color: C.textMuted, fontSize: 14 }}>Loading invitation...</p>
          </div>
        </div>
        <SpinStyle />
      </div>
    );
  }

  // ── Error State ──
  if (error && !data) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <LogoHeader />
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "rgba(255,69,58,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke={C.red}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h3 style={{ color: C.text, fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Invalid Invitation</h3>
            <p style={{ color: C.textMuted, fontSize: 14, lineHeight: 1.5 }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const { invitation, package: pkg, gcCompany, drawings } = data || {};
  const dueStr = pkg?.dueDate
    ? new Date(pkg.dueDate + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const isPastDue = pkg?.dueDate && new Date() > new Date(pkg.dueDate + "T23:59:59");

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <LogoHeader />

        {/* Project Info Card */}
        <div style={cardStyle}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: C.accent,
              marginBottom: 8,
            }}
          >
            Bid Invitation from {gcCompany}
          </div>
          <h1 style={{ color: C.text, fontSize: 24, fontWeight: 700, margin: "0 0 16px", lineHeight: 1.3 }}>
            {pkg?.name || "Bid Package"}
          </h1>

          {dueStr && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 10,
                background: isPastDue ? "rgba(255,69,58,0.1)" : "rgba(124,92,252,0.08)",
                border: `1px solid ${isPastDue ? "rgba(255,69,58,0.2)" : "rgba(124,92,252,0.15)"}`,
                marginBottom: 16,
              }}
            >
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke={isPastDue ? C.red : C.accent}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span style={{ color: isPastDue ? C.red : C.text, fontSize: 14, fontWeight: 500 }}>
                {isPastDue ? "Past Due: " : "Due: "}
                {dueStr}
              </span>
            </div>
          )}

          {/* Cover Message */}
          {pkg?.coverMessage && (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.03)",
                borderLeft: `3px solid ${C.accent}`,
                marginBottom: 16,
              }}
            >
              <p style={{ color: C.textMuted, fontSize: 14, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {pkg.coverMessage}
              </p>
            </div>
          )}

          {/* Scope Items */}
          {Array.isArray(pkg?.scopeItems) && pkg.scopeItems.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: C.textMuted,
                  marginBottom: 8,
                }}
              >
                Scope of Work
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {pkg.scopeItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.03)",
                      fontSize: 13,
                      color: C.text,
                    }}
                  >
                    <span style={{ color: C.accent, fontFamily: "monospace", fontSize: 12, flexShrink: 0 }}>
                      {typeof item === "object" && item.code ? item.code : "•"}
                    </span>
                    <span>{typeof item === "string" ? item : item.description || item.name || ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scope Sheet */}
          {pkg?.scopeSheet && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: C.textMuted,
                  marginBottom: 8,
                }}
              >
                Scope Summary
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: C.textMuted,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                {pkg.scopeSheet}
              </div>
            </div>
          )}
        </div>

        {/* Drawings */}
        {Array.isArray(drawings) && drawings.length > 0 && (
          <div style={cardStyle}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: C.textMuted,
                marginBottom: 12,
              }}
            >
              Drawings ({drawings.length})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {drawings.map(d => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${C.border}`,
                    textDecoration: "none",
                    transition: "all 150ms",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "rgba(124,92,252,0.08)";
                    e.currentTarget.style.borderColor = C.accent + "40";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.borderColor = C.border;
                  }}
                >
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.accent}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3" />
                  </svg>
                  <span
                    style={{
                      color: C.text,
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d.name || d.label || "Drawing"}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Upload Zone / Submitted State */}
        <div style={cardStyle}>
          {submitted ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "rgba(48,209,88,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <svg
                  width={32}
                  height={32}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.green}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h3 style={{ color: C.text, fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>Proposal Submitted</h3>
              <p style={{ color: C.textMuted, fontSize: 14, lineHeight: 1.5 }}>
                Your proposal has been received and is being processed.
                <br />
                The general contractor will be notified.
              </p>
            </div>
          ) : isPastDue ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <h3 style={{ color: C.red, fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
                This bid has passed its due date
              </h3>
              <p style={{ color: C.textMuted, fontSize: 14 }}>
                Contact the general contractor if you'd like to submit a late proposal.
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: C.textMuted,
                  marginBottom: 12,
                }}
              >
                Submit Your Proposal
              </div>

              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(255,69,58,0.1)",
                    border: "1px solid rgba(255,69,58,0.2)",
                    color: C.red,
                    fontSize: 13,
                    marginBottom: 12,
                  }}
                >
                  {error}
                </div>
              )}

              {/* Structured Bid Form */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                <div>
                  <label
                    style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}
                  >
                    Bid Amount
                  </label>
                  <div style={{ position: "relative" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: C.textDim,
                        fontSize: 15,
                        fontWeight: 600,
                      }}
                    >
                      $
                    </span>
                    <input
                      type="text"
                      value={bidAmount}
                      onChange={e => setBidAmount(e.target.value)}
                      placeholder="0"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "12px 14px 12px 28px",
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        background: "rgba(255,255,255,0.04)",
                        color: C.text,
                        fontSize: 18,
                        fontWeight: 600,
                        outline: "none",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label
                      style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}
                    >
                      Key Inclusions <span style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      value={subInclusions}
                      onChange={e => setSubInclusions(e.target.value)}
                      placeholder="What's included in your bid..."
                      rows={3}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        background: "rgba(255,255,255,0.04)",
                        color: C.text,
                        fontSize: 13,
                        resize: "vertical",
                        outline: "none",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}
                    >
                      Key Exclusions <span style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      value={subExclusions}
                      onChange={e => setSubExclusions(e.target.value)}
                      placeholder="What's NOT included..."
                      rows={3}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        background: "rgba(255,255,255,0.04)",
                        color: C.text,
                        fontSize: 13,
                        resize: "vertical",
                        outline: "none",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: C.textMuted,
                  marginBottom: 8,
                }}
              >
                Upload Proposal Document
              </div>
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${dragOver ? C.accent : C.border}`,
                  borderRadius: 14,
                  padding: "40px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "rgba(124,92,252,0.06)" : "transparent",
                  transition: "all 200ms",
                }}
                onClick={() => document.getElementById("portal-file-input").click()}
              >
                {uploading ? (
                  <>
                    <div
                      style={{
                        width: "80%",
                        height: 6,
                        borderRadius: 3,
                        background: C.border,
                        margin: "0 auto 12px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${uploadProgress}%`,
                          height: "100%",
                          borderRadius: 3,
                          background: `linear-gradient(90deg, ${C.accent}, ${C.accentGlow})`,
                          transition: "width 300ms ease-out",
                        }}
                      />
                    </div>
                    <p style={{ color: C.textMuted, fontSize: 14, margin: 0 }}>Uploading... {uploadProgress}%</p>
                  </>
                ) : (
                  <>
                    <svg
                      width={40}
                      height={40}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={C.accent}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ marginBottom: 12 }}
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12" />
                    </svg>
                    <p style={{ color: C.text, fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>
                      Drop your proposal here
                    </p>
                    <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>
                      or click to browse — PDF, JPG, PNG, or XLSX (50MB max)
                    </p>
                  </>
                )}
              </div>
              <input
                id="portal-file-input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                onChange={handleFileInput}
                style={{ display: "none" }}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "24px 0 40px" }}>
          <a
            href="/sub-dashboard"
            style={{
              color: C.accent,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              marginBottom: 8,
              display: "inline-block",
            }}
          >
            View all your bids &rarr;
          </a>
          <div style={{ color: C.textDim, fontSize: 12 }}>Powered by NOVA Estimating</div>
        </div>
      </div>
      <SpinStyle />
    </div>
  );
}

// ── Shared Components ──

function LogoHeader() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
      <img src="/novaterra-nt.png" alt="NT" style={{ height: 32, width: 32, objectFit: "contain" }} />
      <img src="/novaterra-wordmark.png" alt="NOVATerra" style={{ height: 20, objectFit: "contain" }} />
    </div>
  );
}

function SpinStyle() {
  return (
    <style>{`
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
  );
}

// ── Styles ──

const pageStyle = {
  minHeight: "100vh",
  background: C.bg,
  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const containerStyle = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "40px 20px",
};

const cardStyle = {
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  padding: "24px",
  marginBottom: 16,
};
