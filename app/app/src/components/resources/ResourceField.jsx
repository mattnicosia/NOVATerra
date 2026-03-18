/**
 * ResourceField — 2D Canvas Orbital Resource Visualization
 *
 * Each estimator is a ring. Estimates orbit as nodes.
 * Utilization drives color & speed. NOVA auto-schedules, user approves.
 *
 * Canvas 2D, 30fps throttled, DPR-aware, prefers-reduced-motion.
 * Follows the ProjectPulseWidget pattern.
 */

import { useRef, useEffect, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useWorkloadData } from "@/hooks/useWorkloadData";
import { useFieldParticles } from "@/hooks/useFieldParticles";
import { useFieldStore } from "@/stores/fieldStore";
import { unassignedRadius as getUnassignedRadius } from "@/utils/fieldPhysics";
import { renderField, hitTestRendered, hitTestUnassigned } from "./ResourceFieldRenderer";

export default function ResourceField() {
  const C = useTheme();
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const startTimeRef = useRef(null);
  const ringsRef = useRef([]);
  const unassignedRef = useRef([]);

  const workloadData = useWorkloadData();

  // Derive field radius from container size (computed on each frame)
  const fieldRadiusRef = useRef(200);

  const colors = {
    accent: C.accent,
    blue: C.blue,
    green: C.green,
    orange: C.orange,
    red: C.red,
    text: C.text,
    textDim: C.textDim,
    textMuted: C.textMuted,
    bg: C.bg,
    surface: C.surface,
  };

  const { rings, unassignedParticles, teamUtilization } = useFieldParticles(
    workloadData,
    colors,
    fieldRadiusRef.current,
  );

  // Keep refs in sync for the RAF loop (avoids stale closures)
  ringsRef.current = rings;
  unassignedRef.current = unassignedParticles;

  // Store state
  const hoveredNodeId = useFieldStore(s => s.hoveredNodeId);
  const hoveredRingIdx = useFieldStore(s => s.hoveredRingIdx);
  const selectedNodeId = useFieldStore(s => s.selectedNodeId);
  const setHoveredNode = useFieldStore(s => s.setHoveredNode);
  const clearHover = useFieldStore(s => s.clearHover);
  const setSelectedNode = useFieldStore(s => s.setSelectedNode);
  const setTooltipData = useFieldStore(s => s.setTooltipData);

  // ── RAF draw loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersRM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = 0;
    const interval = 1000 / 30;
    startTimeRef.current = performance.now();

    const draw = ts => {
      if (ts - last < interval) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      last = ts;

      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w < 10 || h < 10) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      const cx = w / 2;
      const cy = h / 2;
      const fieldRadius = Math.min(w, h) * 0.42;
      fieldRadiusRef.current = fieldRadius;

      const elapsed = (ts - startTimeRef.current) / 1000;

      renderField(ctx, {
        w,
        h,
        cx,
        cy,
        fieldRadius,
        rings: ringsRef.current,
        unassignedParticles: unassignedRef.current,
        unassignedRadius: getUnassignedRadius(fieldRadius),
        teamUtilization,
        colors,
        hoveredNodeId: useFieldStore.getState().hoveredNodeId,
        hoveredRingIdx: useFieldStore.getState().hoveredRingIdx,
        selectedNodeId: useFieldStore.getState().selectedNodeId,
        time: elapsed,
        reducedMotion: prefersRM,
      });

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [C, teamUtilization, colors]);

  // ── Mouse interaction ──
  const onMouseMove = useCallback(
    e => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Hit-test assigned nodes
      const hit = hitTestRendered(mx, my, ringsRef.current);
      if (hit) {
        setHoveredNode(hit.node.id, hit.ringIdx);
        setTooltipData({
          x: hit.x,
          y: hit.y,
          label: hit.node.label,
          hours: hit.node.hours,
          bidDue: hit.node.bidDue,
          status: hit.node.status,
          client: hit.node.client,
          percentComplete: hit.node.percentComplete,
        });
        canvas.style.cursor = "pointer";
        return;
      }

      // Hit-test unassigned
      const uHit = hitTestUnassigned(mx, my, unassignedRef.current);
      if (uHit) {
        setHoveredNode(uHit.particle.id, null);
        setTooltipData({
          x: uHit.x,
          y: uHit.y,
          label: uHit.particle.label,
          hours: uHit.particle.hours,
          bidDue: uHit.particle.bidDue,
          status: "unassigned",
        });
        canvas.style.cursor = "pointer";
        return;
      }

      clearHover();
      canvas.style.cursor = "crosshair";
    },
    [setHoveredNode, clearHover, setTooltipData],
  );

  const onClick = useCallback(
    e => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const hit = hitTestRendered(mx, my, ringsRef.current);
      if (hit) {
        setSelectedNode(hit.node.id);
        return;
      }

      // Click on empty space deselects
      setSelectedNode(null);
    },
    [setSelectedNode],
  );

  const onMouseLeave = useCallback(() => {
    clearHover();
    if (canvasRef.current) canvasRef.current.style.cursor = "crosshair";
  }, [clearHover]);

  // ── Empty state ──
  if (!workloadData?.estimatorRows?.length && !workloadData?.unassignedEstimates?.length) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 1.5,
          }}
        >
          RESOURCE FIELD
        </div>
        <div style={{ fontSize: 13, color: C.textMuted }}>
          Assign estimators to projects to see the orbital field
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={onMouseMove}
      onClick={onClick}
      onMouseLeave={onMouseLeave}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        cursor: "crosshair",
      }}
    />
  );
}
