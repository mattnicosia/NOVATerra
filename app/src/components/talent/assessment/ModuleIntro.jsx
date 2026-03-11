// ─── BLDG Talent — ModuleIntro ──────────────────────────────────────────
// Pre-module instruction screen shown before starting a module
// Displays module info, rules, time limit, and a "Begin Module" button

import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { card, accentButton, bt } from "@/utils/styles";
import { BT_MODULES } from "@/constants/btBrand";

// ── Inline SVG icons ──
function BrainIcon({ color, size = 48 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a4 4 0 0 1 4 4c0 .74-.2 1.43-.56 2.03A5 5 0 0 1 18 13a5 5 0 0 1-2 4 3 3 0 0 1-4 5" />
      <path d="M12 2a4 4 0 0 0-4 4c0 .74.2 1.43.56 2.03A5 5 0 0 0 6 13a5 5 0 0 0 2 4 3 3 0 0 0 4 5" />
      <path d="M12 2v20" />
    </svg>
  );
}

function UserGroupIcon({ color, size = 48 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <circle cx="17" cy="7" r="2.5" />
      <path d="M21 21v-1.5a3.5 3.5 0 0 0-2.5-3.36" />
    </svg>
  );
}

// Rules text for each module
const MODULE_RULES = {
  cognitive: {
    description: "Test your construction math, cost estimation, and analytical reasoning skills.",
    rules: [
      "15 fill-in-the-blank questions",
      "Calculator allowed",
      "Enter numerical answers",
      "Partial credit awarded for answers within tolerance range",
    ],
  },
  behavioral: {
    description: "Assess your work style, decision-making tendencies, and professional behavior patterns.",
    rules: [
      "24 statements displayed in groups of 4",
      "Rate each 1\u20135 (Strongly Disagree to Strongly Agree)",
      "No right or wrong answers",
      "Answer based on how you typically behave professionally",
    ],
  },
};

export default function ModuleIntro({ moduleKey, onStart }) {
  const C = useTheme();
  const T = C.T;
  const mod = BT_MODULES[moduleKey];
  const info = MODULE_RULES[moduleKey] || {};
  const [visible, setVisible] = useState(false);

  // Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  if (!mod) return null;

  const timeMinutes = Math.round(mod.timeLimit / 60);
  const weightPct = Math.round(mod.weight * 100);
  const IconComponent = moduleKey === "cognitive" ? BrainIcon : UserGroupIcon;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100%",
        padding: T.space[8],
        fontFamily: T.font.sans,
      }}
    >
      <div
        style={{
          ...card(C),
          maxWidth: 520,
          width: "100%",
          padding: T.space[8],
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: T.space[6],
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 400ms ease-out, transform 400ms ease-out",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: T.radius.full,
            background: `${C.accent}14`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconComponent color={C.accent} size={40} />
        </div>

        {/* Module title */}
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              fontSize: T.fontSize.xl,
              fontWeight: T.fontWeight.bold,
              color: C.text,
              margin: 0,
              fontFamily: T.font.sans,
              letterSpacing: T.tracking.tight,
            }}
          >
            {mod.label}
          </h2>
          <p
            style={{
              fontSize: T.fontSize.base,
              color: C.textDim,
              margin: `${T.space[2]}px 0 0`,
              lineHeight: T.lineHeight.relaxed,
            }}
          >
            {info.description}
          </p>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: T.space[6],
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <StatPill label="Time Limit" value={`${timeMinutes} minutes`} C={C} T={T} />
          <StatPill label="Points" value={`${mod.maxPoints} pts (${weightPct}% of total)`} C={C} T={T} />
        </div>

        {/* Divider */}
        <div
          style={{
            width: "100%",
            height: 1,
            background: C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          }}
        />

        {/* Rules */}
        <div style={{ width: "100%", padding: `0 ${T.space[3]}px` }}>
          <div
            style={{
              fontSize: T.fontSize.xs,
              fontWeight: T.fontWeight.bold,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: T.tracking.caps,
              marginBottom: T.space[3],
            }}
          >
            Instructions
          </div>
          <ul
            style={{
              margin: 0,
              padding: `0 0 0 ${T.space[5]}px`,
              listStyle: "none",
            }}
          >
            {(info.rules || []).map((rule, i) => (
              <li
                key={i}
                style={{
                  fontSize: T.fontSize.base,
                  color: C.text,
                  lineHeight: T.lineHeight.relaxed,
                  marginBottom: T.space[2],
                  position: "relative",
                  paddingLeft: T.space[1],
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: -16,
                    color: C.accent,
                    fontWeight: T.fontWeight.bold,
                  }}
                >
                  {"\u2022"}
                </span>
                {rule}
              </li>
            ))}
          </ul>
        </div>

        {/* Begin button */}
        <button
          onClick={onStart}
          style={accentButton(C, {
            padding: "12px 36px",
            fontSize: T.fontSize.md,
            fontFamily: T.font.sans,
            marginTop: T.space[2],
          })}
        >
          Begin Module
        </button>
      </div>
    </div>
  );
}

// Small info pill for time/points
function StatPill({ label, value, C, T }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: T.fontSize.xs,
          fontWeight: T.fontWeight.semibold,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: T.tracking.caps,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: T.fontSize.base,
          fontWeight: T.fontWeight.semibold,
          color: C.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}
