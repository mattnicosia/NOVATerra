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
    question: "How many square feet?",
    inputType: "number",
    placeholder: "e.g. 2500",
    suffix: "SF",
  },
  {
    id: "work",
    question: "What kind of work?",
    options: [
      { value: "new-construction", label: "New Construction", icon: "🆕" },
      { value: "renovation", label: "Renovation", icon: "🔨" },
      { value: "tenant-fit-out", label: "Tenant Improvement", icon: "🏢" },
      { value: "addition", label: "Addition", icon: "➕" },
    ],
  },
  {
    id: "labor",
    question: "What labor type?",
    options: [
      { value: "open-shop", label: "Open Shop", icon: "🔧" },
      { value: "prevailing", label: "Prevailing Wage", icon: "📋" },
      { value: "union", label: "Union", icon: "🏗️" },
    ],
  },
  {
    id: "location",
    question: "Where is the project?",
    inputType: "text",
    placeholder: "City, State or ZIP code",
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
  {
    id: "scopeInclusions",
    question: "Which of these apply to your project?",
    yesNoSelect: true,
    options: [
      { value: "demolition", label: "Demolition / Gut Existing Space", defaultYes: true },
      { value: "sitework", label: "Sitework / Site Preparation", defaultYes: false },
      { value: "sitedemo", label: "Site Demolition", defaultYes: false },
      { value: "asbestos", label: "Asbestos Testing / Abatement", defaultYes: false },
      { value: "thirdparty", label: "3rd Party Testing & Inspections", defaultYes: false },
      { value: "designfees", label: "Architectural / Engineering Design Fees", defaultYes: false },
      { value: "permits", label: "Permits & Filing Fees", defaultYes: false },
      { value: "kitchenequip", label: "Kitchen / Food Service Equipment", defaultYes: false },
      { value: "av", label: "Audio / Visual Systems", defaultYes: false },
      { value: "security", label: "Security Systems / Access Control", defaultYes: false },
      { value: "windowtreatments", label: "Window Treatments / Roller Shades", defaultYes: false },
      { value: "furniture", label: "Furniture / FF&E", defaultYes: false },
      { value: "signage", label: "Signage (Interior & Exterior)", defaultYes: false },
      { value: "landscaping", label: "Landscaping / Irrigation", defaultYes: false },
      { value: "lowvoltage", label: "Low Voltage / Data / Telecom", defaultYes: false },
      { value: "fireprotection", label: "Fire Protection / Sprinkler", defaultYes: true },
      { value: "elevator", label: "Elevator / Conveying", defaultYes: false },
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
// Geometric icons — SVG shapes instead of emojis
const GeoIcon = ({ type, color, size = 32 }) => {
  const s = size;
  if (type === "drawings") return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect x="4" y="2" width="18" height="24" rx="2" stroke={color} strokeWidth="1.5" opacity="0.4" />
      <rect x="8" y="6" width="18" height="24" rx="2" stroke={color} strokeWidth="1.5" fill={`${color}08`} />
      <line x1="13" y1="14" x2="22" y2="14" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="13" y1="18" x2="20" y2="18" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="13" y1="22" x2="18" y2="22" stroke={color} strokeWidth="1" opacity="0.5" />
    </svg>
  );
  if (type === "basics") return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect x="4" y="4" width="24" height="24" rx="1" stroke={color} strokeWidth="1.5" fill={`${color}08`} />
      <line x1="4" y1="16" x2="28" y2="16" stroke={color} strokeWidth="0.75" opacity="0.3" />
      <line x1="16" y1="4" x2="16" y2="28" stroke={color} strokeWidth="0.75" opacity="0.3" />
      <circle cx="16" cy="16" r="3" stroke={color} strokeWidth="1.5" />
      <circle cx="16" cy="16" r="1" fill={color} />
    </svg>
  );
  if (type === "explore") return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <polygon points="16,3 28,28 4,28" stroke={color} strokeWidth="1.5" fill={`${color}08`} strokeLinejoin="round" />
      <circle cx="16" cy="19" r="2" fill={color} opacity="0.6" />
      <line x1="16" y1="11" x2="16" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
  return null;
};

function PathSelector({ onSelect }) {
  const paths = [
    {
      id: "drawings",
      iconType: "drawings",
      title: "I have drawings",
      desc: "Upload your plans for a detailed scope + budget analysis",
      accent: "#00D4AA",
      tag: "MOST DETAILED",
    },
    {
      id: "basics",
      iconType: "basics",
      title: "I know the basics",
      desc: "Building type, SF, location — get a calibrated budget estimate",
      accent: "#4DA6FF",
      tag: "INSTANT",
    },
    {
      id: "explore",
      iconType: "explore",
      title: "I'm just exploring",
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
          {/* Geometric icon */}
          <div style={{ marginBottom: 10 }}><GeoIcon type={p.iconType} color={p.accent} /></div>
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
  const [laborType, setLaborType] = useState("open-shop");
  const [floors, setFloors] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!projectSF || parseFloat(projectSF) <= 0) { setError("Enter square footage"); return; }
    setError("");
    const sf = parseFloat(projectSF);
    const params = {
      ...(floors ? { floorCount: parseInt(floors) } : {}),
      laborType,
      location: location || undefined,
    };
    const result = generateBaselineROM(sf, buildingType, workType, null, params);
    result.source = "basics";
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
              <label style={{ fontSize: 11, color: "rgba(238,237,245,0.35)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Labor Type</label>
              <select value={laborType} onChange={e => setLaborType(e.target.value)} style={{
                ...inputStyle, cursor: "pointer", appearance: "none", WebkitAppearance: "none",
              }}>
                <option value="open-shop">Open Shop</option>
                <option value="prevailing">Prevailing Wage</option>
                <option value="union">Union</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "rgba(238,237,245,0.35)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Floors</label>
              <input type="number" placeholder="e.g. 3" min="1" value={floors}
                onChange={e => setFloors(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "rgba(238,237,245,0.35)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>Location</label>
              <input type="text" placeholder="City, State or ZIP" value={location}
                onChange={e => setLocation(e.target.value)} style={inputStyle} />
            </div>
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
  const [inputValue, setInputValue] = useState("");

  // Map scope keys to division codes for inclusion/exclusion
  const SCOPE_TO_DIVISIONS = {
    demolition: ["02"],
    sitework: ["31"],
    sitedemo: ["31"],
    asbestos: ["02"],
    thirdparty: [],          // soft cost, not a division
    designfees: [],          // soft cost
    permits: [],             // soft cost
    kitchenequip: ["11"],
    av: ["27"],
    security: ["28"],
    windowtreatments: ["12"],
    furniture: ["12"],
    signage: ["10"],
    landscaping: ["32"],
    lowvoltage: ["27"],
    fireprotection: ["21"],
    elevator: ["14"],
  };

  function finalize(finalAnswers) {
    try {
      const sf = parseFloat(finalAnswers.size) || 2500;
      const buildType = finalAnswers.category || "commercial-office";
      const work = finalAnswers.work || "new-construction";
      const floorCount = finalAnswers.floors || 1;
      const laborType = finalAnswers.labor || "open-shop";
      const location = finalAnswers.location || "";
      const result = generateBaselineROM(sf, buildType, work, null, { floorCount, laborType, location });
      result.source = "wizard";

      // Apply scope inclusions — items marked "No" get zeroed out
      const inclusions = finalAnswers.scopeInclusions || {};
      const excludedScopes = Object.entries(inclusions).filter(([, v]) => v === false).map(([k]) => k);
      const includedScopes = Object.entries(inclusions).filter(([, v]) => v === true).map(([k]) => k);

      if (excludedScopes.length > 0) {
        result.scopeExclusions = excludedScopes;
        result.scopeInclusions = includedScopes;
        const excludedDivs = new Set();
        excludedScopes.forEach(ex => {
          (SCOPE_TO_DIVISIONS[ex] || []).forEach(d => excludedDivs.add(d));
        });
        for (const divCode of excludedDivs) {
          if (result.divisions[divCode]) {
            const div = result.divisions[divCode];
            div.excluded = true;
            div.excludedReason = "Not required / owner-supplied";
            div.originalTotal = { ...div.total };
            div.originalPerSF = { ...div.perSF };
            div.total = { low: 0, mid: 0, high: 0 };
            div.perSF = { low: 0, mid: 0, high: 0 };
            result.totals.low -= div.originalTotal.low;
            result.totals.mid -= div.originalTotal.mid;
            result.totals.high -= div.originalTotal.high;
          }
        }
        // Add included soft costs as additional line items
        if (inclusions.designfees) {
          result.softCostInclusions = result.softCostInclusions || [];
          result.softCostInclusions.push({ label: "A/E Design Fees", pct: 8 });
        }
        if (inclusions.permits) {
          result.softCostInclusions = result.softCostInclusions || [];
          result.softCostInclusions.push({ label: "Permits & Filing Fees", pct: 2 });
        }
        if (inclusions.thirdparty) {
          result.softCostInclusions = result.softCostInclusions || [];
          result.softCostInclusions.push({ label: "3rd Party Testing & Inspections", pct: 1.5 });
        }
        // Recalculate perSF
        if (sf > 0) {
          result.perSF = {
            low: Math.round((result.totals.low / sf) * 100) / 100,
            mid: Math.round((result.totals.mid / sf) * 100) / 100,
            high: Math.round((result.totals.high / sf) * 100) / 100,
          };
        }
      }
      result.wizardAnswers = finalAnswers;
      onResult(result);
    } catch (err) {
      console.error("[ROM Wizard] Generation failed:", err);
      try {
        const sf = parseFloat(finalAnswers.size) || 2500;
        const result = generateBaselineROM(sf, finalAnswers.category || "commercial-office");
        result.source = "wizard";
        result.wizardAnswers = finalAnswers;
        onResult(result);
      } catch (err2) {
        console.error("[ROM Wizard] Fallback also failed:", err2);
      }
    }
  }

  function handleSelect(value) {
    const q = WIZARD_QUESTIONS[step];
    const newAnswers = { ...answers, [q.id]: value };
    setAnswers(newAnswers);
    setInputValue("");

    if (step < WIZARD_QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      finalize(newAnswers);
    }
  }

  function handleInputSubmit() {
    const q = WIZARD_QUESTIONS[step];
    if (!inputValue.trim()) return;
    const val = q.inputType === "number" ? parseFloat(inputValue) : inputValue.trim();
    if (q.inputType === "number" && (!val || val <= 0)) return;
    handleSelect(val);
  }

  // Yes/No state for scope inclusions
  const [yesNoState, setYesNoState] = useState({});

  function initYesNo(q) {
    if (Object.keys(yesNoState).length === 0 && q.yesNoSelect) {
      const initial = {};
      q.options.forEach(opt => { initial[opt.value] = opt.defaultYes; });
      setYesNoState(initial);
    }
  }

  function toggleYesNo(value) {
    setYesNoState(prev => ({ ...prev, [value]: !prev[value] }));
  }

  function handleYesNoContinue() {
    const q = WIZARD_QUESTIONS[step];
    const newAnswers = { ...answers, [q.id]: { ...yesNoState } };
    setAnswers(newAnswers);
    setYesNoState({});
    if (step < WIZARD_QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      finalize(newAnswers);
    }
  }

  const q = WIZARD_QUESTIONS[step];
  const isLastStep = step === WIZARD_QUESTIONS.length - 1;
  const isInputStep = !!q.inputType;
  const isYesNoStep = !!q.yesNoSelect;

  // Init yes/no defaults when reaching that step
  if (isYesNoStep && Object.keys(yesNoState).length === 0) {
    initYesNo(q);
  }

  return (
    <div style={{ width: "100%", maxWidth: 500 }}>
      <button onClick={step > 0 ? () => { setStep(step - 1); setInputValue(""); } : onBack} style={{
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
      {q.yesNoSelect && <p style={{ fontSize: 13, color: "rgba(238,237,245,0.35)", margin: "-20px 0 24px", ...ff }}>Toggle each scope. Items marked "No" will be excluded from the estimate.</p>}

      {/* Yes/No scope inclusion step */}
      {isYesNoStep ? (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {q.options.map(opt => {
              const isYes = yesNoState[opt.value] ?? opt.defaultYes;
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleYesNo(opt.value)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px",
                    background: isYes ? "rgba(0,212,170,0.06)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isYes ? "rgba(0,212,170,0.2)" : "rgba(255,255,255,0.04)"}`,
                    borderRadius: 10, cursor: "pointer", textAlign: "left",
                    transition: "all 0.2s",
                  }}
                >
                  <span style={{
                    fontSize: 13, color: isYes ? "#EEEDF5" : "rgba(238,237,245,0.35)",
                    fontWeight: isYes ? 500 : 400, ...ff,
                  }}>{opt.label}</span>
                  <div style={{
                    padding: "3px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.05em",
                    background: isYes ? "rgba(0,212,170,0.15)" : "rgba(255,255,255,0.06)",
                    color: isYes ? "#00D4AA" : "rgba(238,237,245,0.3)",
                    transition: "all 0.2s", ...ff,
                  }}>
                    {isYes ? "YES" : "NO"}
                  </div>
                </button>
              );
            })}
          </div>
          <button onClick={handleYesNoContinue} style={{
            width: "100%", marginTop: 20, padding: "14px 24px", borderRadius: 12,
            border: "none", background: "#00D4AA", color: "#000",
            cursor: "pointer", fontSize: 15, fontWeight: 600, ...ff,
          }}>
            Continue
          </button>
        </div>
      ) : isInputStep ? (
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type={q.inputType}
              placeholder={q.placeholder}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleInputSubmit()}
              autoFocus
              style={{ ...inputStyle, flex: 1, fontSize: 18, padding: "16px 20px" }}
              min={q.inputType === "number" ? "1" : undefined}
            />
            {q.suffix && <span style={{ color: "rgba(238,237,245,0.3)", fontSize: 16, ...ff }}>{q.suffix}</span>}
          </div>
          <button onClick={handleInputSubmit} style={{
            width: "100%", marginTop: 16, padding: "14px 24px", borderRadius: 12,
            border: "none", background: inputValue.trim() ? "#00D4AA" : "rgba(255,255,255,0.06)",
            color: inputValue.trim() ? "#000" : "rgba(238,237,245,0.3)",
            cursor: inputValue.trim() ? "pointer" : "not-allowed",
            fontSize: 15, fontWeight: 600, ...ff, transition: "all 0.2s",
          }}>
            {isLastStep ? "Generate Estimate" : "Continue"}
          </button>
        </div>
      ) : !user && isLastStep ? (
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
            <>
              <p style={{ fontSize: 16, color: "rgba(238,237,245,0.45)", margin: "0 0 32px 0", maxWidth: 520, lineHeight: 1.7, ...ff }}>
                NOVATerra generates construction budget estimates calibrated against <strong style={{ color: "#EEEDF5" }}>real project data</strong> — not AI guesses.
                Every number is backed by actual proposals from real contractors in real markets.
              </p>

              {/* How it works */}
              <div style={{
                display: "flex", gap: 32, maxWidth: 600, margin: "0 auto 40px",
                justifyContent: "center", flexWrap: "wrap",
              }}>
                {[
                  { step: "1", label: "Tell us about your project", sub: "Upload drawings or enter basics" },
                  { step: "2", label: "NOVA analyzes the scope", sub: "AI + calibrated benchmarks" },
                  { step: "3", label: "Get your budget estimate", sub: "With data source & confidence" },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: "center", flex: "1 1 140px" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", margin: "0 auto 8px",
                      border: "1px solid rgba(255,255,255,0.12)", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: "rgba(238,237,245,0.5)", ...ff,
                    }}>{s.step}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#EEEDF5", marginBottom: 3, ...ff }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: "rgba(238,237,245,0.3)", ...ff }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              <div style={{
                fontSize: 11, color: "rgba(238,237,245,0.2)", marginBottom: 36,
                textTransform: "uppercase", letterSpacing: "0.12em", ...ff,
              }}>
                Free · No credit card · Results in seconds
              </div>
            </>
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

            {/* Data points indicator — shows for ALL result types */}
            <div style={{
              marginBottom: 20, padding: "14px 24px", borderRadius: 10,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center", alignItems: "center",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="#00D4AA" strokeWidth="1.2" />
                  <circle cx="7" cy="7" r="2" fill="#00D4AA" />
                </svg>
                <span style={{ fontSize: 12, color: "rgba(238,237,245,0.5)", ...ff }}>
                  <strong style={{ color: "#EEEDF5" }}>{romResult.dataPoints || 58}</strong> proposals calibrating this estimate
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="2" y="2" width="10" height="10" rx="2" stroke="#4DA6FF" strokeWidth="1.2" />
                  <line x1="5" y1="7" x2="9" y2="7" stroke="#4DA6FF" strokeWidth="1.2" />
                  <line x1="7" y1="5" x2="7" y2="9" stroke="#4DA6FF" strokeWidth="1.2" />
                </svg>
                <span style={{ fontSize: 12, color: "rgba(238,237,245,0.5)", ...ff }}>
                  <strong style={{ color: "#EEEDF5" }}>{romResult.contractorCount || 2}</strong> regional contractor{(romResult.contractorCount || 2) !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <polygon points="7,1 13,5 13,10 7,14 1,10 1,5" stroke="#FFB020" strokeWidth="1.2" fill="none" />
                </svg>
                <span style={{ fontSize: 12, color: "rgba(238,237,245,0.5)", ...ff }}>
                  Market: <strong style={{ color: "#EEEDF5" }}>{romResult.location || romResult.wizardAnswers?.location || "NY Metro"}</strong>
                </span>
              </div>
            </div>

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
