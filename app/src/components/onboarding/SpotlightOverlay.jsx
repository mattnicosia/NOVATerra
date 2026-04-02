/**
 * SpotlightOverlay — Full-viewport dark overlay with cutout around target element.
 * Renders a tooltip with step info, navigation, and skip option.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";
import { useSpotlightTour } from "@/hooks/useSpotlightTour";
import { bt, card } from "@/utils/styles";
import { backdropVariants, modalVariants, tweenFast } from "@/utils/motion";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function SpotlightOverlay() {
  const C = useTheme();
  const T = C.T;
  const isActive = useSpotlightTour(s => s.isActive);
  const currentStep = useSpotlightTour(s => s.currentStep);
  const tourId = useSpotlightTour(s => s.tourId);
  const nextStep = useSpotlightTour(s => s.nextStep);
  const prevStep = useSpotlightTour(s => s.prevStep);
  const skipTour = useSpotlightTour(s => s.skipTour);
  const getStep = useSpotlightTour(s => s.getStep);
  const getTotalSteps = useSpotlightTour(s => s.getTotalSteps);

  const [targetRect, setTargetRect] = useState(null);
  const step = getStep();
  const totalSteps = getTotalSteps();

  // Find target element and track its position
  const updateRect = useCallback(() => {
    if (!step?.targetSelector) { setTargetRect(null); return; }
    const el = document.querySelector(step.targetSelector);
    if (el) {
      const r = el.getBoundingClientRect();
      setTargetRect({ x: r.x - 8, y: r.y - 8, w: r.width + 16, h: r.height + 16 });
    } else {
      setTargetRect(null);
    }
  }, [step?.targetSelector]);

  useEffect(() => {
    if (!isActive) return;
    updateRect();
    const observer = new ResizeObserver(updateRect);
    observer.observe(document.body);
    window.addEventListener("scroll", updateRect, true);
    return () => { observer.disconnect(); window.removeEventListener("scroll", updateRect, true); };
  }, [isActive, updateRect, currentStep]);

  // Close on Escape
  useEffect(() => {
    if (!isActive) return;
    const handleKey = e => { if (e.key === "Escape") skipTour(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isActive, skipTour]);

  if (!isActive || !step) return null;

  // Clip path polygon: full viewport with cutout rectangle
  const vw = window.innerWidth, vh = window.innerHeight;
  const r = targetRect || { x: vw / 2 - 100, y: vh / 2 - 50, w: 200, h: 100 };
  const clipPath = `polygon(
    0 0, ${vw}px 0, ${vw}px ${vh}px, 0 ${vh}px, 0 0,
    ${r.x}px ${r.y}px, ${r.x}px ${r.y + r.h}px,
    ${r.x + r.w}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y}px, ${r.x}px ${r.y}px
  )`;

  // Tooltip position
  const pos = step.position || "bottom";
  const tooltipStyle = { position: "fixed", zIndex: 100001 };
  const pad = 12;
  if (pos === "bottom") {
    tooltipStyle.top = r.y + r.h + pad;
    tooltipStyle.left = Math.max(12, Math.min(r.x, vw - 320));
  } else if (pos === "top") {
    tooltipStyle.bottom = vh - r.y + pad;
    tooltipStyle.left = Math.max(12, Math.min(r.x, vw - 320));
  } else if (pos === "right") {
    tooltipStyle.top = r.y;
    tooltipStyle.left = r.x + r.w + pad;
  } else {
    tooltipStyle.top = r.y;
    tooltipStyle.right = vw - r.x + pad;
  }

  return (
    <AnimatePresence>
      {isActive && (
        <>
          {/* Dark overlay with cutout */}
          <motion.div
            key="spotlight-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tweenFast}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100000,
              background: "rgba(0,0,0,0.6)",
              clipPath,
              pointerEvents: "auto",
            }}
            onClick={skipTour}
          />

          {/* Cutout highlight ring */}
          {targetRect && (
            <motion.div
              key="spotlight-ring"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={tweenFast}
              style={{
                position: "fixed",
                left: r.x - 2,
                top: r.y - 2,
                width: r.w + 4,
                height: r.h + 4,
                border: `2px solid ${C.accent}60`,
                borderRadius: 8,
                zIndex: 100000,
                pointerEvents: "none",
                boxShadow: `0 0 0 4000px rgba(0,0,0,0.55), 0 0 20px ${C.accent}30`,
              }}
            />
          )}

          {/* Tooltip */}
          <motion.div
            key={`tooltip-${currentStep}`}
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={tweenFast}
            style={{
              ...tooltipStyle,
              ...card(C),
              padding: T.space[3],
              maxWidth: 300,
              pointerEvents: "auto",
            }}
          >
            {/* Step counter */}
            <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
              {Array.from({ length: totalSteps }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === currentStep ? 16 : 6,
                    height: 4,
                    borderRadius: 2,
                    background: i === currentStep ? C.accent : `${C.border}30`,
                    transition: "all 200ms ease-out",
                  }}
                />
              ))}
            </div>

            {/* Content */}
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              {step.title}
            </div>
            <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.5, marginBottom: T.space[3] }}>
              {step.description}
            </div>

            {/* Navigation */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                onClick={skipTour}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: C.textDim }}
              >
                Skip tour
              </button>
              <div style={{ display: "flex", gap: 4 }}>
                {currentStep > 0 && (
                  <button onClick={prevStep} style={bt(C, { padding: "4px 10px", fontSize: 9, color: C.textDim })}>
                    Back
                  </button>
                )}
                <button
                  onClick={nextStep}
                  style={bt(C, { padding: "4px 12px", fontSize: 9, fontWeight: 600, background: C.accent, color: "#fff" })}
                >
                  {currentStep === totalSteps - 1 ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
