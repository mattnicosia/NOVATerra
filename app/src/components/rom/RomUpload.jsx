// RomUpload — Email capture + project info form for public ROM funnel
import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/utils/designTokens";
import { inp, bt, card, accentButton, sectionLabel } from "@/utils/styles";

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

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function RomUpload({ onGenerate }) {
  const C = useTheme();
  const [email, setEmail] = useState("");
  const [buildingType, setBuildingType] = useState("commercial-office");
  const [projectSF, setProjectSF] = useState("");
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  function validate() {
    const e = {};
    if (!email.trim()) e.email = "Email is required";
    else if (!validateEmail(email)) e.email = "Enter a valid email address";
    if (!projectSF || parseFloat(projectSF) <= 0) e.projectSF = "Square footage must be greater than 0";
    return e;
  }

  function handleSubmit(evt) {
    evt.preventDefault();
    const e = validate();
    setErrors(e);
    setTouched({ email: true, projectSF: true });
    if (Object.keys(e).length === 0) {
      onGenerate(email.trim(), buildingType, parseFloat(projectSF));
    }
  }

  function handleBlur(field) {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(validate());
  }

  const labelStyle = {
    ...sectionLabel(C),
    display: "block",
    marginBottom: 6,
    fontSize: 11,
  };

  const errorStyle = {
    color: C.red || "#FB7185",
    fontSize: 11,
    marginTop: 4,
    fontFamily: "'DM Sans',sans-serif",
  };

  const fieldWrap = {
    marginBottom: T.space[5],
  };

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 480 }}>
      <div
        style={{
          ...card(C, {
            padding: T.space[7],
          }),
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: T.space[6], textAlign: "center" }}>
          <h2
            style={{
              fontSize: T.fontSize["2xl"],
              fontWeight: T.fontWeight.bold,
              color: C.text,
              fontFamily: "'DM Sans',sans-serif",
              margin: 0,
              marginBottom: T.space[2],
            }}
          >
            Free ROM Estimate
          </h2>
          <p
            style={{
              fontSize: T.fontSize.md,
              color: C.textMuted,
              fontFamily: "'DM Sans',sans-serif",
              margin: 0,
              lineHeight: T.lineHeight.relaxed,
            }}
          >
            Get a Rough Order of Magnitude cost estimate for your project in seconds.
          </p>
        </div>

        {/* Email */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onBlur={() => handleBlur("email")}
            style={inp(C, {
              borderColor: touched.email && errors.email ? C.red || "#FB7185" : undefined,
            })}
          />
          {touched.email && errors.email && <div style={errorStyle}>{errors.email}</div>}
        </div>

        {/* Building Type */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Building Type</label>
          <select
            value={buildingType}
            onChange={e => setBuildingType(e.target.value)}
            style={inp(C, {
              cursor: "pointer",
              appearance: "none",
              WebkitAppearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              paddingRight: 32,
            })}
          >
            {BUILDING_TYPES.map(bt => (
              <option key={bt.value} value={bt.value}>
                {bt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Project SF */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Project Square Footage</label>
          <input
            type="number"
            placeholder="e.g. 50000"
            min="1"
            value={projectSF}
            onChange={e => setProjectSF(e.target.value)}
            onBlur={() => handleBlur("projectSF")}
            style={inp(C, {
              borderColor: touched.projectSF && errors.projectSF ? C.red || "#FB7185" : undefined,
            })}
          />
          {touched.projectSF && errors.projectSF && <div style={errorStyle}>{errors.projectSF}</div>}
        </div>

        {/* Submit */}
        <button
          type="submit"
          style={accentButton(C, {
            width: "100%",
            justifyContent: "center",
            padding: "12px 24px",
            fontSize: T.fontSize.lg,
            fontWeight: T.fontWeight.bold,
            marginTop: T.space[2],
          })}
        >
          Generate ROM
        </button>

        {/* Powered by */}
        <div
          style={{
            textAlign: "center",
            marginTop: T.space[5],
            fontSize: T.fontSize.xs,
            color: C.textDim,
            fontFamily: "'DM Sans',sans-serif",
            letterSpacing: 0.5,
          }}
        >
          Powered by NOVA
        </div>
      </div>
    </form>
  );
}
