import { useCallback } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useProjectStore } from '@/stores/projectStore';
import { useScanStore } from '@/stores/scanStore';
import Sec from '@/components/shared/Sec';
import Fld from '@/components/shared/Fld';
import Text from '@/components/shared/Text';
import { nInp } from '@/utils/styles';

const ROOM_TYPES = [
  { key: "bathrooms", label: "Bathrooms", icon: "🚻" },
  { key: "kitchens", label: "Kitchens", icon: "🍳" },
  { key: "offices", label: "Offices", icon: "🏢" },
  { key: "conferenceRooms", label: "Conference Rooms", icon: "🗣️" },
  { key: "breakRooms", label: "Break Rooms", icon: "☕" },
  { key: "lobbies", label: "Lobbies / Reception", icon: "🚪" },
  { key: "serverRooms", label: "Server / IT Rooms", icon: "🖥️" },
  { key: "storageRooms", label: "Storage / Utility", icon: "📦" },
  { key: "staircases", label: "Staircases", icon: "🪜" },
  { key: "elevators", label: "Elevators", icon: "🛗" },
  { key: "parkingSpaces", label: "Parking Spaces", icon: "🅿️" },
  { key: "residentialUnits", label: "Residential Units", icon: "🏠" },
];

/**
 * Confidence badge component — shows detection confidence as a colored dot.
 * Green ≥80%, amber ≥60%, red <60%. Only shown for auto-detected values.
 */
function ConfidenceBadge({ confidence, sources }) {
  if (confidence == null || confidence <= 0) return null;

  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';

  // Build tooltip text
  const tooltip = `Confidence: ${pct}%${sources ? `\nSources: ${sources}` : ''}`;

  return (
    <span
      title={tooltip}
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        backgroundColor: color,
        marginLeft: 3,
        flexShrink: 0,
        cursor: 'help',
      }}
    />
  );
}

export default function BuildingParametersSection() {
  const C = useTheme();
  const project = useProjectStore(s => s.project);
  const setProject = useProjectStore(s => s.setProject);
  const addCorrection = useScanStore(s => s.addParameterCorrection);

  const up = (field, value) => setProject({ ...project, [field]: value });

  const updateFloorCount = useCallback((aboveGrade, belowGrade) => {
    const ag = parseInt(aboveGrade) || 0;
    const bg = parseInt(belowGrade) || 0;
    const existingFloors = project.floors || [];

    // Capture correction if auto-detected floor count is being changed
    const oldFloorCount = parseInt(project.floorCount) || 0;
    const newFloorCount = ag;
    if (project.autoDetected?.floorCount && oldFloorCount > 0 && newFloorCount !== oldFloorCount) {
      addCorrection({ field: 'floorCount', detected: oldFloorCount, corrected: newFloorCount });
    }

    const newFloors = [];
    for (let i = bg; i >= 1; i--) {
      const label = bg === 1 ? "Basement" : `Basement ${i}`;
      const existing = existingFloors.find(f => f.label === label);
      newFloors.push({ label, height: existing?.height || 12 });
    }
    for (let i = 1; i <= ag; i++) {
      const label = `Floor ${i}`;
      const existing = existingFloors.find(f => f.label === label);
      newFloors.push({ label, height: existing?.height || (i === 1 ? 14 : 12) });
    }

    setProject({
      ...project,
      floorCount: aboveGrade,
      basementCount: belowGrade,
      floors: newFloors,
      autoDetected: { ...(project.autoDetected || {}), floorCount: false },
    });
  }, [project, setProject, addCorrection]);

  const updateFloorHeight = useCallback((idx, height) => {
    const floors = [...(project.floors || [])];
    if (floors[idx]) {
      floors[idx] = { ...floors[idx], height: parseFloat(height) || 12 };
      setProject({ ...project, floors });
    }
  }, [project, setProject]);

  const updateRoomCount = useCallback((key, value) => {
    const v = parseInt(value);
    const oldVal = parseInt(project.roomCounts?.[key]) || 0;
    const newVal = isNaN(v) ? 0 : v;

    // Capture correction if auto-detected room count is being changed
    if (project.autoDetected?.roomCounts && oldVal > 0 && newVal !== oldVal) {
      addCorrection({ field: `roomCounts.${key}`, detected: oldVal, corrected: newVal });
    }

    setProject({
      ...project,
      roomCounts: { ...project.roomCounts, [key]: isNaN(v) ? "" : v },
    });
  }, [project, setProject, addCorrection]);

  // Get confidence data
  const paramConf = project.parameterConfidence || {};

  // Get evidence sources for tooltips
  const scanResults = useScanStore(s => s.scanResults);
  const evidenceSources = {};
  if (scanResults?.parameterEvidence) {
    for (const e of scanResults.parameterEvidence) {
      if (!e.paramPath.startsWith('_')) {
        if (!evidenceSources[e.paramPath]) evidenceSources[e.paramPath] = new Set();
        evidenceSources[e.paramPath].add(e.source);
      }
    }
  }

  return (
    <Sec title="Terrain">
      <Text variant="caption" dim style={{ marginBottom: 10, display: 'block', lineHeight: 1.5 }}>
        Map the building's physical terrain — floors, heights, and room counts. NOVA uses these parameters to generate accurate ROM estimates and inform takeoff calculations.
      </Text>

      {/* Floor counts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
        <Fld label={<span style={{ display: 'flex', alignItems: 'center' }}>
          Floors (Above Grade)
          {project.autoDetected?.floorCount && <ConfidenceBadge
            confidence={paramConf['floorCount']}
            sources={evidenceSources['floorCount'] ? [...evidenceSources['floorCount']].join(', ') : null}
          />}
        </span>}>
          <input type="number" value={project.floorCount || ""}
            onChange={e => updateFloorCount(e.target.value, project.basementCount || 0)}
            placeholder="e.g. 3" min={0} max={99} style={nInp(C, { fontSize: 13 })} />
        </Fld>
        <Fld label="Basement Levels">
          <input type="number" value={project.basementCount || ""}
            onChange={e => updateFloorCount(project.floorCount || 0, e.target.value)}
            placeholder="e.g. 1" min={0} max={10} style={nInp(C, { fontSize: 13 })} />
        </Fld>
        <Fld label="Footprint SF">
          <input type="number" value={project.buildingFootprintSF || ""}
            onChange={e => up("buildingFootprintSF", e.target.value)}
            placeholder="Per floor" style={nInp(C, { fontSize: 13 })} />
          {project.projectSF && project.floorCount > 0 && !project.buildingFootprintSF && (
            <div style={{ fontSize: 9, color: C.accent, marginTop: 2, cursor: "pointer" }}
              onClick={() => up("buildingFootprintSF", Math.round(parseFloat(project.projectSF) / parseInt(project.floorCount)))}>
              Est. {Math.round(parseFloat(project.projectSF) / parseInt(project.floorCount)).toLocaleString()} SF — click to apply
            </div>
          )}
        </Fld>
      </div>

      {/* Per-floor heights */}
      {(project.floors || []).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text variant="label" dim style={{ marginBottom: 6, display: 'block' }}>Floor Heights (ft)</Text>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {project.floors.map((f, i) => (
              <div key={f.label} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 8px", borderRadius: 6,
                background: C.bg2, border: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: 11, color: C.textMuted, minWidth: 70, fontWeight: 500 }}>{f.label}</span>
                <input type="number" value={f.height || ""}
                  onChange={e => updateFloorHeight(i, e.target.value)}
                  min={6} max={40} step={0.5}
                  style={nInp(C, { width: 52, fontSize: 12, padding: "3px 6px", textAlign: "center" })} />
                <span style={{ fontSize: 9, color: C.textDim }}>ft</span>
              </div>
            ))}
          </div>
          {project.floors.length > 0 && (() => {
            const totalH = project.floors.reduce((s, f) => s + (f.height || 12), 0);
            return (
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
                Total building height: {totalH} ft
              </div>
            );
          })()}
        </div>
      )}

      {/* Room counts */}
      <Text variant="label" dim style={{ marginBottom: 6, display: 'block' }}>Room / Space Counts</Text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ROOM_TYPES.map(rt => {
          const val = project.roomCounts?.[rt.key];
          const hasValue = val !== undefined && val !== "" && val !== 0;
          const confKey = `roomCounts.${rt.key}`;
          const conf = paramConf[confKey];
          const isAutoDetected = project.autoDetected?.roomCounts && hasValue;
          const sources = evidenceSources[confKey] ? [...evidenceSources[confKey]].join(', ') : null;

          return (
            <div key={rt.key} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 8px", borderRadius: 6,
              background: hasValue ? `${C.accent}10` : C.bg2,
              border: `1px solid ${hasValue ? C.accent + "40" : C.border}`,
            }}>
              <span style={{ fontSize: 12 }}>{rt.icon}</span>
              <span style={{ fontSize: 10, color: hasValue ? C.text : C.textMuted, minWidth: 60, display: 'flex', alignItems: 'center' }}>
                {rt.label}
                {isAutoDetected && <ConfidenceBadge confidence={conf} sources={sources} />}
              </span>
              <input type="number" value={val ?? ""}
                onChange={e => updateRoomCount(rt.key, e.target.value)}
                min={0} max={9999} placeholder="—"
                style={nInp(C, { width: 44, fontSize: 11, padding: "2px 4px", textAlign: "center" })} />
            </div>
          );
        })}
      </div>
    </Sec>
  );
}
