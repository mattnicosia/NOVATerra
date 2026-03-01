import React from 'react';
import DashboardCalendar from '@/components/dashboard/DashboardCalendar';

/* ────────────────────────────────────────────────────────
   CalendarWidget — thin wrapper around DashboardCalendar
   ──────────────────────────────────────────────────────── */

export default function CalendarWidget() {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <DashboardCalendar />
    </div>
  );
}
