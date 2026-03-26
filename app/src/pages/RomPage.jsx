// RomPage — /rom  •  3-path free estimate tool
// Path A: Upload drawings → Haiku scan → detailed deliverable
// Path B: Enter basics (type, SF) → instant calibrated ROM
// Path C: Guided wizard → ballpark estimate
// No login required to start. Login prompted before results.

import { useState, useRef, useCallback } from "react";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { T } from "@/utils/designTokens";
import { useAuthStore } from "@/stores/authStore";
import { useRomStore } from "@/stores/romStore";
import { generateBaselineROM } from "@/utils/romEngine";
import RomResult from "@/components/rom/RomResult";
import RomUpsell from "@/components/rom/RomUpsell";
import NOVAThinking from "@/components/rom/NOVAThinking";

const BUILDING_TYPES = [
  { value: "commercial-office", label: "Commercial Office" },
  { value: "retail", label: "Retail" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "industrial", label: "Industrial" },
  { value: "residential-multi", label: "Residential - Multi-Family" },
  { value: "hospitality", label: "Hospitality" },
  { value: "residential-single", label: "Residential - Single Family" },
  { value: "mixed-use", label: "Mixed-Use" },
  { value: "government", label: "Government" },
  { value: "religious", label: "Religious" },
  { value: "restaurant", label: "Restaurant" },
  { value: "parking", label: "Parking" },
];

const WORK_TYPES = [
  { value: "", label: "New Construction" },
  { value: "renovation", label: "Renovation" },
  { value: "tenant-improvement", label: "Tenant Improvement" },
  { value: "addition", label: "Addition" },
];

const WIZARD_QUESTIONS = [
  {
    id: "category",
    question: "What type of space is it?",
    options: [
      { value: "commercial-office", label: "Office", icon: "🏢" },
      { value: "retail", label: "Retail / Store", icon: "🏪" },
      { value: "restaurant", label: "Restaurant / Food", icon: "🍽️" },
      { value: "residential-multi", label: "Apartments", icon: "🏘️" },
      { value: "residential-single", label: "House", icon: "🏠" },
      { value: "healthcare", label: "Medical", icon: "🏥" },
      { value: "education", label: "School", icon: "🎓" },
      { value: "hospitality", label: "Hotel", icon: "🏨" },
      { value: "industrial", label: "Warehouse / Industrial", icon: "🏭" },
      { value: "mixed-use", label: "Mixed-Use", icon: "🏗️" },
    ],
  },
  {
    id: "size",
    question: "How big is the space?",
    // Options adjust dynamically based on building type in the wizard
    options: [
      { value: 800, label: "Under 1,000 SF", icon: "◽" },
      { value: 1500, label: "1,000 - 2,000 SF", icon: "◻️" },
      { value: 3000, label: "2,000 - 5,000 SF", icon: "⬜" },
      { value: 7500, label: "5,000 - 10,000 SF", icon: "🔳" },
      { value: 15000, label: "10,000 - 25,000 SF", icon: "🏗️" },
    ],
  },
  {
    id: "work",
    question: "What kind of work?",
    options: [
      { value: "", label: "New Construction", icon: "🆕" },
      { value: "renovation", label: "Renovation", icon: "🔨" },
      { value: "tenant-improvement", label: "Tenant Improvement", icon: "🏢" },
      { value: "addition", label: "Addition", icon: "➕" },
    ],
  },
  {
    id: "floors",
    question: "How many floors?",
    options: [
      { value: 1, label: "1 floor", icon: "1️⃣" },
      { value: 2, label: "2 floors", icon: "2️⃣" },
      { value: 3, label: "3 floors", icon: "3️⃣" },
      { value: 5, label: "4-6 floors", icon: "🏢" },
      { value: 10, label: "7+ floors", icon: "🏙️" },
    ],
  },
];

/* ── Shared styles ── */
const ff = { fontFamily: "'Switzer', -apple-system, sans-serif" };

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "14px 16px",
  fontSize: 15,
  ...ff,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12,
  color: "#EEEDF5",
  outline: "none",
  transition: "border 0.2s",
};

/* ════════════════════════════════════════════════════════════════
   PATH SELECTOR — Three cards
   ════════════════════════════════════════════════════════════════ */
function PathSelector({ onSelect }) {
  const paths = [
    {
      id: "drawings",
      icon: "📄",
      title: "I have drawings",
      desc: "Upload your plans for a detailed scope + budget analysis",
      accent: "#00D4AA",
      tag: "MOST DETAILED",
    },
    {
      id: "basics",
      title: "I know the basics",
      icon: "📐",
      desc: "Building type, SF, location — get a calibrated budget estimate",
      accent: "#4DA6FF",
      tag: "INSTANT",
    },
    {
      id: "explore",
      title: "I'm just exploring",
      icon: "💡",
      desc: "Answer a few questions and we'll build an estimate together",
      accent: "#FFB020",
      tag: "GUIDED",
    },
  ];

  return (
    <div style={{ display: "flex", gap: 16, maxWidth: 900, width: "100%", flexWrap: "wrap", justifyContent: "center" }}>
      {paths.map(p => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          style={{
            flex: "1 1 260px",
            maxWidth: 300,
            padding: "28px 24px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 16,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.3s cubic-bezier(0.25,1,0.5,1)",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = `${p.accent}40`;
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = `0 8px 32px rgba(0,0,0,0.3), 0 0 20px ${p.accent}10`;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
            e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {/* Tag */}
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: p.accent,
              marginBottom: 12,
              ...ff,
            }}
          >
            {p.tag}
          </div>
          {/* Icon + Title */}
          <div style={{ fontSize: 28, marginBottom: 10 }}>{p.icon}</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "#EEEDF5", marginBottom: 8, ...ff }}>{p.title}</div>
          <div style={{ fontSize: 13, color: "rgba(238,237,245,0.4)", lineHeight: 1.5, ...ff }}>{p.desc}</div>
        </button>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   AUTH GATE — Login/signup inline
   ════════════════════════════════════════════════════════════════ */
function AuthGate({ onAuth }) {
  const signUp = useAuthStore(s => s.signUpWithPassword);
  const signIn = useAuthStore(s => s.signInWithPassword);
  const C = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("signup");
  const [confirmEmail, setConfirmEmail] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Email and password are required"); return; }
    setLoading(true);
    try {
      if (mode === "signup") {
        const result = await signUp(email.trim(), password);
        if (result?.confirmEmail) { setConfirmEmail(true); }
        else if (result?.error) {
          const msg = typeof result.error === "string" ? result.error : result.error.message || "Signup failed";
          if (msg.toLowerCase().includes("already")) {
            const lr = await signIn(email.trim(), password);
            if (lr?.error) setError(typeof lr.error === "string" ? lr.error : lr.error.message || "Login failed");
          } else setError(msg);
        }
      } else {
        const result = await signIn(email.trim(), password);
        if (result?.error) setError(typeof result.error === "string" ? result.error : result.error.message || "Login failed");
      }
    } catch (err) { setError(err.message || "Something went wrong"); }
    setLoading(false);
  }

  return (
    <div style={{ width: "100%", maxWidth: 380, margin: "0 auto" }}>
      <div style={{ fontSize: 14, color: "rgba(238,237,245,0.5)", textAlign: "center", marginBottom: 20, ...ff }}>
        Create a free account to see your results
      </div>
      <form onSubmit={handleSubmit}>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }} autoComplete="email" />
        <input type="password" placeholder={mode === "signup" ? "Create a password" : "Password"} value={password}
          onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, marginBottom: 20 }}
          autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        {error && <div style={{ color: "#FB7185", fontSize: 13, marginBottom: 12, textAlign: "center", ...ff }}>{error}</div>}
        {confirmEmail && (
          <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.15)", borderRadius: 12, padding: 16, marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#38BDF8", marginBottom: 4, ...ff }}>Check your email</div>
            <div style={{ fontSize: 12, color: "rgba(238,237,245,0.5)", ...ff }}>Confirmation sent to <strong style={{ color: "#EEEDF5" }}>{email}</strong></div>
            <div onClick={() => { setConfirmEmail(false); setMode("login"); }} style={{ fontSize: 12, color: C.accent, cursor: "pointer", marginTop: 8, ...ff }}>Ready to sign in</div>
          </div>
        )}
        <button type="submit" disabled={loading} style={{
          width: "100%", padding: "14px 24px", borderRadius: 12, border: "none",
          background: C.accent, color: "#fff", cursor: loading ? "wait" : "pointer",
          fontSize: 15, fontWeight: 600, ...ff, opacity: loading ? 0.6 : 1,
        }}>
          {loading ? "One moment..." : mode === "signup" ? "Get Your Estimate" : "Sign In"}
        </button>
      </form>
      <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "rgba(238,237,245,0.35)", ...ff }}>
        {mode === "signup" ? "Already have an account? " : "New here? "}
        <span onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}
          style={{ color: C.accent, cursor: "pointer" }}>{mode === "signup" ? "Sign in" : "Create account"}</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PATH A — Upload Drawings
   ════════════════════════════════════════════════════════════════ */
function DrawingUploadPath({ onResult, onBack }) {
  const C = useTheme();
  const user = useAuthStore(s => s.user);
  const [files, setFiles] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer?.files || []).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (dropped.length) setFiles(prev => [...prev, ...dropped]);
  }, []);

  async function handleScan() {
    if (!files.length) return;
    if (!user) return; // auth gate should handle this
    setScanning(true);
    setError("");
    setProgress("Preparing drawings...");

    try {
      // Convert PDFs to base64 for the scan pipeline
      const drawings = [];
      for (const file of files) {
        setProgress(`Reading ${file.name}...`);
        const buffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        drawings.push({ name: file.name, data: `data:application/pdf;base64,${base64}`, pages: 0 });
      }

      setProgress("Scanning schedules and extracting scope...");

      // Call the scan API through our proxy
      const { callAnthropic, optimizeImageForAI, imageBlock, SCAN_MODEL, INTERPRET_MODEL, NARRATIVE_MODEL } = await import("@/utils/ai");
      const { buildDetectionPrompt, buildParsePrompt, normalizeScheduleData, SCHEDULE_TYPES } = await import("@/utils/scheduleParsers");
      const { generateBaselineROM, generateScheduleLineItems, extractBuildingParamsFromSchedules } = await import("@/utils/romEngine");
      const { renderPdfPage } = await import("@/utils/drawingUtils");

      // Render pages and scan for schedules
      const allSchedules = [];
      const allEntries = [];

      for (const drawing of drawings) {
        setProgress(`Scanning ${drawing.name}...`);

        // Render first 10 pages
        const pageCount = Math.min(10, 20); // we'll detect page count from the PDF
        for (let p = 1; p <= pageCount; p++) {
          try {
            const canvas = await renderPdfPage(drawing.data, p);
            if (!canvas) break;
            drawing.pages = p;

            const optimized = await optimizeImageForAI(canvas.toDataURL("image/jpeg", 0.8));
            if (!optimized?.base64) continue;

            setProgress(`Scanning ${drawing.name} page ${p}...`);

            // Detect schedules on this page
            const prompt = buildDetectionPrompt(`Page ${p}`);
            const result = await callAnthropic({
              model: SCAN_MODEL,
              max_tokens: 1000,
              messages: [{ role: "user", content: [imageBlock(optimized.base64), { type: "text", text: prompt }] }],
            });

            // Parse detection result
            try {
              const startBracket = result.indexOf("[");
              const endBracket = result.lastIndexOf("]");
              if (startBracket >= 0 && endBracket > startBracket) {
                const detected = JSON.parse(result.slice(startBracket, endBracket + 1));
                for (const det of detected) {
                  if (det.type && det.confidence !== "none") {
                    allSchedules.push({ ...det, sheetId: `${drawing.name}-p${p}`, pageNum: p, imgBase64: optimized.base64 });
                  }
                }
              }
            } catch { /* parse failed, skip */ }
          } catch (e) {
            if (e.message?.includes("Invalid PDF")) break;
            // page doesn't exist, stop
            break;
          }
        }
      }

      setProgress(`Found ${allSchedules.length} schedules. Parsing details...`);

      // Parse each detected schedule
      for (const sched of allSchedules) {
        try {
          const parsePrompt = buildParsePrompt(sched.type);
          if (!parsePrompt) continue;

          setProgress(`Parsing ${sched.type} from page ${sched.pageNum}...`);

          const result = await callAnthropic({
            model: SCAN_MODEL,
            max_tokens: 4000,
            messages: [{ role: "user", content: [imageBlock(sched.imgBase64), { type: "text", text: parsePrompt }] }],
          });

          const startBracket = result.indexOf("[");
          const endBracket = result.lastIndexOf("]");
          if (startBracket >= 0 && endBracket > startBracket) {
            const parsed = JSON.parse(result.slice(startBracket, endBracket + 1));
            const normalized = normalizeScheduleData(sched.type, parsed);
            allEntries.push({ type: sched.type, entries: normalized, sheetId: sched.sheetId });
          }
        } catch { /* parse failed */ }
      }

      setProgress("Generating line items and budget...");

      // Extract building params
      const buildingParams = extractBuildingParamsFromSchedules(allEntries);

      // Estimate SF from detected rooms if possible
      let projectSF = 0;
      for (const entry of allEntries) {
        if (entry.type === "finish" && entry.entries) {
          for (const room of entry.entries) {
            // Rough SF estimate from room count
            projectSF += 150; // average room size fallback
          }
        }
      }
      if (projectSF < 500) projectSF = 2000; // minimum fallback

      // Generate line items from schedules
      const lineItems = await generateScheduleLineItems(allEntries);

      // Generate calibrated ROM
      const buildingType = buildingParams.detectedType || "commercial-office";
      const rom = generateBaselineROM(projectSF, buildingType, "", null, buildingParams);

      // Combine ROM + line items
      const result = {
        ...rom,
        scheduleLineItems: lineItems,
        schedules: allEntries,
        buildingParams,
        scanSummary: {
          filesScanned: drawings.length,
          pagesScanned: drawings.reduce((sum, d) => sum + d.pages, 0),
          schedulesFound: allSchedules.length,
          lineItemsGenerated: lineItems.length,
        },
        source: "drawings",
      };

      onResult(result);
    } catch (err) {
      console.error("[ROM] Drawing scan failed:", err);
      setError(err.message || "Scan failed. Please try again.");
    }
    setScanning(false);
  }

  return (
    <div style={{ width: "100%", maxWidth: 500 }}>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: "rgba(238,237,245,0.4)", fontSize: 13,
        cursor: "pointer", marginBottom: 24, padding: 0, ...ff,
      }}>← Back</button>

      <h2 style={{ fontSize: 24, fontWeight: 300, color: "#EEEDF5", margin: "0 0 8px 0", ...ff }}>Upload your drawings</h2>
      <p style={{ fontSize: 14, color: "rgba(238,237,245,0.35)", margin: "0 0 32px 0", lineHeight: 1.6, ...ff }}>
        Drop your construction PDFs here. NOVA will scan for schedules, extract scope items, and generate a detailed budget estimate.
      </p>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        style={{
          border: "2px dashed rgba(255,255,255,0.1)",
          borderRadius: 16,
          padding: files.length ? "20px 24px" : "48px 24px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s",
          background: "rgba(255,255,255,0.02)",
          marginBottom: 24,
        }}
      >
        <input ref={fileRef} type="file" accept=".pdf" multiple style={{ display: "none" }}
          onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />

        {files.length === 0 ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 14, color: "rgba(238,237,245,0.5)", ...ff }}>Drop PDFs here or click to browse</div>
            <div style={{ fontSize: 12, color: "rgba(238,237,245,0.25)", marginTop: 8, ...ff }}>Supports architectural, structural, MEP drawing sets</div>
          </>
        ) : (
          <div>
            {files.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                <span style={{ fontSize: 12, color: "#00D4AA" }}>✓</span>
                <span style={{ fontSize: 13, color: "#EEEDF5", ...ff }}>{f.name}</span>
                <span style={{ fontSize: 11, color: "rgba(238,237,245,0.25)", ...ff }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <span onClick={(e) => { e.stopPropagation(); setFiles(prev => prev.filter((_, j) => j !== i)); }}
                  style={{ fontSize: 11, color: "rgba(238,237,245,0.3)", cursor: "pointer", marginLeft: "auto" }}>✕</span>
              </div>
            ))}
            <div style={{ fontSize: 12, color: "rgba(238,237,245,0.25)", marginTop: 8, ...ff }}>+ Drop more files or click to add</div>
          </div>
        )}
      </div>

      {error && <div style={{ color: "#FB7185", fontSize: 13, marginBottom: 16, ...ff }}>{error}</div>}

      {scanning && (
        <div style={{ marginBottom: 20, padding: 16, background: "rgba(0,212,170,0.04)", borderRadius: 12, border: "1px solid rgba(0,212,170,0.1)" }}>
          <div style={{ fontSize: 13, color: "#00D4AA", fontWeight: 500, marginBottom: 4, ...ff }}>{progress}</div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginTop: 8 }}>
            <div style={{ height: "100%", background: "#00D4AA", borderRadius: 2, width: "60%", animation: "romPulse 2s ease-in-out infinite" }} />
          </div>
        </div>
      )}

      {!user ? (
        <AuthGate />
      ) : (
        <button onClick={handleScan} disabled={!files.length || scanning} style={{
          width: "100%", padding: "15px 24px", borderRadius: 12, border: "none",
          background: files.length && !scanning ? "#00D4AA" : "rgba(255,255,255,0.06)",
          color: files.length && !scanning ? "#000" : "rgba(238,237,245,0.3)",
          cursor: files.length && !scanning ? "pointer" : "not-allowed",
          fontSize: 15, fontWeight: 600, ...ff, transition: "all 0.2s",
        }}>
          {scanning ? "Scanning..." : `Scan ${files.length} Drawing${files.length !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PATH B — Basic Info Form
   ════════════════════════════════════════════════════════════════ */
function BasicInfoPath({ onResult, onBack }) {
  const C = useTheme();
  const user = useAuthStore(s => s.user);
  const [buildingType, setBuildingType] = useState("commercial-office");
  const [projectSF, setProjectSF] = useState("");
  const [workType, setWorkType] = useState("");
  const [floors, setFloors] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!projectSF || parseFloat(projectSF) <= 0) { setError("Enter square footage"); return; }
    setError("");
    const sf = parseFloat(projectSF);
    const params = floors ? { floorCount: parseInt(floors) } : undefined;
    const result = generateBaselineROM(sf, buildingType, workType, null, params);
    result.source = "basics";
    result.location = location;
    onResult(result);
  }

  return (
    <div style={{ width: "100%", maxWidth: 420 }}>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: "rgba(238,237,245,0.4)", fontSize: 13,
        cursor: "pointer", marginBottom: 24, padding: 0, ...ff,
      }}>← Back</button>

      <h2 style={{ fontSize: 24, fontWeight: 300, color: "#EEEDF5", margin: "0 0 8px 0", ...ff }}>Project details</h2>
      <p style={{ fontSize: 14, color: "rgba(238,237,245,0.35)", margin: "0 0 32px 0", ...ff }}>
        The more you share, the more accurate the estimate.
      </p>

      {!user ? <AuthGate /> : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: "rgba(238,237,245,0.35)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Building Type</label>
            <select value={buildingType} onChange={e => setBuildingType(e.target.value)} style={{
              ...inputStyle, cursor: "pointer", appearance: "none", WebkitAppearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat", backgroundPosition: "right 16px center", paddingRight: 40,
            }}>
              {BUILDING_TYPES.map(bt => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: "rgba(238,237,245,0.35)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Square Footage *</label>
            <input type="number" placeholder="e.g. 5000" min="1" value={projectSF}
              onChange={e => setProjectSF(e.target.value)} style={inputStyle} />
            {error && <div style={{ color: "#FB7185", fontSize: 12, marginTop: 6, ...ff }}>{error}</div>}
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "rgba(238,237,245,0.35)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Work Type</label>
              <select value={workType} onChange={e => setWorkType(e.target.value)} style={{
                ...inputStyle, cursor: "pointer", appearance: "none", WebkitAppearance: "none",
              }}>
                {WORK_TYPES.map(wt => <option key={wt.value} value={wt.value}>{wt.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "rgba(238,237,245,0.35)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Floors</label>
              <input type="number" placeholder="e.g. 3" min="1" value={floors}
                onChange={e => setFloors(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, color: "rgba(238,237,245,0.35)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Location (optional)</label>
            <input type="text" placeholder="City, State or ZIP" value={location}
              onChange={e => setLocation(e.target.value)} style={inputStyle} />
          </div>

          <button type="submit" style={{
            width: "100%", padding: "15px 24px", borderRadius: 12, border: "none",
            background: C.accent, color: "#fff", cursor: "pointer", fontSize: 15, fontWeight: 600, ...ff,
          }}>
            Generate Estimate
          </button>
        </form>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PATH C — Guided Wizard
   ════════════════════════════════════════════════════════════════ */
function GuidedWizardPath({ onResult, onBack }) {
  const C = useTheme();
  const user = useAuthStore(s => s.user);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});

  function handleSelect(value) {
    const q = WIZARD_QUESTIONS[step];
    const newAnswers = { ...answers, [q.id]: value };
    setAnswers(newAnswers);

    if (step < WIZARD_QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      // All questions answered — generate ROM
      try {
        const sf = newAnswers.size || 2500;
        const buildType = newAnswers.category || "commercial-office";
        const work = newAnswers.work || "";
        const floorCount = newAnswers.floors || 1;
        const result = generateBaselineROM(sf, buildType, work, null, { floorCount });
        result.source = "wizard";
        result.wizardAnswers = newAnswers;
        onResult(result);
      } catch (err) {
        console.error("[ROM Wizard] Generation failed:", err);
        // Fallback: try without building params
        try {
          const sf = newAnswers.size || 2500;
          const result = generateBaselineROM(sf, newAnswers.category || "commercial-office");
          result.source = "wizard";
          result.wizardAnswers = newAnswers;
          onResult(result);
        } catch (err2) {
          console.error("[ROM Wizard] Fallback also failed:", err2);
        }
      }
    }
  }

  const q = WIZARD_QUESTIONS[step];
  const isLastStep = step === WIZARD_QUESTIONS.length - 1;

  return (
    <div style={{ width: "100%", maxWidth: 500 }}>
      <button onClick={step > 0 ? () => setStep(step - 1) : onBack} style={{
        background: "none", border: "none", color: "rgba(238,237,245,0.4)", fontSize: 13,
        cursor: "pointer", marginBottom: 24, padding: 0, ...ff,
      }}>← {step > 0 ? "Previous" : "Back"}</button>

      {/* Progress */}
      <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
        {WIZARD_QUESTIONS.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= step ? "#00D4AA" : "rgba(255,255,255,0.08)",
            transition: "background 0.3s",
          }} />
        ))}
      </div>

      <h2 style={{ fontSize: 24, fontWeight: 300, color: "#EEEDF5", margin: "0 0 32px 0", ...ff }}>{q.question}</h2>

      {!user && isLastStep ? (
        <AuthGate />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.options.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              style={{
                display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
                background: answers[q.id] === opt.value ? "rgba(0,212,170,0.08)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${answers[q.id] === opt.value ? "rgba(0,212,170,0.3)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 12, cursor: "pointer", textAlign: "left",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { if (answers[q.id] !== opt.value) { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; } }}
              onMouseLeave={e => { if (answers[q.id] !== opt.value) { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; } }}
            >
              <span style={{ fontSize: 22 }}>{opt.icon}</span>
              <span style={{ fontSize: 15, color: "#EEEDF5", fontWeight: 500, ...ff }}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════ */
function RomPageInner() {
  const C = useTheme();
  const resultRef = useRef(null);
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.loading);

  const romResult = useRomStore(s => s.romResult);
  const email = useRomStore(s => s.email);
  const setRomResult = useRomStore(s => s.setRomResult);
  const setEmail = useRomStore(s => s.setEmail);
  const setBuildingType = useRomStore(s => s.setBuildingType);
  const setProjectSF = useRomStore(s => s.setProjectSF);
  const setLeadCaptured = useRomStore(s => s.setLeadCaptured);

  const [path, setPath] = useState(null); // null | "drawings" | "basics" | "explore"
  const [thinking, setThinking] = useState(false);
  const [pendingResult, setPendingResult] = useState(null);
  const [thinkingMeta, setThinkingMeta] = useState({}); // buildingType, sf, opts, etc. for NOVAThinking

  function handleResult(result) {
    // Store the result but show NOVA thinking first
    setPendingResult(result);
    setThinkingMeta({
      path: path || "basics",
      buildingType: result.buildingType || result.jobType || "",
      sf: result.projectSF || 0,
      opts: { floors: result.floors || 1, workType: result.workType || "" },
      scanSummary: result.scanSummary || null,
      wizardAnswers: result.wizardAnswers || null,
    });
    setThinking(true);
  }

  function handleThinkingComplete() {
    // NOVA finished reasoning — reveal the deliverable
    setThinking(false);
    if (pendingResult) {
      setEmail(user?.email || "");
      setBuildingType(pendingResult.buildingType || pendingResult.jobType || "");
      setProjectSF(String(pendingResult.projectSF || ""));
      setLeadCaptured(true);
      setRomResult(pendingResult);
      setPendingResult(null);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    }
  }

  function handleReset() {
    setRomResult(null);
    setPath(null);
    setThinking(false);
    setPendingResult(null);
  }

  if (loading) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#06060C", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(238,237,245,0.2)", fontSize: 14, ...ff }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#06060C", overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
      {/* Pulse animation for scan progress */}
      <style>{`@keyframes romPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }`}</style>

      {/* Atmospheric gradient */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${C.accentBg} 0%, transparent 60%)` }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Header */}
        <header style={{ padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 500, fontSize: 18, color: "rgba(238,237,245,0.5)", letterSpacing: -0.3, ...ff }}>NOVATERRA</div>
          <div style={{ fontSize: 10, color: "rgba(238,237,245,0.2)", textTransform: "uppercase", letterSpacing: 2, ...ff }}>Free Estimate Tool</div>
        </header>

        {/* Hero */}
        <section style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: romResult ? "32px 24px 24px" : "60px 24px 48px",
          textAlign: "center", transition: "padding 0.5s ease",
        }}>
          <h1 style={{
            fontWeight: 300, fontSize: romResult ? 32 : 48, color: "#EEEDF5",
            margin: 0, marginBottom: romResult ? 4 : 12, letterSpacing: -1.5, lineHeight: 1.05,
            transition: "font-size 0.5s ease", ...ff,
          }}>
            {romResult ? "Your Estimate" : "Know your number."}
          </h1>

          {!romResult && !path && (
            <p style={{ fontSize: 16, color: "rgba(238,237,245,0.35)", margin: "0 0 48px 0", maxWidth: 460, lineHeight: 1.6, ...ff }}>
              Upload drawings for a detailed scope analysis. Or enter your project basics for an instant budget estimate.
              Free. No credit card.
            </p>
          )}

          {/* Path selection */}
          {!romResult && !thinking && !path && <PathSelector onSelect={setPath} />}

          {/* Active path */}
          {!romResult && !thinking && path === "drawings" && <DrawingUploadPath onResult={handleResult} onBack={() => setPath(null)} />}
          {!romResult && !thinking && path === "basics" && <BasicInfoPath onResult={handleResult} onBack={() => setPath(null)} />}
          {!romResult && !thinking && path === "explore" && <GuidedWizardPath onResult={handleResult} onBack={() => setPath(null)} />}

          {/* NOVA Thinking — reasoning animation before revealing results */}
          {thinking && (
            <NOVAThinking
              path={thinkingMeta.path}
              buildingType={thinkingMeta.buildingType}
              sf={thinkingMeta.sf}
              opts={thinkingMeta.opts}
              scanSummary={thinkingMeta.scanSummary}
              wizardAnswers={thinkingMeta.wizardAnswers}
              onComplete={handleThinkingComplete}
            />
          )}
        </section>

        {/* Result */}
        {romResult && (
          <section ref={resultRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 24px 64px", maxWidth: 900, margin: "0 auto" }}>
            {/* Source indicator */}
            {romResult.source === "drawings" && romResult.scanSummary && (
              <div style={{
                marginBottom: 24, padding: "12px 20px", borderRadius: 10,
                background: "rgba(0,212,170,0.06)", border: "1px solid rgba(0,212,170,0.12)",
                display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center",
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#00D4AA", ...ff }}>{romResult.scanSummary.filesScanned}</div>
                  <div style={{ fontSize: 10, color: "rgba(238,237,245,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Files Scanned</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#00D4AA", ...ff }}>{romResult.scanSummary.pagesScanned}</div>
                  <div style={{ fontSize: 10, color: "rgba(238,237,245,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Pages</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#00D4AA", ...ff }}>{romResult.scanSummary.schedulesFound}</div>
                  <div style={{ fontSize: 10, color: "rgba(238,237,245,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Schedules Found</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#00D4AA", ...ff }}>{romResult.scanSummary.lineItemsGenerated}</div>
                  <div style={{ fontSize: 10, color: "rgba(238,237,245,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Line Items</div>
                </div>
              </div>
            )}

            <RomResult rom={romResult} email={email} />

            {/* Actions */}
            <div style={{ marginTop: 32, display: "flex", gap: 16, alignItems: "center" }}>
              <button onClick={handleReset} style={{
                padding: "10px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
                background: "transparent", color: "rgba(238,237,245,0.5)", cursor: "pointer", fontSize: 13, fontWeight: 500, ...ff,
              }}>
                New Estimate
              </button>
            </div>

            <div style={{ marginTop: 48 }}><RomUpsell /></div>
          </section>
        )}

        {/* Footer */}
        <footer style={{ padding: "32px 24px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: 11, color: "rgba(238,237,245,0.15)", letterSpacing: 0.5, ...ff }}>NOVATerra by BLDG Estimating</div>
        </footer>
      </div>
    </div>
  );
}

export default function RomPage() {
  return (
    <ThemeProvider>
      <RomPageInner />
    </ThemeProvider>
  );
}
