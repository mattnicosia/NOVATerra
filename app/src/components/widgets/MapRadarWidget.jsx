import { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDashboardData } from "@/hooks/useDashboardData";

/* ────────────────────────────────────────────────────────
   MapRadarWidget — Mapbox dark map with radar ping markers
   Expandable: widget size ↔ fullscreen
   ──────────────────────────────────────────────────────── */

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css";
const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js";

const STATUS_COLORS = {
  Qualifying: "#FFB020",
  Bidding: "#00BFFF",
  Submitted: "#4DA6FF",
  Won: "#00D4AA",
  Lost: "#333",
  "On Hold": "#FFB020",
  Draft: "#555",
  Cancelled: "#333",
  Trash: "#222",
};

const STATUS_SPEED = {
  Qualifying: "2.5s",
  Bidding: "2s",
  Submitted: "1.5s",
  Won: "3.5s",
  Lost: "5s",
  "On Hold": "4s",
  Draft: "4s",
};

// Geocode cache — hardcoded known locations + dynamic lookup
const KNOWN_LOCATIONS = {
  "36 old school house": [-74.0589, 41.1847],
  "28 liberty": [-74.0071, 40.7074],
  "popup bagel": [-80.1392, 25.9565],
  "mk showroom": [-74.006, 40.7128],
  "starbucks": [-74.1724, 40.7357],
  "pwyc": [-73.9857, 41.239],
  "spark newburgh": [-74.0104, 41.5034],
  "mainbridge": [-74.0241, 41.112],
  "wolkoff": [-73.9442, 40.7295],
  "welcome homes": [-73.89, 41.298],
  "andes away": [-74.006, 40.7128],
};

function guessLocation(name) {
  const lower = (name || "").toLowerCase();
  for (const [key, coords] of Object.entries(KNOWN_LOCATIONS)) {
    if (lower.includes(key)) return coords;
  }
  // Default: scatter around NYC metro with some randomness
  const hash = lower.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return [-74.0 + (hash % 50) * 0.008 - 0.2, 40.7 + (hash % 30) * 0.01 - 0.15];
}

function buildRing({ inset, color, speed, delay = "0s" }) {
  const ring = document.createElement("div");
  ring.style.position = "absolute";
  ring.style.inset = inset;
  ring.style.borderRadius = "50%";
  ring.style.border = `1px solid ${color}`;
  ring.style.opacity = "0";
  ring.style.animation = `mrp ${speed} ease-out infinite ${delay}`;
  return ring;
}

function createRadarMarker({ size, color, speed, title }) {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = `${size}px`;
  wrapper.style.height = `${size}px`;
  wrapper.style.cursor = "pointer";
  wrapper.title = title;

  wrapper.appendChild(buildRing({ inset: "0", color, speed }));
  wrapper.appendChild(buildRing({ inset: "12%", color, speed, delay: "0.25s" }));
  wrapper.appendChild(buildRing({ inset: "24%", color, speed, delay: "0.5s" }));

  const core = document.createElement("div");
  core.style.position = "absolute";
  core.style.left = "50%";
  core.style.top = "50%";
  core.style.width = "5px";
  core.style.height = "5px";
  core.style.margin = "-2.5px";
  core.style.borderRadius = "50%";
  core.style.background = color;
  core.style.boxShadow = `0 0 6px ${color},0 0 12px ${color}40`;
  wrapper.appendChild(core);

  return wrapper;
}

// Expand icon
const ExpandIcon = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round">
    <path d="M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9" />
  </svg>
);

const CollapseIcon = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round">
    <path d="M5 1v4H1M9 1v4h4M5 13V9H1M9 13V9h4" />
  </svg>
);

export default function MapRadarWidget() {
  const C = useTheme();
  const T = C.T;
  const { estimatesList } = useDashboardData();
  const estimates = estimatesList;

  const [expanded, setExpanded] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(!!window.mapboxgl);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  // Load Mapbox script
  useEffect(() => {
    if (window.mapboxgl) { setScriptLoaded(true); return; }
    // Load CSS
    if (!document.querySelector(`link[href="${MAPBOX_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPBOX_CSS;
      document.head.appendChild(link);
    }
    // Load JS
    const script = document.createElement("script");
    script.src = MAPBOX_JS;
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!scriptLoaded || !mapContainerRef.current || mapRef.current || !MAPBOX_TOKEN) return;
    window.mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new window.mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-74.0, 40.95],
      zoom: 8,
      pitch: 40,
      bearing: -10,
      antialias: true,
      attributionControl: false,
    });
    map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("style.load", () => setMapLoaded(true));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [scriptLoaded]);

  // Resize map when expanded/collapsed or widget resizes
  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => mapRef.current.resize(), 100);
    }
  }, [expanded]);

  // Auto-resize map when widget container changes size
  useEffect(() => {
    if (!mapContainerRef.current || !mapRef.current) return;
    const ro = new ResizeObserver(() => { mapRef.current?.resize(); });
    ro.observe(mapContainerRef.current);
    return () => ro.disconnect();
  }, [scriptLoaded]);

  // Render project markers
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const items = estimates || [];
    items.forEach(est => {
      const name = est.name || est.projectName || "Untitled";
      const status = est.statusLabel || est.status || "Draft";
      const value = est.value || est.grandTotal || 0;
      const color = STATUS_COLORS[status] || "#555";
      const speed = STATUS_SPEED[status] || "3s";
      const [lng, lat] = guessLocation(name);

      // Create radar ping element
      const sz = Math.max(40, Math.min(80, 40 + (value / 500000) * 30));
      const el = createRadarMarker({
        size: sz,
        color,
        speed,
        title: `${name}\n${status} · ${value ? "$" + (value / 1000).toFixed(0) + "K" : "No value"}`,
      });

      el.onclick = () => {
        mapRef.current.flyTo({ center: [lng, lat], zoom: 14, pitch: 55, duration: 1500 });
      };

      const marker = new window.mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    });
  }, [mapLoaded, estimates]);

  // Inject radar animation CSS
  useEffect(() => {
    if (document.getElementById("map-radar-css")) return;
    const style = document.createElement("style");
    style.id = "map-radar-css";
    style.textContent = `@keyframes mrp{0%{transform:scale(0.3);opacity:0.7}100%{transform:scale(1.1);opacity:0}}
.mapboxgl-ctrl-logo{opacity:0.08!important;transform:scale(0.5)!important;filter:grayscale(1)!important}
.mapboxgl-ctrl-attrib{opacity:0!important;font-size:0!important;pointer-events:none!important}
.mapboxgl-ctrl-bottom-left{opacity:0.08!important}`;
    document.head.appendChild(style);
  }, []);

  const toggleExpand = useCallback(() => setExpanded(e => !e), []);

  // ESC to collapse
  useEffect(() => {
    if (!expanded) return;
    const handler = e => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expanded]);

  const mapContent = (
    <div
      style={{
        position: expanded ? "fixed" : "relative",
        inset: expanded ? 0 : undefined,
        width: expanded ? "100vw" : "100%",
        height: expanded ? "100vh" : "100%",
        zIndex: expanded ? 9999 : 1,
        background: "#0a0c14",
        borderRadius: expanded ? 0 : T?.radius?.lg || 6,
        overflow: "hidden",
      }}
    >
      {/* Map container */}
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
      {!MAPBOX_TOKEN && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Switzer, sans-serif", textAlign: "center", padding: 20 }}>
          Map unavailable — Mapbox token not configured
        </div>
      )}

      {/* Expand/Collapse button */}
      <button
        onClick={toggleExpand}
        style={{
          position: "absolute",
          top: expanded ? 16 : 8,
          right: expanded ? 16 : 8,
          zIndex: 10,
          background: "rgba(10,12,20,0.85)",
          border: `1px solid rgba(255,255,255,0.1)`,
          borderRadius: 3,
          padding: "6px 8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          backdropFilter: "blur(8px)",
        }}
      >
        {expanded ? <CollapseIcon color="#999" /> : <ExpandIcon color="#999" />}
        <span style={{ color: "#999", fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif",
          textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {expanded ? "Collapse" : "Expand"}
        </span>
      </button>

      {/* HUD overlay when expanded */}
      {expanded && (
        <>
          <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10 }}>
            <div style={{ color: C.accent || "#00D4AA", fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif",
              textTransform: "uppercase", letterSpacing: "0.15em" }}>NOVATERRA</div>
            <div style={{ color: "#e0ddd5", fontSize: 20, fontWeight: 600,
              fontFamily: "'Barlow Condensed', sans-serif" }}>Pipeline Map</div>
          </div>
          <div style={{ position: "absolute", top: 16, right: 80, zIndex: 10, textAlign: "right" }}>
            <div style={{ color: "#555", fontSize: 9, fontFamily: "'Barlow Condensed', sans-serif",
              textTransform: "uppercase", letterSpacing: "0.12em" }}>Projects</div>
            <div style={{ color: C.accent || "#00D4AA", fontSize: 24, fontWeight: 700,
              fontFamily: "'Barlow Condensed', sans-serif" }}>{(estimates || []).length}</div>
          </div>
          {/* Legend */}
          <div style={{
            position: "absolute", bottom: 16, left: 16, zIndex: 10,
            background: "rgba(10,12,20,0.9)", padding: "10px 14px", borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(12px)",
          }}>
            <div style={{ color: "#555", fontSize: 9, fontFamily: "'Barlow Condensed', sans-serif",
              textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Status</div>
            {Object.entries(STATUS_COLORS).filter(([k]) => !["Draft","Cancelled","Trash"].includes(k)).map(([k, c]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0", color: "#999", fontSize: 11 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: c, flexShrink: 0 }} />
                {k}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Mini label when NOT expanded — top-left */}
      {!expanded && (
        <div style={{
          position: "absolute", top: 8, left: 10, zIndex: 10,
          color: C.accent || "#00D4AA", fontSize: 9,
          fontFamily: "'Barlow Condensed', sans-serif",
          textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.7,
        }}>
          PIPELINE MAP · {(estimates || []).length} PROJECTS
        </div>
      )}
    </div>
  );

  // No portal — use CSS fixed positioning for expand to avoid destroying the map context
  return mapContent;
}
