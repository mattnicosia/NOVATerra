import { useState, useMemo, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";

/* ────────────────────────────────────────────────────────
   CalendarPicker — lightweight date picker with month grid
   Usage: <CalendarPicker value="2026-03-15" onChange={setDate} />
   ──────────────────────────────────────────────────────── */

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatDisplay(val) {
  if (!val) return "";
  const [y, m, d] = val.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function CalendarPicker({ value, onChange, placeholder = "Select date..." }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ref = useRef(null);
  const [open, setOpen] = useState(false);

  // Init view month from value or today
  const init = value ? value.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
  const [viewYear, setViewYear] = useState(init[0]);
  const [viewMonth, setViewMonth] = useState(init[1] - 1); // 0-indexed

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Calendar grid
  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevDays = new Date(viewYear, viewMonth, 0).getDate();
    const cells = [];
    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ day: prevDays - i, current: false, key: null });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, current: true, key: dateKey(viewYear, viewMonth, d) });
    }
    // Next month padding
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, current: false, key: null });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const todayStr = useMemo(() => {
    const n = new Date();
    return dateKey(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else setViewMonth(m => m + 1);
  };

  const selectDate = key => {
    onChange(key);
    setOpen(false);
  };

  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);

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
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {/* Dropdown calendar */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            width: 280,
            zIndex: 100,
            background: dk ? C.glassBg || C.bg1 : C.bg1,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            boxShadow: dk ? "0 12px 40px rgba(0,0,0,0.5)" : "0 12px 40px rgba(0,0,0,0.15)",
            padding: 12,
            fontFamily: T.font.display,
            animation: "modalEnter 0.15s ease-out both",
          }}
        >
          {/* Month / Year nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button
              type="button"
              onClick={prevMonth}
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                border: "none",
                background: ov(0.05),
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.textMuted,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M7.5 2.5L4 6L7.5 9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                border: "none",
                background: ov(0.05),
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.textMuted,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M4.5 2.5L8 6L4.5 9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* Weekday headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0, marginBottom: 2 }}>
            {WEEKDAYS.map(d => (
              <div
                key={d}
                style={{
                  textAlign: "center",
                  fontSize: 9,
                  fontWeight: 600,
                  color: C.textDim,
                  padding: "2px 0",
                  letterSpacing: "0.03em",
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
            {days.map((cell, i) => {
              const isSelected = cell.key === value;
              const isToday = cell.key === todayStr;
              return (
                <button
                  type="button"
                  key={i}
                  disabled={!cell.current}
                  onClick={() => cell.current && selectDate(cell.key)}
                  style={{
                    width: 34,
                    height: 30,
                    borderRadius: 6,
                    border: "none",
                    fontSize: 11,
                    fontWeight: isSelected || isToday ? 600 : 400,
                    cursor: cell.current ? "pointer" : "default",
                    color: isSelected ? "#fff" : !cell.current ? ov(0.2) : isToday ? C.accent : C.text,
                    background: isSelected ? C.accent : isToday && cell.current ? `${C.accent}18` : "transparent",
                    transition: "background 0.1s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto",
                  }}
                  onMouseEnter={e => {
                    if (cell.current && !isSelected) e.currentTarget.style.background = ov(0.06);
                  }}
                  onMouseLeave={e => {
                    if (cell.current && !isSelected) {
                      e.currentTarget.style.background = isToday ? `${C.accent}18` : "transparent";
                    }
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
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
              onClick={() => selectDate(todayStr)}
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
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
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
