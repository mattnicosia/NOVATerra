// Building Structure Viewer — composed export
// Renders modular cube-based building models driven by project dimensions.
// Assembly animation: cubes scatter → fly to position → idle breathe.

import { useState, useCallback, useMemo } from "react";
import BuildingScene from "./BuildingScene";
import BuildingHUD from "./BuildingHUD";
import DimensionPanel from "./DimensionPanel";
import { computeMetrics } from "@/lib/building-generator";

const DEFAULT_CONFIG = {
  widthFt: 60,
  depthFt: 40,
  numFloors: 4,
  floorHeightFt: 12,
  buildingType: "commercial",
  projectName: "New Project",
};

export default function BuildingStructureViewer({
  initialConfig = DEFAULT_CONFIG,
  onSave,
  showPanel = true,
  interactive = true,
  style = {},
}) {
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG, ...initialConfig });
  const [progress, setProgress] = useState(0);
  const [assembled, setAssembled] = useState(false);

  const metrics = useMemo(() => computeMetrics(config), [config]);

  const handleChange = useCallback((newConfig) => {
    setConfig(newConfig);
    setProgress(0);
    setAssembled(false);
  }, []);

  const handleProgress = useCallback((p) => setProgress(p), []);
  const handleComplete = useCallback(() => setAssembled(true), []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#08080a", ...style }}>
      {/* 3D Scene */}
      <BuildingScene
        config={config}
        onProgress={handleProgress}
        onComplete={handleComplete}
        interactive={interactive}
        style={{ width: "100%", height: "100%" }}
      />

      {/* HUD Overlay */}
      <BuildingHUD
        config={config}
        progress={progress}
        assembled={assembled}
        metrics={metrics}
      />

      {/* Dimension Panel */}
      {showPanel && (
        <DimensionPanel
          config={config}
          onChange={handleChange}
          onSave={onSave}
        />
      )}
    </div>
  );
}

// Re-export scene for standalone use
export { BuildingScene };
