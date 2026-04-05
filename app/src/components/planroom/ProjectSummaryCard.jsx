// ProjectSummaryCard — Project metadata, narrative, geography, and stat pills
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { card } from "@/utils/styles";
import { getBuildingTypeLabel, getWorkTypeLabel } from "@/constants/constructionTypes";
import FactorBar from "@/components/planroom/FactorBar";

function StatPill({ label, value, unit, C, T, accent }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div
        style={{
          fontSize: 9,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontSize: T.fontSize.lg,
            fontWeight: T.fontWeight.bold,
            color: accent ? C.purple || C.accent : C.text,
            fontFamily: "'Switzer', sans-serif",
          }}
        >
          {value}
        </span>
        {unit && <span style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>{unit}</span>}
      </div>
    </div>
  );
}

function MetaField({ label, value, detected, C, T }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
        <span
          style={{
            fontSize: 9,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        {detected && (
          <span
            style={{
              fontSize: 7,
              fontWeight: 700,
              color: C.green,
              background: `${C.green}15`,
              padding: "1px 4px",
              borderRadius: 3,
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            AI
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: T.fontSize.xs,
          color: C.text,
          fontWeight: T.fontWeight.medium,
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function buildProjectNarrative(project, drawings, specs, activeLoc) {
  const parts = [];
  const name = project.name && project.name !== "New Estimate" ? project.name : null;
  const btLabel = getBuildingTypeLabel(project.buildingType);
  const wtLabel = getWorkTypeLabel(project.workType);
  const sf = project.projectSF ? parseFloat(project.projectSF) : null;
  const fc = parseInt(project.floorCount) || 0;
  const bc = parseInt(project.basementCount) || 0;
  const fp = project.buildingFootprintSF ? parseFloat(project.buildingFootprintSF) : null;
  const rooms = project.roomCounts || {};
  const address = project.address;

  let s1 = name || "This project";
  const descriptors = [];
  if (fc > 0) descriptors.push(`${fc}-story`);
  if (btLabel !== "Unclassified") descriptors.push(btLabel.toLowerCase());
  if (wtLabel) descriptors.push(wtLabel.toLowerCase());
  if (descriptors.length > 0) s1 += ` is a ${descriptors.join(" ")}`;
  if (activeLoc && activeLoc.label && activeLoc.source !== "none") {
    s1 += descriptors.length > 0 ? ` located in the ${activeLoc.label} area` : ` is located in the ${activeLoc.label} area`;
  } else if (address) {
    const cityMatch = address.match(/,\s*([^,]+),?\s*[A-Z]{2}/);
    if (cityMatch) s1 += descriptors.length > 0 ? ` located in ${cityMatch[1].trim()}` : ` is located in ${cityMatch[1].trim()}`;
  }
  s1 += ".";
  parts.push(s1);

  const sizeParts = [];
  if (sf) sizeParts.push(`approximately ${Math.round(sf).toLocaleString()} SF`);
  if (fp) sizeParts.push(`a ${Math.round(fp).toLocaleString()} SF per-floor footprint`);
  if (bc > 0) sizeParts.push(`${bc} basement level${bc > 1 ? "s" : ""}`);
  if (sizeParts.length > 0) parts.push("The building encompasses " + sizeParts.join(" across ") + ".");

  const feats = [];
  const roomLabels = {
    bathrooms: "bathroom", kitchens: "kitchen", bedrooms: "bedroom", offices: "office",
    conferenceRooms: "conference room", breakRooms: "break room", lobbies: "lobby",
    staircases: "staircase", elevators: "elevator", storageRooms: "storage room",
    parkingSpaces: "parking space", residentialUnits: "residential unit",
  };
  Object.entries(roomLabels).forEach(([key, singular]) => {
    const v = parseInt(rooms[key]);
    if (v > 0) feats.push(v === 1 ? `a ${singular}` : `${v} ${singular}s`);
  });
  if (feats.length > 0) {
    const last = feats.pop();
    parts.push("The interior includes " + (feats.length > 0 ? feats.join(", ") + ", and " + last : last) + ".");
  }

  if (drawings.length > 0 || specs.length > 0) {
    const docParts = [];
    if (drawings.length > 0) docParts.push(`${drawings.length} drawing${drawings.length > 1 ? "s" : ""}`);
    if (specs.length > 0) docParts.push(`${specs.length} specification section${specs.length > 1 ? "s" : ""}`);
    parts.push("NOVA has analyzed " + docParts.join(" and ") + " for this project.");
  }

  return parts.join(" ");
}

export default function ProjectSummaryCard({
  C,
  T,
  project,
  drawings,
  specs,
  items,
  documents,
  activeLoc,
  autoDetected,
  floors,
  costColor,
  costLevel,
  composite,
}) {
  const allocatedSpecs = specs.filter(sp => items.some(i => i.specSection === sp.section));
  const labeledCount = drawings.filter(d => d.sheetNumber).length;

  return (
    <div style={{ ...card(C), padding: T.space[5], gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginBottom: T.space[3] }}>
        <Ic d={I.settings} size={16} color={C.accent} />
        <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>Project Summary</span>
        {Object.keys(autoDetected).length > 0 && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: C.green,
              background: `${C.green}12`,
              padding: "2px 8px",
              borderRadius: T.radius.full,
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Ic d={I.ai} size={8} color={C.green} /> {Object.keys(autoDetected).length} auto-detected
          </span>
        )}
      </div>

      {/* Auto-detected project info */}
      {(project.name && project.name !== "New Estimate") ||
      project.architect ||
      project.client ||
      project.address ||
      project.projectNumber ||
      project.engineer ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: `${T.space[2]}px ${T.space[4]}px`,
            marginBottom: T.space[3],
            padding: `${T.space[3]}px`,
            background: `${C.accent}04`,
            borderRadius: T.radius.sm,
            border: `1px solid ${C.border}08`,
          }}
        >
          {project.name && project.name !== "New Estimate" && (
            <MetaField label="Project" value={project.name} detected={autoDetected.name} C={C} T={T} />
          )}
          {project.architect && (
            <MetaField label="Architect" value={project.architect} detected={autoDetected.architect} C={C} T={T} />
          )}
          {project.client && (
            <MetaField label="Client" value={project.client} detected={autoDetected.client} C={C} T={T} />
          )}
          {project.engineer && (
            <MetaField label="Engineer" value={project.engineer} detected={autoDetected.engineer} C={C} T={T} />
          )}
          {project.address && (
            <MetaField label="Address" value={project.address} detected={autoDetected.address} C={C} T={T} />
          )}
          {project.projectNumber && (
            <MetaField label="Project #" value={project.projectNumber} detected={autoDetected.projectNumber} C={C} T={T} />
          )}
        </div>
      ) : null}

      {/* Project narrative */}
      {(() => {
        const narrative = buildProjectNarrative(project, drawings, specs, activeLoc);
        return narrative.length > 20 ? (
          <div
            style={{
              fontSize: T.fontSize.sm,
              color: C.textMuted,
              lineHeight: 1.7,
              marginBottom: T.space[3],
              padding: `${T.space[3]}px ${T.space[4]}px`,
              background: `${C.accent}03`,
              borderRadius: T.radius.sm,
              borderLeft: `3px solid ${C.accent}30`,
            }}
          >
            {narrative}
          </div>
        ) : null;
      })()}

      {/* Stats + Geography */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: activeLoc && activeLoc.source !== "none" ? "1fr 1fr" : "1fr",
          gap: T.space[4],
        }}
      >
        {/* Left: stat pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: T.space[4], alignContent: "start" }}>
          {project.projectSF && (
            <StatPill label="Total SF" value={parseFloat(project.projectSF).toLocaleString()} unit="SF" C={C} T={T} />
          )}
          {project.floorCount > 0 && (
            <StatPill label="Floors" value={project.floorCount} unit={project.basementCount > 0 ? `+ ${project.basementCount} below` : "above grade"} C={C} T={T} />
          )}
          {project.buildingFootprintSF && (
            <StatPill label="Footprint" value={parseFloat(project.buildingFootprintSF).toLocaleString()} unit="SF/floor" C={C} T={T} />
          )}
          {project.buildingType && <StatPill label="Building Type" value={getBuildingTypeLabel(project.buildingType)} C={C} T={T} />}
          {project.workType && <StatPill label="Work Type" value={getWorkTypeLabel(project.workType)} C={C} T={T} />}
          {floors.length > 0 && (
            <StatPill label="Building Height" value={floors.reduce((s, f) => s + (f.height || 12), 0)} unit="ft" C={C} T={T} />
          )}
          {drawings.length > 0 && <StatPill label="Drawings" value={drawings.length} unit={`${labeledCount} labeled`} C={C} T={T} />}
          {specs.length > 0 && (
            <StatPill label="Spec Sections" value={specs.length} unit={`${allocatedSpecs.length} allocated`} C={C} T={T} />
          )}
          {documents.length > 0 && <StatPill label="Documents" value={documents.length} unit="files" C={C} T={T} />}
        </div>

        {/* Right: Geography / Cost Index */}
        {activeLoc && activeLoc.source !== "none" && (
          <div
            style={{
              padding: `${T.space[3]}px`,
              background: `${C.text}03`,
              borderRadius: T.radius.sm,
              border: `1px solid ${C.border}08`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: T.space[3] }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${costColor}25, ${costColor}08)`,
                  border: `2px solid ${costColor}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, color: costColor, fontFamily: T.font.sans }}>
                  {composite}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{activeLoc.label}</div>
                <div style={{ fontSize: 9, color: costColor, fontWeight: 600 }}>
                  {costLevel} Cost Market{activeLoc.source === "state" && " (state avg)"}
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: T.space[2],
              }}
            >
              Cost Index vs National Avg
            </div>
            <FactorBar label="Material" value={activeLoc.mat} color={C.blue} C={C} />
            <FactorBar label="Labor" value={activeLoc.lab} color={C.orange} C={C} />
            <FactorBar label="Equipment" value={activeLoc.equip} color={C.green} C={C} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 8, color: C.textDim }}>
              <span>0.60x</span>
              <span style={{ fontWeight: 600 }}>1.00x avg</span>
              <span>1.40x</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
