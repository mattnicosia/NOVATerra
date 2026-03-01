import React, { useState, useMemo, useCallback } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useCalendarStore } from '@/stores/calendarStore';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import AddTaskModal from './AddTaskModal';

/* ────────────────────────────────────────────────────────
   DashboardCalendar — month-view calendar widget
   Shows bid dates, walkthrough dates, RFI deadlines,
   user tasks, and custom due dates as colored dots.
   ──────────────────────────────────────────────────────── */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Color key → actual theme color
function resolveColor(colorKey, C) {
  const map = {
    accent: C.accent,
    orange: C.orange,
    red: C.red,
    green: C.green,
    purple: C.purple,
  };
  return map[colorKey] || C.accent;
}

// Type label for display
const TYPE_LABELS = {
  bidDue: 'Bid Due',
  walkthrough: 'Walkthrough',
  rfiDue: 'RFI Due',
  other: 'Due Date',
  task: 'Task',
};

export default function DashboardCalendar() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = (a) => dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;

  const { selectedDate, viewMonth, setSelectedDate, setViewMonth, toggleComplete, deleteTask } = useCalendarStore();
  const [showAddModal, setShowAddModal] = useState(false);

  const { year, month } = viewMonth;
  const { eventsByDate } = useCalendarEvents(year, month);

  // ── calendar grid computation ─────────────────────────
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    const cells = [];

    // Previous month trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      cells.push({ day: d, month: m, year: y, outside: true });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, month, year, outside: false });
    }

    // Next month leading days (fill to 42 cells = 6 rows)
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 0 : month + 1;
      const y = month === 11 ? year + 1 : year;
      cells.push({ day: d, month: m, year: y, outside: true });
    }

    return cells;
  }, [year, month]);

  // ── today string ──────────────────────────────────────
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // ── navigation ────────────────────────────────────────
  const goBack = useCallback(() => {
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    setViewMonth(y, m);
  }, [year, month, setViewMonth]);

  const goForward = useCallback(() => {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    setViewMonth(y, m);
  }, [year, month, setViewMonth]);

  const goToday = useCallback(() => {
    const now = new Date();
    setViewMonth(now.getFullYear(), now.getMonth());
    setSelectedDate(todayStr);
  }, [setViewMonth, setSelectedDate, todayStr]);

  // ── dateKey helper ────────────────────────────────────
  const dateKey = (cell) =>
    `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;

  // ── selected day events ───────────────────────────────
  const selectedEvents = useMemo(() => {
    return eventsByDate.get(selectedDate) || [];
  }, [eventsByDate, selectedDate]);

  // ── glass card ────────────────────────────────────────
  const glass = {
    borderRadius: 14,
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    background: C.glassBg,
    border: `1px solid ${C.glassBorder}`,
    padding: '12px 14px',
  };

  // ── styles ────────────────────────────────────────────
  const navBtn = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: C.textMuted, fontSize: 14, padding: '2px 6px',
    borderRadius: 6, lineHeight: 1,
    transition: 'color 0.2s, background 0.2s',
  };

  return (
    <div style={{ ...glass, marginTop: 16, maxWidth: 480, width: '100%', marginBottom: 20 }}>
      {/* ─── Header ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={goBack}
            style={navBtn}
            onMouseEnter={e => { e.currentTarget.style.color = C.accent; e.currentTarget.style.background = ov(0.05); }}
            onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.background = 'transparent'; }}
          >‹</button>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
            color: C.text, fontFamily: T.font.display, minWidth: 120, textAlign: 'center',
          }}>
            {MONTHS[month]} {year}
          </div>
          <button
            onClick={goForward}
            style={navBtn}
            onMouseEnter={e => { e.currentTarget.style.color = C.accent; e.currentTarget.style.background = ov(0.05); }}
            onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.background = 'transparent'; }}
          >›</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={goToday}
            style={{
              ...navBtn, fontSize: 8.5, fontWeight: 500, letterSpacing: '0.06em',
              fontFamily: T.font.display, padding: '3px 8px',
              border: `1px solid ${C.border}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.accent}4D`; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted; }}
          >Today</button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              ...navBtn, fontSize: 12, fontWeight: 500, padding: '2px 7px',
              border: `1px solid ${C.border}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.green}4D`; e.currentTarget.style.color = C.green; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted; }}
          >+</button>
        </div>
      </div>

      {/* ─── Weekday Labels ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, marginBottom: 4 }}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 8, fontWeight: 500,
            letterSpacing: '0.08em', color: C.textDim,
            fontFamily: T.font.display, padding: '2px 0',
          }}>{d}</div>
        ))}
      </div>

      {/* ─── Date Grid ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {calendarDays.map((cell, i) => {
          const key = dateKey(cell);
          const isToday = key === todayStr;
          const isSelected = key === selectedDate;
          const cellEvents = eventsByDate.get(key) || [];
          const hasEvents = cellEvents.length > 0;

          return (
            <button
              key={i}
              onClick={() => setSelectedDate(key)}
              style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 2,
                height: 32, border: 'none', cursor: 'pointer',
                borderRadius: 6,
                background: isSelected
                  ? `${C.accent}1A`
                  : isToday
                  ? ov(0.04)
                  : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = ov(0.06); }}
              onMouseLeave={e => {
                if (!isSelected) e.currentTarget.style.background = isToday ? ov(0.04) : 'transparent';
              }}
            >
              <span style={{
                fontSize: 10, fontWeight: isToday ? 600 : 400,
                color: cell.outside ? C.textDim
                  : isToday ? C.accent
                  : isSelected ? C.accent
                  : C.text,
                fontFamily: T.font.display,
                opacity: cell.outside ? 0.4 : 1,
              }}>
                {cell.day}
              </span>

              {/* Event dots */}
              {hasEvents && (
                <div style={{ display: 'flex', gap: 2, height: 4, alignItems: 'center' }}>
                  {cellEvents.slice(0, 3).map((ev, j) => (
                    <div key={j} style={{
                      width: 4, height: 4, borderRadius: '50%',
                      background: resolveColor(ev.colorKey, C),
                      opacity: cell.outside ? 0.4 : 0.85,
                    }} />
                  ))}
                  {cellEvents.length > 3 && (
                    <span style={{ fontSize: 6, color: C.textDim, fontFamily: T.font.display }}>+</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Selected Day Detail ─────────────────────────── */}
      {selectedEvents.length > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: `1px solid ${C.glassBorder}`,
        }}>
          <div style={{
            fontSize: 8, fontWeight: 600, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: C.textDim,
            fontFamily: T.font.display, marginBottom: 8,
          }}>
            {formatDisplayDate(selectedDate)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selectedEvents.map((ev, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 7,
                background: ov(0.03),
              }}>
                {/* Color dot */}
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: resolveColor(ev.colorKey, C),
                }} />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 500, color: C.text,
                    fontFamily: T.font.display,
                    textDecoration: ev.completed ? 'line-through' : 'none',
                    opacity: ev.completed ? 0.5 : 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ev.label}
                  </div>
                  {ev.time && (
                    <div style={{ fontSize: 8, color: C.textDim, fontFamily: T.font.display, marginTop: 1 }}>
                      {ev.time}
                    </div>
                  )}
                </div>

                {/* Type badge */}
                <span style={{
                  fontSize: 7.5, fontWeight: 500, letterSpacing: '0.06em',
                  color: resolveColor(ev.colorKey, C),
                  fontFamily: T.font.display, flexShrink: 0,
                  padding: '1px 5px', borderRadius: 4,
                  background: `${resolveColor(ev.colorKey, C)}15`,
                }}>
                  {TYPE_LABELS[ev.type] || ev.type}
                </span>

                {/* Task actions */}
                {ev.type === 'task' && ev.taskId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleComplete(ev.taskId); }}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        fontSize: 11, color: ev.completed ? C.green : C.textDim,
                        padding: '0 2px', lineHeight: 1,
                      }}
                      title={ev.completed ? 'Mark incomplete' : 'Mark complete'}
                    >✓</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTask(ev.taskId); }}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        fontSize: 9, color: C.textDim, padding: '0 2px', lineHeight: 1,
                      }}
                      title="Delete task"
                    >✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Color Legend ─────────────────────────────────── */}
      <div style={{
        marginTop: 10, paddingTop: 8,
        borderTop: `1px solid ${C.glassBorder}`,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        {[
          { label: 'Bid Due', colorKey: 'accent' },
          { label: 'Walkthrough', colorKey: 'orange' },
          { label: 'RFI Due', colorKey: 'red' },
          { label: 'Task', colorKey: 'green' },
          { label: 'Other', colorKey: 'purple' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: resolveColor(item.colorKey, C),
            }} />
            <span style={{
              fontSize: 7.5, fontWeight: 400, color: C.textDim,
              fontFamily: T.font.display,
            }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* ─── Add Task Modal ──────────────────────────────── */}
      {showAddModal && (
        <AddTaskModal
          defaultDate={selectedDate}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
