/**
 * useTakeoffCanvasRendering — Canvas drawing effects for TakeoffsPage
 *
 * Extracted from TakeoffsPage.jsx to reduce file size.
 * Contains two useEffect hooks:
 * 1. Static canvas: committed measurements (re-renders on takeoff data changes)
 * 2. Overlay canvas: cursor-dependent content (lightweight, re-renders on cursor move)
 */
import { useEffect } from "react";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";

export default function useTakeoffCanvasRendering({
  canvasRef,
  cursorCanvasRef,
  // Theme
  C,
  // Data
  takeoffs,
  filteredTakeoffs,
  pageFilter,
  selectedDrawingId,
  tkSelectedTakeoffId,
  tkActiveTakeoffId,
  tkActivePoints,
  tkCursorPt,
  tkTool,
  tkCalibrations,
  tkVisibility,
  hiddenTakeoffIds,
  moduleRenderWidths,
  drawingScales,
  drawingDpi,
  geoAnalysis,
  activeModule,
  aiDrawingAnalysis,
  showMeasureLabels,
  // Refs
  shiftHeldRef,
  snapAngleOnRef,
  // Measurement fns
  realToPx,
  hasScale,
  calcPolylineLength,
  calcPolygonArea,
  getDisplayUnit,
}) {
  // ─── Static canvas: committed measurements ───
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedDrawingId) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const toFillHex = pct =>
      Math.round(Math.min(100, Math.max(5, pct)) * 2.55)
        .toString(16)
        .padStart(2, "0");
    const canvasTakeoffs = pageFilter === "page" ? filteredTakeoffs : takeoffs;
    canvasTakeoffs.forEach(to => {
      if (hiddenTakeoffIds.has(to.id)) return;
      if (tkVisibility === "active" && to.id !== tkSelectedTakeoffId && to.id !== tkActiveTakeoffId) return;
      const isSelectedTo = to.id === tkSelectedTakeoffId || to.id === tkActiveTakeoffId;
      const fillHex = toFillHex(to.fillOpacity ?? 75);
      const sw = to.strokeWidth ?? 3;
      (to.measurements || []).forEach(m => {
        if (m.sheetId !== selectedDrawingId) return;
        ctx.save();
        ctx.globalAlpha = isSelectedTo ? 1.0 : 0.28;
        const color = m.color || to.color || "#5b8def";
        if (m.type === "count") {
          const p = m.points[0];
          const brw = moduleRenderWidths[to.id];
          const scaledW = brw ? realToPx(selectedDrawingId, brw.inches) : null;
          const scaledH = brw ? realToPx(selectedDrawingId, brw.inchesH || brw.inches) : null;
          if (scaledW && scaledW >= 6) {
            const hw = scaledW / 2,
              hh = (scaledH || scaledW) / 2;
            ctx.fillStyle = color + fillHex;
            ctx.fillRect(p.x - hw, p.y - hh, scaledW, scaledH || scaledW);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x - hw, p.y - hh, scaledW, scaledH || scaledW);
          } else {
            const sz = 14;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.PI / 4);
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.fillStyle = color + "CC";
            ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
            const innerSz = sz * 0.5;
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fillRect(-innerSz / 2, -innerSz / 2, innerSz, innerSz);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
            ctx.restore();
          }
        }
        if (m.type === "linear" && m.points.length >= 2) {
          const brw = moduleRenderWidths[to.id];
          const scaledW = brw ? realToPx(selectedDrawingId, brw.inches) : null;
          const useScaledWidth = scaledW && scaledW >= 2;
          ctx.beginPath();
          ctx.moveTo(m.points[0].x, m.points[0].y);
          for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y);
          if (useScaledWidth) {
            ctx.strokeStyle = color + fillHex;
            ctx.lineWidth = scaledW;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(m.points[0].x, m.points[0].y);
            for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.stroke();
          } else {
            ctx.strokeStyle = color;
            ctx.lineWidth = sw;
            ctx.stroke();
          }
          ctx.lineCap = "butt";
          ctx.lineJoin = "miter";
        }
        if (m.type === "area" && m.points.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(m.points[0].x, m.points[0].y);
          for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y);
          ctx.closePath();
          ctx.fillStyle = color + fillHex;
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = sw;
          ctx.stroke();
        }
        ctx.restore();
      });
    });

    // Building outlines
    const outlines = useDrawingPipelineStore.getState().outlines;
    const outline = outlines[selectedDrawingId];
    const pxPoly = outline?.pixelPolygon;
    if (pxPoly?.length >= 3) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = "#6366F1";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(pxPoly[0].x, pxPoly[0].y);
      for (let i = 1; i < pxPoly.length; i++) {
        ctx.lineTo(pxPoly[i].x, pxPoly[i].y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      const cx0 = pxPoly.reduce((s, p) => s + p.x, 0) / pxPoly.length;
      const cy0 = pxPoly.reduce((s, p) => s + p.y, 0) / pxPoly.length;
      ctx.font = "bold 14px sans-serif";
      ctx.fillStyle = "#6366F1";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`Building Outline (${outline.source})`, cx0, cy0);
      ctx.restore();
    }

    // Geometry analysis results
    if (geoAnalysis.results) {
      const geo = geoAnalysis.results;
      ctx.save();
      ctx.globalAlpha = 0.4;
      geo.walls.forEach(wall => {
        ctx.beginPath();
        ctx.moveTo(wall.centerline.x1, wall.centerline.y1);
        ctx.lineTo(wall.centerline.x2, wall.centerline.y2);
        ctx.strokeStyle = "#10B981";
        ctx.lineWidth = Math.max(1, wall.width * 0.3);
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      });
      ctx.globalAlpha = 0.08;
      geo.rooms.forEach(room => {
        if (room.polygon.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(room.polygon[0].x, room.polygon[0].y);
        for (let i = 1; i < room.polygon.length; i++) {
          ctx.lineTo(room.polygon[i].x, room.polygon[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = C.accent;
        ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.08;
      });
      ctx.globalAlpha = 0.5;
      geo.openings.forEach(op => {
        ctx.beginPath();
        ctx.arc(op.position.x, op.position.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = op.type === "door" ? "#F59E0B" : "#3B82F6";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- realToPx is derived from drawingScales/drawingDpi already in deps
  }, [
    takeoffs,
    filteredTakeoffs,
    pageFilter,
    selectedDrawingId,
    tkSelectedTakeoffId,
    tkActiveTakeoffId,
    moduleRenderWidths,
    tkVisibility,
    hiddenTakeoffIds,
    drawingScales,
    drawingDpi,
    geoAnalysis,
    activeModule,
  ]);

  // ─── Overlay canvas: cursor-dependent content ───
  useEffect(() => {
    const overlay = cursorCanvasRef.current;
    const mainCanvas = canvasRef.current;
    if (!overlay || !mainCanvas || !selectedDrawingId) return;
    if (overlay.width !== mainCanvas.width || overlay.height !== mainCanvas.height) {
      overlay.width = mainCanvas.width;
      overlay.height = mainCanvas.height;
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Active points (in-progress measurement)
    if (tkActivePoints.length > 0 && tkActiveTakeoffId) {
      const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
      const color = to?.color || "#5b8def";
      const brwPreview = moduleRenderWidths[tkActiveTakeoffId];
      const scaledPreviewW = brwPreview ? realToPx(selectedDrawingId, brwPreview.inches) : null;
      ctx.save();

      // Filled rectangle preview for rect tool
      if (tkTool === "rect" && tkActivePoints.length === 1 && tkCursorPt) {
        const c1 = tkActivePoints[0];
        const c2 = tkCursorPt;
        ctx.fillStyle = color + "20";
        ctx.fillRect(
          Math.min(c1.x, c2.x), Math.min(c1.y, c2.y),
          Math.abs(c2.x - c1.x), Math.abs(c2.y - c1.y),
        );
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(
          Math.min(c1.x, c2.x), Math.min(c1.y, c2.y),
          Math.abs(c2.x - c1.x), Math.abs(c2.y - c1.y),
        );
        ctx.setLineDash([]);
        // Corner dots
        [c1, { x: c2.x, y: c1.y }, c2, { x: c1.x, y: c2.y }].forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
        // Dimension label
        if (hasScale && hasScale(selectedDrawingId)) {
          const wPx = Math.abs(c2.x - c1.x);
          const hPx = Math.abs(c2.y - c1.y);
          const pxPerUnit = (() => {
            try { return realToPx(selectedDrawingId, 12) / 12; } catch { return 0; }
          })();
          if (pxPerUnit > 0) {
            const wFt = wPx / pxPerUnit;
            const hFt = hPx / pxPerUnit;
            const areaVal = wFt * hFt;
            const du = getDisplayUnit ? getDisplayUnit(selectedDrawingId) : "ft";
            const label = `${Math.round(wFt * 10) / 10} × ${Math.round(hFt * 10) / 10} ${du} = ${Math.round(areaVal * 100) / 100} ${du}²`;
            const mx = (c1.x + c2.x) / 2;
            const my = (c1.y + c2.y) / 2;
            ctx.font = "bold 13px sans-serif";
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = "rgba(0,0,0,0.75)";
            ctx.fillRect(mx - tw / 2 - 6, my - 10, tw + 12, 20);
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, mx, my);
          }
        }
      }

      // Filled polygon preview for area tool
      if (tkTool === "area" && tkActivePoints.length >= 2 && tkCursorPt) {
        ctx.beginPath();
        ctx.moveTo(tkActivePoints[0].x, tkActivePoints[0].y);
        for (let i = 1; i < tkActivePoints.length; i++) ctx.lineTo(tkActivePoints[i].x, tkActivePoints[i].y);
        ctx.lineTo(tkCursorPt.x, tkCursorPt.y);
        ctx.closePath();
        ctx.fillStyle = color + "20";
        ctx.fill();
      }

      // Scale-aware wide band preview for linear tool
      if (tkTool === "linear" && scaledPreviewW && scaledPreviewW >= 2 && tkActivePoints.length >= 1) {
        ctx.beginPath();
        ctx.moveTo(tkActivePoints[0].x, tkActivePoints[0].y);
        for (let i = 1; i < tkActivePoints.length; i++) ctx.lineTo(tkActivePoints[i].x, tkActivePoints[i].y);
        if (tkCursorPt) ctx.lineTo(tkCursorPt.x, tkCursorPt.y);
        ctx.strokeStyle = color + "25";
        ctx.lineWidth = scaledPreviewW;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
      }

      // Dashed outline (skip for rect — it renders its own preview)
      if (tkTool !== "rect") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(tkActivePoints[0].x, tkActivePoints[0].y);
        for (let i = 1; i < tkActivePoints.length; i++) ctx.lineTo(tkActivePoints[i].x, tkActivePoints[i].y);
        if (tkCursorPt) ctx.lineTo(tkCursorPt.x, tkCursorPt.y);
        if (tkTool === "area" && tkActivePoints.length >= 2 && tkCursorPt)
          ctx.lineTo(tkActivePoints[0].x, tkActivePoints[0].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Vertex dots
      tkActivePoints.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
      if (tkCursorPt) {
        ctx.beginPath();
        ctx.arc(tkCursorPt.x, tkCursorPt.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color + "80";
        ctx.fill();
        // Crosshair
        ctx.save();
        ctx.strokeStyle = "rgba(255,0,255,0.7)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(tkCursorPt.x, 0);
        ctx.lineTo(tkCursorPt.x, overlay.height);
        ctx.moveTo(0, tkCursorPt.y);
        ctx.lineTo(overlay.width, tkCursorPt.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "11px monospace";
        ctx.fillStyle = "rgba(255,0,255,0.9)";
        ctx.fillText(`(${Math.round(tkCursorPt.x)}, ${Math.round(tkCursorPt.y)})`, tkCursorPt.x + 12, tkCursorPt.y - 10);
        ctx.restore();
      }

      // Snap angle guide
      if (
        (shiftHeldRef.current || snapAngleOnRef.current) &&
        tkCursorPt &&
        tkActivePoints.length >= 1 &&
        (tkTool === "linear" || tkTool === "area")
      ) {
        const anchor = tkActivePoints[tkActivePoints.length - 1];
        const dx = tkCursorPt.x - anchor.x;
        const dy = tkCursorPt.y - anchor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          const angle = Math.atan2(dy, dx);
          const snapAngleVal = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const extLen = Math.max(dist * 1.5, 200);
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(anchor.x - extLen * Math.cos(snapAngleVal), anchor.y - extLen * Math.sin(snapAngleVal));
          ctx.lineTo(anchor.x + extLen * Math.cos(snapAngleVal), anchor.y + extLen * Math.sin(snapAngleVal));
          ctx.stroke();
          ctx.setLineDash([]);
          const degVal = Math.round(((((snapAngleVal * 180) / Math.PI) % 360) + 360) % 360);
          const badgeLabel = degVal + "\u00B0";
          ctx.font = "bold 11px 'Switzer', sans-serif";
          const bw = ctx.measureText(badgeLabel).width + 10;
          const bx = tkCursorPt.x + 18,
            by = tkCursorPt.y + 16;
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(bx - 2, by - 8, bw, 16, 3);
          else ctx.rect(bx - 2, by - 8, bw, 16);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(badgeLabel, bx + 3, by);
          ctx.restore();
        }
      }

      // Running value label
      if (tkCursorPt && hasScale(selectedDrawingId)) {
        const previewPts = [...tkActivePoints, tkCursorPt];
        let liveVal = null,
          unitLbl = "";
        if (tkTool === "area" && previewPts.length >= 3) {
          liveVal = calcPolygonArea(previewPts, selectedDrawingId);
          unitLbl = getDisplayUnit(selectedDrawingId) + "\u00B2";
        } else if (tkTool === "linear" && previewPts.length >= 2) {
          liveVal = calcPolylineLength(previewPts, selectedDrawingId);
          unitLbl = getDisplayUnit(selectedDrawingId);
        }
        if (liveVal !== null) {
          const formatted =
            liveVal >= 1000 ? Math.round(liveVal).toLocaleString() : (Math.round(liveVal * 100) / 100).toString();
          const label = `${formatted} ${unitLbl}`;
          const lx = tkCursorPt.x + 18,
            ly = tkCursorPt.y - 18;
          ctx.font = "bold 14px 'Switzer', sans-serif";
          const tw = ctx.measureText(label).width;
          const px = 8,
            py = 4,
            bgW = tw + px * 2,
            bgH = 20 + py * 2;
          ctx.fillStyle = color;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(lx - px, ly - bgH / 2, bgW, bgH, 4);
          } else {
            ctx.rect(lx - px, ly - bgH / 2, bgW, bgH);
          }
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(label, lx, ly);
        }
      }

      ctx.restore();
    }

    // Calibration points
    if (tkTool === "calibrate" && tkActivePoints.length >= 1) {
      ctx.save();
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      tkActivePoints.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#dc262660";
        ctx.fill();
        ctx.stroke();
      });
      if (tkActivePoints.length === 2) {
        ctx.beginPath();
        ctx.moveTo(tkActivePoints[0].x, tkActivePoints[0].y);
        ctx.lineTo(tkActivePoints[1].x, tkActivePoints[1].y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Always-visible crosshair
    if (tkCursorPt && (tkTool === "area" || tkTool === "linear" || tkTool === "rect" || tkTool === "calibrate" || tkTool === "count")) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,0,255,0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(tkCursorPt.x, 0);
      ctx.lineTo(tkCursorPt.x, overlay.height);
      ctx.moveTo(0, tkCursorPt.y);
      ctx.lineTo(overlay.width, tkCursorPt.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "11px monospace";
      ctx.fillStyle = "rgba(255,0,255,0.85)";
      ctx.fillText(`(${Math.round(tkCursorPt.x)}, ${Math.round(tkCursorPt.y)})`, tkCursorPt.x + 12, tkCursorPt.y - 10);
      ctx.restore();
    }

    // AI Drawing Analysis annotations
    if (
      aiDrawingAnalysis &&
      !aiDrawingAnalysis.loading &&
      aiDrawingAnalysis.results?.length > 0 &&
      aiDrawingAnalysis.aiW &&
      overlay.width
    ) {
      const scaleX = overlay.width / aiDrawingAnalysis.aiW;
      const scaleY = overlay.height / (aiDrawingAnalysis.aiH || aiDrawingAnalysis.aiW);
      ctx.save();
      ctx.globalAlpha = 0.6;
      aiDrawingAnalysis.results.forEach((item, _idx) => {
        const pts = (item.locations || []).map(p => ({ x: Math.round(p.x * scaleX), y: Math.round(p.y * scaleY) }));
        if (pts.length === 0) return;
        const aiColor = item.type === "count" ? "#22c55e" : item.type === "linear" ? "#3b82f6" : "#a855f7";
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = aiColor;
        ctx.lineWidth = 2;
        if (item.type === "count") {
          pts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = aiColor + "20";
            ctx.fill();
            ctx.stroke();
          });
          if (pts[0]) {
            const lbl = item.name?.length > 25 ? item.name.slice(0, 22) + "..." : item.name;
            ctx.font = "bold 10px 'Switzer', sans-serif";
            const tw = ctx.measureText(lbl).width;
            ctx.fillStyle = aiColor + "D0";
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(pts[0].x + 14, pts[0].y - 8, tw + 10, 16, 3);
            else ctx.rect(pts[0].x + 14, pts[0].y - 8, tw + 10, 16);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(lbl, pts[0].x + 19, pts[0].y);
          }
        } else if (item.type === "linear" && pts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
          pts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = aiColor;
            ctx.fill();
          });
          const mid = pts[Math.floor(pts.length / 2)];
          const lbl = item.name?.length > 25 ? item.name.slice(0, 22) + "..." : item.name;
          ctx.font = "bold 10px 'Switzer', sans-serif";
          const tw = ctx.measureText(lbl).width;
          ctx.fillStyle = aiColor + "D0";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(mid.x - tw / 2 - 5, mid.y - 20, tw + 10, 16, 3);
          else ctx.rect(mid.x - tw / 2 - 5, mid.y - 20, tw + 10, 16);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(lbl, mid.x, mid.y - 12);
        } else if (item.type === "area" && pts.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fillStyle = aiColor + "15";
          ctx.fill();
          ctx.stroke();
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          const lbl = item.name?.length > 25 ? item.name.slice(0, 22) + "..." : item.name;
          ctx.font = "bold 10px 'Switzer', sans-serif";
          const tw = ctx.measureText(lbl).width;
          ctx.fillStyle = aiColor + "D0";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(cx - tw / 2 - 5, cy - 8, tw + 10, 16, 3);
          else ctx.rect(cx - tw / 2 - 5, cy - 8, tw + 10, 16);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(lbl, cx, cy);
        }
        ctx.setLineDash([]);
      });
      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measurement fns derived from drawingScales/drawingDpi already in deps
  }, [
    takeoffs,
    tkActivePoints,
    tkCursorPt,
    selectedDrawingId,
    tkTool,
    tkCalibrations,
    drawingScales,
    drawingDpi,
    tkActiveTakeoffId,
    tkSelectedTakeoffId,
    moduleRenderWidths,
    aiDrawingAnalysis,
    tkVisibility,
    showMeasureLabels,
  ]);
}
