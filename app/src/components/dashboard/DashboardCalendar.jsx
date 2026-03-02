import React, { useState, useMemo, useCallback } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useCalendarStore } from '@/stores/calendarStore';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import AddTaskModal from './AddTaskModal';

/* ────────────────────────────────────────────────────────
   DashboardCalendar — month / week / day calendar widget
   Shows bid dates, walkthrough dates, RFI deadlines,
   user tasks, and custom due dates as colored dots.
   ──────────────────────────────────────────────────────── */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Color key → actual theme color
function resolveColor(colorKey, C) {
  const map = { accent: C.accent, orange: C.orange, red: C.red, green: C.green, purple: C.purple };
  return map[colorKey] || C.accent;
}

const TYPE_LABELS = {
  bidDue: 'Bid Due', walkthrough: 'Walkthrough', rfiDue: 'RFI Due', other: 'Due Date', task: 'Task',
};

// ── helpers ──────────────────────────────────────────────
function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function getWeekStart(dateStr) {
  const dt = parseDateStr(dateStr);
  dt.setDate(dt.getDate() - dt.getDay());
  return dt;
}

function formatWeekRange(startDate) {
  const end = new Date(startDate);
  end.setDate(end.getDate() + 6);
  const sMonth = MONTHS_SHORT[startDate.getMonth()];
  const eMonth = MONTHS_SHORT[end.getMonth()];
  if (startDate.getMonth() === end.getMonth()) {
    return `${sMonth} ${startDate.getDate()} – ${end.getDate()}, ${startDate.getFullYear()}`;
  }
  if (startDate.getFullYear() === end.getFullYear()) {
    return `${sMonth} ${startDate.getDate()} – ${eMonth} ${end.getDate()}, ${startDate.getFullYear()}`;
  }
  return `${sMonth} ${startDate.getDate()}, ${startDate.getFullYear()} – ${eMonth} ${end.getDate()}, ${end.getFullYear()}`;
}

function formatDayHeader(dateStr) {
  const dt = parseDateStr(dateStr);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const dt = parseDateStr(dateStr);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function DashboardCalendar() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = (a) => dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;

  const {
    selectedDate, viewMonth, setSelectedDate, setViewMonth,
    toggleComplete, deleteTask,
    calendarView, setCalendarView,
  } = useCalendarStore();
  const [showAddModal, setShowAddModal] = useState(false);

  const { year, month } = viewMonth;
  const { eventsByDate } = useCalendarEvents(year, month);

  // ── today string ──────────────────────────────────────
  const todayStr = useMemo(() => {
    const now = new Date();
    return toDateStr(now);
  }, []);

  // ── month grid computation ────────────────────────────
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      cells.push({ day: d, month: m, year: y, outside: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, month, year, outside: false });
    }
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 0 : month + 1;
      const y = month === 11 ? year + 1 : year;
      cells.push({ day: d, month: m, year: y, outside: true });
    }
    return cells;
  }, [year, month]);

  // ── week days computation ─────────────────────────────
  const weekDays = useMemo(() => {
    const start = getWeekStart(selectedDate);
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(start);
      dt.setDate(dt.getDate() + i);
      return { day: dt.getDate(), month: dt.getMonth(), year: dt.getFullYear(), dateStr: toDateStr(dt) };
    });
  }, [selectedDate]);

  // ── selected day events ───────────────────────────────
  const selectedEvents = useMemo(() => {
    return eventsByDate.get(selectedDate) || [];
  }, [eventsByDate, selectedDate]);

  // ── navigation ────────────────────────────────────────
  const goBack = useCallback(() => {
    if (calendarView === 'month') {
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      setViewMonth(y, m);
    } else if (calendarView === 'week') {
      const dt = parseDateStr(selectedDate);
      dt.setDate(dt.getDate() - 7);
      setSelectedDate(toDateStr(dt));
      setViewMonth(dt.getFullYear(), dt.getMonth());
    } else {
      const dt = parseDateStr(selectedDate);
      dt.setDate(dt.getDate() - 1);
      setSelectedDate(toDateStr(dt));
      setViewMonth(dt.getFullYear(), dt.getMonth());
    }
  }, [calendarView, year, month, selectedDate, setViewMonth, setSelectedDate]);

  const goForward = useCallback(() => {
    if (calendarView === 'month') {
      const m = month === 11 ? 0 : month + 1;
      const y = month === 11 ? year + 1 : year;
      setViewMonth(y, m);
    } else if (calendarView === 'week') {
      const dt = parseDateStr(selectedDate);
      dt.setDate(dt.getDate() + 7);
      setSelectedDate(toDateStr(dt));
      setViewMonth(dt.getFullYear(), dt.getMonth());
    } else {
      const dt = parseDateStr(selectedDate);
      dt.setDate(dt.getDate() + 1);
      setSelectedDate(toDateStr(dt));
      setViewMonth(dt.getFullYear(), dt.getMonth());
    }
  }, [calendarView, year, month, selectedDate, setViewMonth, setSelectedDate]);

  const goToday = useCallback(() => {
    const now = new Date();
    setViewMonth(now.getFullYear(), now.getMonth());
    setSelectedDate(todayStr);
  }, [setViewMonth, setSelectedDate, todayStr]);

  // ── header title ──────────────────────────────────────
  const headerTitle = useMemo(() => {
    if (calendarView === 'month') return `${MONTHS[month]} ${year}`;
    if (calendarView === 'week') return formatWeekRange(getWeekStart(selectedDate));
    return formatDayHeader(selectedDate);
  }, [calendarView, month, year, selectedDate]);

  // ── dateKey from cell ─────────────────────────────────
  const cellDateKey = (cell) => dateKey(cell.year, cell.month, cell.day);

  // ── styles ────────────────────────────────────────────
  const glass = {
    borderRadius: 14, background: 'transparent', border: 'none', padding: '12px 14px',
  };

  const navBtn = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: C.textMuted, fontSize: 14, padding: '2px 6px',
    borderRadius: 6, lineHeight: 1, transition: 'color 0.2s, background 0.2s',
  };

  // ── event row (shared between views) ──────────────────
  const renderEventRow = (ev, i) => (
    <div key={i} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 8px', borderRadius: 7, background: ov(0.03),
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: resolveColor(ev.colorKey, C),
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 500, color: C.text, fontFamily: T.font.display,
          textDecoration: ev.completed ? 'line-through' : 'none',
          opacity: ev.completed ? 0.5 : 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{ev.label}</div>
        {ev.time && (
          <div style={{ fontSize: 8, color: C.textDim, fontFamily: T.font.display, marginTop: 1 }}>{ev.time}</div>
        )}
      </div>
      <span style={{
        fontSize: 7.5, fontWeight: 500, letterSpacing: '0.06em',
        color: resolveColor(ev.colorKey, C), fontFamily: T.font.display, flexShrink: 0,
        padding: '1px 5px', borderRadius: 4, background: `${resolveColor(ev.colorKey, C)}15`,
      }}>{TYPE_LABELS[ev.type] || ev.type}</span>
      {ev.type === 'task' && ev.taskId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button onClick={(e) => { e.stopPropagation(); toggleComplete(ev.taskId); }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: ev.completed ? C.green : C.textDim, padding: '0 2px', lineHeight: 1 }}
            title={ev.completed ? 'Mark incomplete' : 'Mark complete'}>✓</button>
          <button onClick={(e) => { e.stopPropagation(); deleteTask(ev.taskId); }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 9, color: C.textDim, padding: '0 2px', lineHeight: 1 }}
            title="Delete task">✕</button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ ...glass, marginTop: 16, maxWidth: 480, width: '100%', marginBottom: 20 }}>
      {/* ─── Header ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 6 }}>
        {/* View toggle — glass segmented control */}
        <div style={{
          display: 'flex',
          background: dk ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.10)',
          backdropFilter: 'blur(8px) saturate(150%)',
          WebkitBackdropFilter: 'blur(8px) saturate(150%)',
          borderRadius: 6, overflow: 'hidden',
          border: `0.5px solid ${dk ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.20)'}`,
          boxShadow: `inset 0 0.5px 0 ${dk ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.35)'}`,
          flexShrink: 0,
        }}>
          {[
            { key: 'month', label: 'M' },
            { key: 'week', label: 'W' },
            { key: 'day', label: 'D' },
          ].map(v => (
            <button key={v.key} onClick={() => setCalendarView(v.key)}
              style={{
                padding: '3px 8px', fontSize: 8.5, fontWeight: 600, border: 'none', cursor: 'pointer',
                transition: 'all 0.25s ease', fontFamily: T.font.display, letterSpacing: '0.04em',
                background: calendarView === v.key
                  ? (dk ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.40)')
                  : 'transparent',
                color: calendarView === v.key ? C.text : C.textMuted,
                boxShadow: calendarView === v.key
                  ? `inset 0 0.5px 0 ${dk ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.50)'}`
                  : 'none',
              }}>{v.label}</button>
          ))}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center', minWidth: 0 }}>
          <button onClick={goBack} style={navBtn}
            onMouseEnter={e => { e.currentTarget.style.color = C.accent; e.currentTarget.style.background = ov(0.05); }}
            onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.background = 'transparent'; }}
          >‹</button>
          <div style={{
            fontSize: calendarView === 'day' ? 9 : 11, fontWeight: 600, letterSpacing: '0.04em',
            color: C.text, fontFamily: T.font.display, textAlign: 'center',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{headerTitle}</div>
          <button onClick={goForward} style={navBtn}
            onMouseEnter={e => { e.currentTarget.style.color = C.accent; e.currentTarget.style.background = ov(0.05); }}
            onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.background = 'transparent'; }}
          >›</button>
        </div>

        {/* Today + Add */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={goToday}
            style={{ ...navBtn, fontSize: 8.5, fontWeight: 500, letterSpacing: '0.06em', fontFamily: T.font.display, padding: '3px 8px', border: `1px solid ${C.border}` }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.accent}4D`; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted; }}
          >Today</button>
          <button onClick={() => setShowAddModal(true)}
            style={{ ...navBtn, fontSize: 12, fontWeight: 500, padding: '2px 7px', border: `1px solid ${C.border}` }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.green}4D`; e.currentTarget.style.color = C.green; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted; }}
          >+</button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* ─── MONTH VIEW ──────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════ */}
      {calendarView === 'month' && (
        <>
          {/* Weekday Labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, marginBottom: 4 }}>
            {WEEKDAYS.map((d, i) => (
              <div key={i} style={{
                textAlign: 'center', fontSize: 8, fontWeight: 500,
                letterSpacing: '0.08em', color: C.textDim, fontFamily: T.font.display, padding: '2px 0',
              }}>{d}</div>
            ))}
          </div>

          {/* Date Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
            {calendarDays.map((cell, i) => {
              const key = cellDateKey(cell);
              const isToday = key === todayStr;
              const isSelected = key === selectedDate;
              const cellEvents = eventsByDate.get(key) || [];
              const hasEvents = cellEvents.length > 0;
              return (
                <button key={i} onClick={() => setSelectedDate(key)}
                  style={{
                    position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 2, height: 32, border: 'none', cursor: 'pointer', borderRadius: 6,
                    background: isSelected ? `${C.accent}1A` : isToday ? ov(0.04) : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = ov(0.06); }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isToday ? ov(0.04) : 'transparent'; }}
                >
                  <span style={{
                    fontSize: 10, fontWeight: isToday ? 600 : 400,
                    color: cell.outside ? C.textDim : isToday ? C.accent : isSelected ? C.accent : C.text,
                    fontFamily: T.font.display, opacity: cell.outside ? 0.4 : 1,
                  }}>{cell.day}</span>
                  {hasEvents && (
                    <div style={{ display: 'flex', gap: 2, height: 4, alignItems: 'center' }}>
                      {cellEvents.slice(0, 3).map((ev, j) => (
                        <div key={j} style={{
                          width: 4, height: 4, borderRadius: '50%',
                          background: resolveColor(ev.colorKey, C), opacity: cell.outside ? 0.4 : 0.85,
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

          {/* Selected Day Detail */}
          {selectedEvents.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.glassBorder}` }}>
              <div style={{
                fontSize: 8, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
                color: C.textDim, fontFamily: T.font.display, marginBottom: 8,
              }}>{formatDisplayDate(selectedDate)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedEvents.map(renderEventRow)}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* ─── WEEK VIEW ───────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════ */}
      {calendarView === 'week' && (
        <>
          {/* Weekday header row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 6 }}>
            {weekDays.map((wd, i) => {
              const isToday = wd.dateStr === todayStr;
              const isSelected = wd.dateStr === selectedDate;
              return (
                <button key={i}
                  onClick={() => { setSelectedDate(wd.dateStr); setCalendarView('day'); }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '6px 2px', border: 'none', cursor: 'pointer', borderRadius: 8,
                    background: isSelected ? `${C.accent}1A` : isToday ? ov(0.04) : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = ov(0.06); }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? `${C.accent}1A` : isToday ? ov(0.04) : 'transparent'; }}
                >
                  <span style={{
                    fontSize: 7.5, fontWeight: 500, letterSpacing: '0.06em',
                    color: C.textDim, fontFamily: T.font.display, textTransform: 'uppercase',
                  }}>{WEEKDAYS_FULL[i]}</span>
                  <span style={{
                    fontSize: 14, fontWeight: isToday ? 700 : 500,
                    color: isToday ? C.accent : isSelected ? C.accent : C.text,
                    fontFamily: T.font.display,
                  }}>{wd.day}</span>
                  {/* Event dot indicators */}
                  {(() => {
                    const evts = eventsByDate.get(wd.dateStr) || [];
                    return evts.length > 0 ? (
                      <div style={{ display: 'flex', gap: 2, height: 4 }}>
                        {evts.slice(0, 3).map((ev, j) => (
                          <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: resolveColor(ev.colorKey, C), opacity: 0.85 }} />
                        ))}
                      </div>
                    ) : <div style={{ height: 4 }} />;
                  })()}
                </button>
              );
            })}
          </div>

          {/* Day-by-day event list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {weekDays.map((wd, i) => {
              const dayEvents = eventsByDate.get(wd.dateStr) || [];
              if (dayEvents.length === 0) return null;
              const isToday = wd.dateStr === todayStr;
              return (
                <div key={i}>
                  <div style={{
                    fontSize: 8, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: isToday ? C.accent : C.textDim, fontFamily: T.font.display,
                    marginBottom: 4, marginTop: i > 0 ? 4 : 0,
                  }}>{WEEKDAYS_FULL[i]} {wd.day}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dayEvents.map(renderEventRow)}
                  </div>
                </div>
              );
            })}
            {weekDays.every(wd => (eventsByDate.get(wd.dateStr) || []).length === 0) && (
              <div style={{
                textAlign: 'center', padding: '16px 0', color: C.textDim,
                fontSize: 10, fontFamily: T.font.display,
              }}>No events this week</div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* ─── DAY VIEW ────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════ */}
      {calendarView === 'day' && (
        <>
          {/* Day subheader */}
          <div style={{
            fontSize: 8, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: selectedDate === todayStr ? C.accent : C.textDim,
            fontFamily: T.font.display, marginBottom: 10,
          }}>
            {selectedDate === todayStr ? 'Today' : formatDisplayDate(selectedDate)}
          </div>

          {/* Events */}
          {selectedEvents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Timed events first (sorted), then untimed */}
              {[...selectedEvents]
                .sort((a, b) => {
                  if (a.time && b.time) return a.time.localeCompare(b.time);
                  if (a.time) return -1;
                  if (b.time) return 1;
                  return 0;
                })
                .map((ev, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 10px', borderRadius: 8, background: ov(0.03),
                  }}>
                    {/* Time column */}
                    <div style={{
                      width: 40, flexShrink: 0, textAlign: 'right',
                      fontSize: 9, fontWeight: 500, color: C.textDim, fontFamily: T.font.display,
                      paddingTop: 1,
                    }}>
                      {ev.time || '—'}
                    </div>

                    {/* Color bar */}
                    <div style={{
                      width: 3, borderRadius: 2, flexShrink: 0, alignSelf: 'stretch',
                      background: resolveColor(ev.colorKey, C), minHeight: 20,
                    }} />

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 500, color: C.text, fontFamily: T.font.display,
                        textDecoration: ev.completed ? 'line-through' : 'none',
                        opacity: ev.completed ? 0.5 : 1,
                      }}>{ev.label}</div>
                      {ev.description && (
                        <div style={{
                          fontSize: 9, color: C.textDim, fontFamily: T.font.display,
                          marginTop: 2, lineHeight: 1.4,
                        }}>{ev.description}</div>
                      )}
                      <span style={{
                        fontSize: 7.5, fontWeight: 500, letterSpacing: '0.06em',
                        color: resolveColor(ev.colorKey, C), fontFamily: T.font.display,
                        padding: '1px 5px', borderRadius: 4, background: `${resolveColor(ev.colorKey, C)}15`,
                        display: 'inline-block', marginTop: 4,
                      }}>{TYPE_LABELS[ev.type] || ev.type}</span>
                    </div>

                    {/* Task actions */}
                    {ev.type === 'task' && ev.taskId && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, paddingTop: 2 }}>
                        <button onClick={(e) => { e.stopPropagation(); toggleComplete(ev.taskId); }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: ev.completed ? C.green : C.textDim, padding: '0 2px', lineHeight: 1 }}
                          title={ev.completed ? 'Mark incomplete' : 'Mark complete'}>✓</button>
                        <button onClick={(e) => { e.stopPropagation(); deleteTask(ev.taskId); }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10, color: C.textDim, padding: '0 2px', lineHeight: 1 }}
                          title="Delete task">✕</button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center', padding: '20px 0',
            }}>
              <div style={{ fontSize: 10, color: C.textDim, fontFamily: T.font.display, marginBottom: 8 }}>
                No events
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.22)',
                  backdropFilter: 'blur(12px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                  border: `0.5px solid ${dk ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.35)'}`,
                  boxShadow: `inset 0 0.5px 0 ${dk ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.50)'}`,
                  borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                  fontSize: 9, fontWeight: 500, color: C.text, fontFamily: T.font.display,
                  transition: 'all 0.25s ease',
                }}
              >+ Add Task</button>
            </div>
          )}
        </>
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
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: resolveColor(item.colorKey, C) }} />
            <span style={{ fontSize: 7.5, fontWeight: 400, color: C.textDim, fontFamily: T.font.display }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* ─── Add Task Modal ──────────────────────────────── */}
      {showAddModal && (
        <AddTaskModal defaultDate={selectedDate} onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}
