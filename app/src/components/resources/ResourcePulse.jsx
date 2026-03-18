/**
 * ResourcePulse — Heartbeat Utilization Strip
 *
 * Thin canvas strip (full width × 48px) showing 3-week team utilization forecast.
 * Smooth bezier line, gradient fill (green → amber → red based on amplitude).
 * Today marker, deadline cluster indicators.
 *
 * Canvas 2D, 30fps, DPR-aware.
 */

import { useRef, useEffect, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useWorkloadData } from "@/hooks/useWorkloadData";
import { hexToRgb } from "@/utils/fieldPhysics";

const WEEKS = 3;
const WEEKDAYS = WEEKS * 5; // 15 weekdays

export default function ResourcePulse() {
  const C = useTheme();
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const ctxRef = useRef(null);
  const canvasSizeRef = useRef({ w: 0, h: 0 });
  const workload = useWorkloadData();

  // Pre-compute RGB values outside draw loop
  const colorRgb = useMemo(() => ({
    red: hexToRgb(C.red),
    orange: hexToRgb(C.orange),
    green: hexToRgb(C.green),
  }), [C.red, C.orange, C.green]);

  // Build daily utilization data for next 3 weeks
  const pulseData = useMemo(() => {
    const { teamDailyLoad, estimatorRows, effectiveHoursPerDay = 7, warnings = [] } = workload || {};
    if (!teamDailyLoad || !estimatorRows?.length) return null;

    const teamSize = estimatorRows.length || 1;
    const teamCapacity = teamSize * effectiveHoursPerDay;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = [];
    let d = new Date(today);
    let count = 0;

    while (count < WEEKDAYS) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) {
        const key = d.toISOString().slice(0, 10);
        const hours = teamDailyLoad?.get(key) || 0;
        const util = teamCapacity > 0 ? hours / teamCapacity : 0;
        days.push({ date: key, util, hours, dow });
        count++;
      }
      d = new Date(d.getTime() + 86400000);
    }

    // Find deadline clusters from warnings
    const deadlineDays = new Set();
    for (const w of warnings) {
      if (w.type === "bid_cluster" && w.dates) {
        for (const dd of w.dates) deadlineDays.add(dd);
      }
    }

    // Find today index
    const todayStr = today.toISOString().slice(0, 10);
    const todayIdx = days.findIndex(d => d.date === todayStr);

    return { days, deadlineDays, todayIdx };
  }, [workload]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pulseData) return;

    const prefersRM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = 0;
    const interval = 1000 / 30;
    const startTime = performance.now();
    ctxRef.current = canvas.getContext("2d");

    const draw = ts => {
      if (ts - last < interval) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      last = ts;

      const ctx = ctxRef.current;
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w < 10 || h < 10) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvasSizeRef.current.w !== targetW || canvasSizeRef.current.h !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvasSizeRef.current = { w: targetW, h: targetH };
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const elapsed = (ts - startTime) / 1000;
      const { days, deadlineDays, todayIdx } = pulseData;
      const padX = 40;
      const padY = 6;
      const plotW = w - padX * 2;
      const plotH = h - padY * 2 - 12; // reserve 12px for labels
      const maxUtil = 1.5; // cap at 150%

      const { red: redRgb, orange: orangeRgb, green: greenRgb } = colorRgb;

      ctx.clearRect(0, 0, w, h);

      // ── Grid lines ──
      const thresholds = [0.5, 0.8, 1.0];
      for (const t of thresholds) {
        const y = padY + plotH * (1 - t / maxUtil);
        ctx.beginPath();
        ctx.moveTo(padX, y);
        ctx.lineTo(padX + plotW, y);
        ctx.strokeStyle = t === 1.0
          ? `rgba(${redRgb.r},${redRgb.g},${redRgb.b},0.15)`
          : `rgba(255,255,255,0.04)`;
        ctx.lineWidth = t === 1.0 ? 1 : 0.5;
        ctx.setLineDash(t === 1.0 ? [4, 4] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Build bezier points ──
      const points = days.map((d, i) => ({
        x: padX + (plotW * i) / Math.max(days.length - 1, 1),
        y: padY + plotH * (1 - Math.min(d.util, maxUtil) / maxUtil),
        util: d.util,
      }));

      if (points.length < 2) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      // ── Gradient fill under curve ──
      const gradient = ctx.createLinearGradient(0, padY, 0, padY + plotH);
      gradient.addColorStop(0, `rgba(${redRgb.r},${redRgb.g},${redRgb.b},0.3)`);
      gradient.addColorStop(0.3, `rgba(${orangeRgb.r},${orangeRgb.g},${orangeRgb.b},0.2)`);
      gradient.addColorStop(0.6, `rgba(${greenRgb.r},${greenRgb.g},${greenRgb.b},0.15)`);
      gradient.addColorStop(1, `rgba(${greenRgb.r},${greenRgb.g},${greenRgb.b},0.02)`);

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const cpx = (points[i - 1].x + points[i].x) / 2;
        ctx.bezierCurveTo(cpx, points[i - 1].y, cpx, points[i].y, points[i].x, points[i].y);
      }
      ctx.lineTo(points[points.length - 1].x, padY + plotH);
      ctx.lineTo(points[0].x, padY + plotH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // ── Line ──
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const cpx = (points[i - 1].x + points[i].x) / 2;
        ctx.bezierCurveTo(cpx, points[i - 1].y, cpx, points[i].y, points[i].x, points[i].y);
      }

      // Color based on average utilization
      const avgUtil = days.reduce((s, d) => s + d.util, 0) / days.length;
      let lineColor = C.green;
      if (avgUtil > 1.0) lineColor = C.red;
      else if (avgUtil > 0.8) lineColor = C.orange;
      else if (avgUtil > 0.5) lineColor = C.accent;

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // ── Animated glow on line ──
      if (!prefersRM) {
        const { r, g, b } = hexToRgb(lineColor);
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.15 + Math.sin(elapsed * 2) * 0.08})`;
        ctx.lineWidth = 6;
        ctx.stroke();
      }

      // ── Data points ──
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        let dotColor = C.green;
        if (p.util > 1.0) dotColor = C.red;
        else if (p.util > 0.8) dotColor = C.orange;
        else if (p.util > 0.5) dotColor = C.accent;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        // Deadline marker
        if (deadlineDays.has(days[i].date)) {
          ctx.beginPath();
          ctx.arc(p.x, padY + plotH + 6, 2, 0, Math.PI * 2);
          ctx.fillStyle = C.red;
          ctx.fill();
        }
      }

      // ── Today marker ──
      if (todayIdx >= 0 && todayIdx < points.length) {
        const tx = points[todayIdx].x;
        ctx.beginPath();
        ctx.moveTo(tx, padY);
        ctx.lineTo(tx, padY + plotH);
        ctx.strokeStyle = `rgba(255,255,255,0.3)`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // "TODAY" label
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.font = "500 7px 'Switzer', sans-serif";
        ctx.fillStyle = C.textDim;
        ctx.fillText("TODAY", tx, padY + plotH + 2);
      }

      // ── Week labels ──
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "600 7px 'Switzer', sans-serif";
      ctx.fillStyle = C.textMuted;

      const weekLabels = ["THIS WEEK", "NEXT WEEK", "2 WEEKS OUT"];
      for (let wi = 0; wi < WEEKS; wi++) {
        const startI = wi * 5;
        const endI = Math.min(startI + 4, points.length - 1);
        if (startI >= points.length) break;
        const midX = (points[startI].x + points[endI].x) / 2;
        ctx.fillText(weekLabels[wi], midX, padY + plotH + 10);
      }

      // ── Y-axis labels ──
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.font = "500 7px 'Switzer', sans-serif";
      ctx.fillStyle = C.textMuted;
      for (const t of [0, 0.5, 1.0]) {
        const y = padY + plotH * (1 - t / maxUtil);
        ctx.fillText(`${Math.round(t * 100)}%`, padX - 6, y);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [C.accent, C.green, C.orange, C.red, C.textDim, C.textMuted, colorRgb, pulseData]);

  if (!pulseData) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: 56,
        display: "block",
        borderRadius: 6,
        background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
      }}
    />
  );
}
