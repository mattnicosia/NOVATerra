import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useOrgStore } from "@/stores/orgStore";
import { COLORS, TYPOGRAPHY, MOTION } from "@/constants/designTokens";

// ── Number formatting ────────────────────────────────────────
function fmtDollar(n) {
  if (n == null || isNaN(n)) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ── Sentence builders per route ──────────────────────────────
function dashboardSentence(estimatesIndex) {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + (7 - now.getDay()));

  const active = estimatesIndex.filter(
    (e) => e.status === "Bidding" || e.status === "Submitted"
  );
  const dueThisWeek = active.filter((e) => {
    if (!e.bidDue) return false;
    const d = new Date(e.bidDue + "T23:59:59");
    return d >= now && d <= weekEnd;
  });

  const pipeline = active.reduce((s, e) => s + (e.grandTotal || 0), 0);

  const parts = [];
  if (dueThisWeek.length > 0)
    parts.push({ text: `${dueThisWeek.length}`, accent: true }, { text: ` bid${dueThisWeek.length !== 1 ? "s" : ""} due this week` });
  if (pipeline > 0) {
    if (parts.length) parts.push({ text: " \u00B7 ", sep: true });
    parts.push({ text: fmtDollar(pipeline), accent: true }, { text: " pipeline" });
  }

  if (!parts.length) return [{ text: "NOVA online" }];
  return parts;
}

function projectsSentence(estimatesIndex) {
  const active = estimatesIndex.filter(
    (e) => e.status === "Bidding" || e.status === "Submitted"
  );
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + (7 - now.getDay()));

  const dueThisWeek = active.filter((e) => {
    if (!e.bidDue) return false;
    const d = new Date(e.bidDue + "T23:59:59");
    return d >= now && d <= weekEnd;
  });

  const pipeline = active.reduce((s, e) => s + (e.grandTotal || 0), 0);

  const parts = [];
  parts.push({ text: `${active.length}`, accent: true }, { text: ` active estimate${active.length !== 1 ? "s" : ""}` });
  if (dueThisWeek.length > 0) {
    parts.push({ text: " \u00B7 ", sep: true });
    parts.push({ text: `${dueThisWeek.length}`, accent: true }, { text: " due this week" });
  }
  if (pipeline > 0) {
    parts.push({ text: " \u00B7 ", sep: true });
    parts.push({ text: fmtDollar(pipeline), accent: true }, { text: " total pipeline" });
  }
  return parts;
}

function inboxSentence(estimatesIndex) {
  // Derive from estimates with inbox-related status
  const newRfps = estimatesIndex.filter((e) => e.status === "New" || e.status === "Review");
  const parts = [];
  if (newRfps.length > 0)
    parts.push({ text: `${newRfps.length}`, accent: true }, { text: ` new RFP${newRfps.length !== 1 ? "s" : ""}` });
  if (!parts.length) return [{ text: "Inbox clear" }];
  return parts;
}

function resourcesSentence(members) {
  const parts = [];
  if (members.length > 0) {
    parts.push({ text: `${members.length}`, accent: true }, { text: ` team member${members.length !== 1 ? "s" : ""}` });
  }
  if (!parts.length) return [{ text: "Resources" }];
  return parts;
}

function estimateSentence(estimatesIndex, activeEstimateId, items) {
  const est = estimatesIndex.find((e) => e.id === activeEstimateId);
  if (!est) return [{ text: "NOVA online" }];

  const name = est.name || "Untitled";
  const count = items.length;
  const total = est.grandTotal || 0;

  const parts = [{ text: name }];
  parts.push({ text: " \u2014 " });
  parts.push({ text: `${count}`, accent: true }, { text: ` item${count !== 1 ? "s" : ""}` });
  if (total > 0) {
    parts.push({ text: " \u00B7 ", sep: true });
    parts.push({ text: fmtDollar(total), accent: true });
  }
  return parts;
}

function settingsSentence(org, members) {
  const parts = [];
  const name = org?.name || "BLDG Estimating";
  parts.push({ text: name });
  if (members.length > 0) {
    parts.push({ text: " \u00B7 ", sep: true });
    parts.push({ text: `${members.length}`, accent: true }, { text: ` team member${members.length !== 1 ? "s" : ""}` });
  }
  return parts;
}

// ── Count-up animation hook ──────────────────────────────────
function useCountUp(targetStr, duration = 300) {
  const ref = useRef(null);
  const prevRef = useRef(targetStr);

  useEffect(() => {
    if (!ref.current || prevRef.current === targetStr) return;
    prevRef.current = targetStr;

    // Extract the numeric portion
    const numMatch = targetStr.match(/[\d,.]+/);
    if (!numMatch) {
      ref.current.textContent = targetStr;
      return;
    }

    const prefix = targetStr.slice(0, numMatch.index);
    const suffix = targetStr.slice(numMatch.index + numMatch[0].length);
    const target = parseFloat(numMatch[0].replace(/,/g, ""));
    if (isNaN(target)) {
      ref.current.textContent = targetStr;
      return;
    }

    const start = performance.now();
    const hasDecimal = numMatch[0].includes(".");
    const decimals = hasDecimal ? numMatch[0].split(".")[1].length : 0;

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      let formatted;
      if (hasDecimal) {
        formatted = current.toFixed(decimals);
      } else {
        formatted = Math.round(current).toLocaleString("en-US");
      }

      if (ref.current) ref.current.textContent = prefix + formatted + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [targetStr, duration]);

  return ref;
}

// ── Main component ───────────────────────────────────────────
export default function NovaSentenceBar() {
  const location = useLocation();
  const estimatesIndex = useEstimatesStore((s) => s.estimatesIndex);
  const activeEstimateId = useEstimatesStore((s) => s.activeEstimateId);
  const items = useItemsStore((s) => s.items);
  const org = useOrgStore((s) => s.org);
  const members = useOrgStore((s) => s.members);

  const [visible, setVisible] = useState(true);
  const [displayParts, setDisplayParts] = useState(null);
  const pulseRef = useRef(null);
  const prevSentenceKey = useRef("");

  // Build sentence parts based on route
  const sentenceParts = useMemo(() => {
    const path = location.pathname;

    if (path === "/" || path === "/dashboard")
      return dashboardSentence(estimatesIndex);
    if (path === "/projects" || path === "/estimates")
      return projectsSentence(estimatesIndex);
    if (path === "/inbox")
      return inboxSentence(estimatesIndex);
    if (path === "/resources")
      return resourcesSentence(members);
    if (path === "/settings")
      return settingsSentence(org, members);
    if (path.startsWith("/estimate/") || activeEstimateId)
      return estimateSentence(estimatesIndex, activeEstimateId, items);

    return [{ text: "NOVA online" }];
  }, [location.pathname, estimatesIndex, activeEstimateId, items, org, members]);

  // Serialize for change detection
  const sentenceKey = useMemo(
    () => sentenceParts.map((p) => p.text).join(""),
    [sentenceParts]
  );

  // Fade transition on sentence change
  useEffect(() => {
    if (sentenceKey === prevSentenceKey.current) {
      // Data changed but sentence text same — trigger pulse
      if (pulseRef.current) {
        pulseRef.current.style.opacity = "1";
        setTimeout(() => {
          if (pulseRef.current) pulseRef.current.style.opacity = "0";
        }, 50);
      }
      return;
    }

    prevSentenceKey.current = sentenceKey;
    setVisible(false);

    const fadeInTimer = setTimeout(() => {
      setDisplayParts(sentenceParts);
      setVisible(true);
    }, 100);

    return () => clearTimeout(fadeInTimer);
  }, [sentenceKey, sentenceParts]);

  // Initialize display parts
  useEffect(() => {
    if (!displayParts) setDisplayParts(sentenceParts);
  }, [sentenceParts, displayParts]);

  const parts = displayParts || sentenceParts;

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.sentence,
          opacity: visible ? 1 : 0,
          transition: `opacity ${visible ? "200ms" : "100ms"} ${MOTION.easeOut}`,
        }}
      >
        {parts.map((part, i) =>
          part.sep ? (
            <span key={i} style={styles.separator}>
              {part.text}
            </span>
          ) : part.accent ? (
            <AccentNumber key={i} value={part.text} />
          ) : (
            <span key={i} style={styles.text}>
              {part.text}
            </span>
          )
        )}
      </div>
      <div ref={pulseRef} style={styles.pulse} />
    </div>
  );
}

// ── Accent number with count-up ──────────────────────────────
function AccentNumber({ value }) {
  const ref = useCountUp(value);

  return (
    <span ref={ref} style={styles.accent}>
      {value}
    </span>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = {
  container: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    minHeight: 20,
    fontFamily: "Switzer, sans-serif",
    fontFeatureSettings: "'tnum'",
  },
  sentence: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 0,
  },
  text: {
    fontSize: TYPOGRAPHY.novaReadout.size,
    fontWeight: TYPOGRAPHY.novaReadout.weight,
    lineHeight: `${TYPOGRAPHY.novaReadout.lineHeight}px`,
    color: COLORS.text.secondary,
  },
  accent: {
    fontSize: TYPOGRAPHY.novaReadout.size,
    fontWeight: 600,
    lineHeight: `${TYPOGRAPHY.novaReadout.lineHeight}px`,
    color: COLORS.accent.DEFAULT,
    textShadow: `0 0 8px ${COLORS.accent.glow}`,
  },
  separator: {
    fontSize: TYPOGRAPHY.novaReadout.size,
    fontWeight: TYPOGRAPHY.novaReadout.weight,
    lineHeight: `${TYPOGRAPHY.novaReadout.lineHeight}px`,
    color: COLORS.text.tertiary,
  },
  pulse: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    background: COLORS.accent.DEFAULT,
    opacity: 0,
    transition: `opacity ${MOTION.pulse} ${MOTION.easeOut}`,
    pointerEvents: "none",
  },
};
