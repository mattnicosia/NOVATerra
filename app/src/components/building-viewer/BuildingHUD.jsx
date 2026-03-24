// BuildingHUD.jsx — Overlay UI: progress bar, project stats, corner accents

const HUD_STYLE = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
  color: "#e8e0d4",
  zIndex: 10,
};

const LABEL_STYLE = {
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#777",
  marginBottom: 2,
};

const VALUE_STYLE = {
  fontSize: 22,
  fontWeight: 600,
  color: "#e8e0d4",
  letterSpacing: "-0.02em",
};

export default function BuildingHUD({ config, progress, assembled, metrics }) {
  const { projectName, widthFt, depthFt, numFloors, floorHeightFt, buildingType } = config;

  return (
    <div style={HUD_STYLE}>
      {/* Top-left: Project name */}
      <div style={{ position: "absolute", top: 24, left: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#e85c30", marginBottom: 4 }}>
          NOVATERRA
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#e8e0d4" }}>
          {projectName || "New Project"}
        </div>
      </div>

      {/* Top-right: Total SF */}
      <div style={{ position: "absolute", top: 24, right: 24, textAlign: "right" }}>
        <div style={LABEL_STYLE}>Total SF</div>
        <div style={VALUE_STYLE}>
          {(metrics?.totalSF || 0).toLocaleString()}
        </div>
      </div>

      {/* Bottom-left: Metrics */}
      <div style={{ position: "absolute", bottom: 60, left: 24, display: "flex", gap: 32 }}>
        <div>
          <div style={LABEL_STYLE}>Width</div>
          <div style={{ ...VALUE_STYLE, fontSize: 16 }}>{widthFt}′</div>
        </div>
        <div>
          <div style={LABEL_STYLE}>Depth</div>
          <div style={{ ...VALUE_STYLE, fontSize: 16 }}>{depthFt}′</div>
        </div>
        <div>
          <div style={LABEL_STYLE}>Floors</div>
          <div style={{ ...VALUE_STYLE, fontSize: 16 }}>{numFloors}</div>
        </div>
        <div>
          <div style={LABEL_STYLE}>Height</div>
          <div style={{ ...VALUE_STYLE, fontSize: 16 }}>{numFloors * floorHeightFt}′</div>
        </div>
        <div>
          <div style={LABEL_STYLE}>Type</div>
          <div style={{ ...VALUE_STYLE, fontSize: 16, textTransform: "capitalize" }}>{buildingType}</div>
        </div>
        <div>
          <div style={LABEL_STYLE}>Modules</div>
          <div style={{ ...VALUE_STYLE, fontSize: 16 }}>{metrics?.moduleCount || "—"}</div>
        </div>
      </div>

      {/* Bottom: Progress bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 36, display: "flex", alignItems: "center", padding: "0 24px", background: "rgba(8,8,10,0.8)" }}>
        <div style={{ ...LABEL_STYLE, marginBottom: 0, marginRight: 16, minWidth: 100 }}>
          {assembled ? "ASSEMBLED" : "CONSTRUCTING"}
        </div>
        <div style={{ flex: 1, height: 2, background: "#1a1a1a", borderRadius: 1, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: assembled ? "#00D4AA" : "#e85c30",
            transition: "width 0.1s linear, background 0.5s ease",
          }} />
        </div>
        <div style={{ ...LABEL_STYLE, marginBottom: 0, marginLeft: 16, minWidth: 40, textAlign: "right" }}>
          {progress}%
        </div>
      </div>

      {/* Corner accent marks (2D overlay) */}
      {[
        { top: 0, left: 0 },
        { top: 0, right: 0 },
        { bottom: 36, left: 0 },
        { bottom: 36, right: 0 },
      ].map((pos, i) => (
        <div key={i} style={{ position: "absolute", ...pos, width: 24, height: 24 }}>
          <div style={{
            position: "absolute",
            [pos.top !== undefined ? "top" : "bottom"]: 0,
            [pos.left !== undefined ? "left" : "right"]: 0,
            width: 20, height: 1, background: "#e85c30", opacity: 0.5,
          }} />
          <div style={{
            position: "absolute",
            [pos.top !== undefined ? "top" : "bottom"]: 0,
            [pos.left !== undefined ? "left" : "right"]: 0,
            width: 1, height: 20, background: "#e85c30", opacity: 0.5,
          }} />
        </div>
      ))}
    </div>
  );
}
