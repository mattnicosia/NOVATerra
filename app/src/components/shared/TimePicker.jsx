import { useState, useRef, useEffect, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";

/* ────────────────────────────────────────────────────────
   TimePicker — lightweight time picker with scroll columns
   Matches CalendarPicker visual style.
   Usage: <TimePicker value="14:00" onChange={setTime} />
   Value format: "HH:mm" (24h) — display shows 12h AM/PM
   ──────────────────────────────────────────────────────── */

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,10,...55

function parse24(val) {
  if (!val) return { h: 12, m: 0, period: "PM" };
  const [hh, mm] = val.split(":").map(Number);
  const period = hh >= 12 ? "PM" : "AM";
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  // Snap to nearest 5-minute boundary so selection always highlights
  const m5 = Math.round(mm / 5) * 5;
  return { h: h12, m: m5 >= 60 ? 55 : m5, period };
}

function to24(h12, m, period) {
  let hh = h12;
  if (period === "AM" && hh === 12) hh = 0;
  if (period === "PM" && hh !== 12) hh += 12;
  return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDisplay(val) {
  if (!val) return "";
  const { h, m, period } = parse24(val);
  return `${h}:${String(m).padStart(2, "0")} ${period}`;
}

export default function TimePicker({ value, onChange, placeholder = "Select time..." }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ref = useRef(null);
  const [open, setOpen] = useState(false);

  const parsed = useMemo(() => parse24(value), [value]);
  const [selH, setSelH] = useState(parsed.h);
  const [selM, setSelM] = useState(parsed.m);
  const [selP, setSelP] = useState(parsed.period);

  // Sync local state when value changes externally
  useEffect(() => {
    const p = parse24(value);
    setSelH(p.h);
    setSelM(p.m);
    setSelP(p.period);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const commit = (h, m, p) => {
    onChange(to24(h, m, p));
  };

  const pickHour = h => {
    setSelH(h);
    commit(h, selM, selP);
  };
  const pickMinute = m => {
    setSelM(m);
    commit(selH, m, selP);
  };
  const pickPeriod = p => {
    setSelP(p);
    commit(selH, selM, p);
  };

  const setNow = () => {
    const now = new Date();
    const hh = now.getHours();
    const mm = now.getMinutes();
    // Round to nearest 5
    const rounded = Math.round(mm / 5) * 5;
    const finalMm = rounded === 60 ? 0 : rounded;
    const finalHh = rounded === 60 ? (hh + 1) % 24 : hh;
    const val = `${String(finalHh).padStart(2, "0")}:${String(finalMm).padStart(2, "0")}`;
    onChange(val);
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setOpen(false);
  };

  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);

  const colStyle = {
    flex: 1,
    maxHeight: 200,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 1,
    scrollbarWidth: "thin",
  };

  const cellBase = {
    width: "100%",
    height: 32,
    border: "none",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 400,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.1s",
    fontFamily: T.font.display,
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "7px 10px",
          background: dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
          border: `1px solid ${C.border}`,
          borderRadius: T.radius.sm,
          color: value ? C.text : C.textDim,
          fontSize: T.fontSize.sm,
          cursor: "pointer",
          fontFamily: T.font.display,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>{value ? formatDisplay(value) : placeholder}</span>
        {/* Clock icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={C.textDim}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            width: 260,
            zIndex: 100,
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            boxShadow: dk ? "0 12px 40px rgba(0,0,0,0.5)" : "0 12px 40px rgba(0,0,0,0.15)",
            padding: 12,
            fontFamily: T.font.display,
            animation: "modalEnter 0.15s ease-out both",
          }}
        >
          {/* Header */}
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.text,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            {value ? formatDisplay(value) : "Pick a time"}
          </div>

          {/* Columns: Hour | Minute | AM/PM */}
          <div style={{ display: "flex", gap: 6 }}>
            {/* Hour column */}
            <div style={colStyle}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: C.textDim,
                  textAlign: "center",
                  padding: "2px 0 4px",
                  letterSpacing: "0.03em",
                  position: "sticky",
                  top: 0,
                  background: C.bg1,
                  zIndex: 1,
                }}
              >
                HR
              </div>
              {HOURS.map(h => {
                const active = h === selH;
                return (
                  <button
                    type="button"
                    key={h}
                    onClick={() => pickHour(h)}
                    style={{
                      ...cellBase,
                      fontWeight: active ? 600 : 400,
                      color: active ? "#fff" : C.text,
                      background: active ? C.accent : "transparent",
                    }}
                    onMouseEnter={e => {
                      if (!active) e.currentTarget.style.background = ov(0.06);
                    }}
                    onMouseLeave={e => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {h}
                  </button>
                );
              })}
            </div>

            {/* Minute column */}
            <div style={colStyle}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: C.textDim,
                  textAlign: "center",
                  padding: "2px 0 4px",
                  letterSpacing: "0.03em",
                  position: "sticky",
                  top: 0,
                  background: C.bg1,
                  zIndex: 1,
                }}
              >
                MIN
              </div>
              {MINUTES.map(m => {
                const active = m === selM;
                return (
                  <button
                    type="button"
                    key={m}
                    onClick={() => pickMinute(m)}
                    style={{
                      ...cellBase,
                      fontWeight: active ? 600 : 400,
                      color: active ? "#fff" : C.text,
                      background: active ? C.accent : "transparent",
                    }}
                    onMouseEnter={e => {
                      if (!active) e.currentTarget.style.background = ov(0.06);
                    }}
                    onMouseLeave={e => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {String(m).padStart(2, "0")}
                  </button>
                );
              })}
            </div>

            {/* AM/PM toggle */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                paddingTop: 22,
              }}
            >
              {["AM", "PM"].map(p => {
                const active = p === selP;
                return (
                  <button
                    type="button"
                    key={p}
                    onClick={() => pickPeriod(p)}
                    style={{
                      ...cellBase,
                      width: 48,
                      height: 40,
                      fontSize: 11,
                      fontWeight: active ? 700 : 500,
                      letterSpacing: "0.04em",
                      color: active ? "#fff" : C.textDim,
                      background: active ? C.accent : ov(0.04),
                      borderRadius: 8,
                    }}
                    onMouseEnter={e => {
                      if (!active) e.currentTarget.style.background = ov(0.08);
                    }}
                    onMouseLeave={e => {
                      if (!active) e.currentTarget.style.background = ov(0.04);
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick actions */}
          <div
            style={{
              display: "flex",
              gap: 4,
              marginTop: 8,
              borderTop: `1px solid ${C.borderLight || C.border}`,
              paddingTop: 8,
            }}
          >
            <button
              type="button"
              onClick={setNow}
              style={{
                flex: 1,
                padding: "4px 0",
                fontSize: 9,
                fontWeight: 600,
                background: ov(0.04),
                border: "none",
                borderRadius: 4,
                color: C.accent,
                cursor: "pointer",
              }}
            >
              Now
            </button>
            <button
              type="button"
              onClick={clear}
              style={{
                flex: 1,
                padding: "4px 0",
                fontSize: 9,
                fontWeight: 600,
                background: ov(0.04),
                border: "none",
                borderRadius: 4,
                color: C.textDim,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
