// ifcLoader.js — Client-side IFC file parsing via web-ifc WASM
// Extracts building elements with geometry, materials, properties, quantities,
// and storey assignments for the interactive 3D viewer + spec editing.

import * as WebIFC from "web-ifc";
import { getTradeColor } from "./geometryBuilder";

// IFC type → trade mapping
const IFC_TYPE_TO_TRADE = {
  [WebIFC.IFCWALL]: "framing",
  [WebIFC.IFCWALLSTANDARDCASE]: "framing",
  [WebIFC.IFCSLAB]: "concrete",
  [WebIFC.IFCDOOR]: "doors",
  [WebIFC.IFCWINDOW]: "windows",
  [WebIFC.IFCCOLUMN]: "steel",
  [WebIFC.IFCBEAM]: "steel",
  [WebIFC.IFCROOF]: "roofing",
  [WebIFC.IFCSTAIR]: "concrete",
  [WebIFC.IFCSTAIRFLIGHT]: "concrete",
  [WebIFC.IFCRAILING]: "finishCarp",
  [WebIFC.IFCCURTAINWALL]: "windows",
  [WebIFC.IFCPLATE]: "steel",
  [WebIFC.IFCMEMBER]: "steel",
  [WebIFC.IFCFOOTING]: "concrete",
  [WebIFC.IFCPILE]: "concrete",
};

const IFC_TYPE_NAMES = {
  [WebIFC.IFCWALL]: "Wall",
  [WebIFC.IFCWALLSTANDARDCASE]: "Wall",
  [WebIFC.IFCSLAB]: "Slab",
  [WebIFC.IFCDOOR]: "Door",
  [WebIFC.IFCWINDOW]: "Window",
  [WebIFC.IFCCOLUMN]: "Column",
  [WebIFC.IFCBEAM]: "Beam",
  [WebIFC.IFCROOF]: "Roof",
  [WebIFC.IFCSTAIR]: "Stair",
  [WebIFC.IFCSTAIRFLIGHT]: "Stair Flight",
  [WebIFC.IFCRAILING]: "Railing",
  [WebIFC.IFCCURTAINWALL]: "Curtain Wall",
  [WebIFC.IFCPLATE]: "Plate",
  [WebIFC.IFCMEMBER]: "Member",
  [WebIFC.IFCFOOTING]: "Footing",
  [WebIFC.IFCPILE]: "Pile",
};

// Element types we extract (ordered by importance)
const EXTRACT_TYPES = [
  WebIFC.IFCWALL,
  WebIFC.IFCWALLSTANDARDCASE,
  WebIFC.IFCSLAB,
  WebIFC.IFCDOOR,
  WebIFC.IFCWINDOW,
  WebIFC.IFCCOLUMN,
  WebIFC.IFCBEAM,
  WebIFC.IFCROOF,
  WebIFC.IFCSTAIR,
  WebIFC.IFCSTAIRFLIGHT,
  WebIFC.IFCRAILING,
  WebIFC.IFCCURTAINWALL,
  WebIFC.IFCPLATE,
  WebIFC.IFCMEMBER,
  WebIFC.IFCFOOTING,
  WebIFC.IFCPILE,
];

// ── Relationship extraction helpers ─────────────────────────────────

/** Build element expressID → storey assignment map */
function buildStoreyMap(ifcApi, modelID) {
  const map = {};
  try {
    const relIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < relIds.size(); i++) {
      try {
        const rel = ifcApi.GetLine(modelID, relIds.get(i));
        const structRef = rel.RelatingStructure;
        if (!structRef?.value) continue;

        let storeyName = "",
          elevation = 0,
          storeyId = "";
        try {
          const s = ifcApi.GetLine(modelID, structRef.value);
          storeyName = s.Name?.value || "";
          elevation = s.Elevation?.value || 0;
          storeyId = s.GlobalId?.value || `storey-${structRef.value}`;
        } catch {
          /* storey line parse failed — skip */
        }

        const related = rel.RelatedElements;
        if (!Array.isArray(related)) continue;
        for (const r of related) {
          if (r?.value) {
            map[r.value] = { storeyName, elevation, storeyId };
          }
        }
      } catch {
        /* rel parse failed — skip */
      }
    }
  } catch (e) {
    console.warn("Storey map extraction failed:", e);
  }
  return map;
}

/** Build element expressID → material info map */
function buildMaterialMap(ifcApi, modelID) {
  const map = {};
  try {
    const relIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
    for (let i = 0; i < relIds.size(); i++) {
      try {
        const rel = ifcApi.GetLine(modelID, relIds.get(i));
        const matRef = rel.RelatingMaterial;
        if (!matRef?.value) continue;

        let materialName = "";
        const layers = [];

        try {
          const mat = ifcApi.GetLine(modelID, matRef.value);
          if (mat.Name?.value) materialName = mat.Name.value;

          // Direct material layers (IFCMATERIALLAYERSET)
          const extractLayers = layerRefs => {
            if (!Array.isArray(layerRefs)) return;
            for (const lr of layerRefs) {
              if (!lr?.value) continue;
              try {
                const layer = ifcApi.GetLine(modelID, lr.value);
                const thickness = layer.LayerThickness?.value || 0;
                let layerName = "";
                if (layer.Material?.value) {
                  try {
                    const lm = ifcApi.GetLine(modelID, layer.Material.value);
                    layerName = lm.Name?.value || "";
                  } catch {
                    /* layer material name lookup failed */
                  }
                }
                layers.push({ name: layerName, thickness: Math.round(thickness * 1000) / 1000 });
              } catch {
                /* layer parse failed */
              }
            }
          };

          if (mat.MaterialLayers) extractLayers(mat.MaterialLayers);

          // Layer set usage (wraps a layer set)
          if (mat.ForLayerSet?.value) {
            try {
              const ls = ifcApi.GetLine(modelID, mat.ForLayerSet.value);
              if (ls.MaterialLayers) extractLayers(ls.MaterialLayers);
              materialName = materialName || ls.LayerSetName?.value || "";
            } catch {
              /* layer set parse failed */
            }
          }
        } catch {
          /* material line parse failed */
        }

        const related = rel.RelatedObjects;
        if (!Array.isArray(related)) continue;
        for (const r of related) {
          if (r?.value) map[r.value] = { name: materialName, layers };
        }
      } catch {
        /* material rel parse failed */
      }
    }
  } catch (e) {
    console.warn("Material map extraction failed:", e);
  }
  return map;
}

/** Build element expressID → property sets + quantities map */
function buildPropertyMap(ifcApi, modelID) {
  const map = {};
  try {
    const relIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < relIds.size(); i++) {
      try {
        const rel = ifcApi.GetLine(modelID, relIds.get(i));
        const psetRef = rel.RelatingPropertyDefinition;
        if (!psetRef?.value) continue;

        let psetName = "";
        const props = {};

        try {
          const pset = ifcApi.GetLine(modelID, psetRef.value);
          psetName = pset.Name?.value || "";

          // Property sets (IFCPROPERTYSET)
          if (Array.isArray(pset.HasProperties)) {
            for (const pr of pset.HasProperties) {
              if (!pr?.value) continue;
              try {
                const prop = ifcApi.GetLine(modelID, pr.value);
                const pname = prop.Name?.value;
                const pval = prop.NominalValue?.value;
                if (pname && pval !== undefined) props[pname] = pval;
              } catch {
                /* property parse failed */
              }
            }
          }

          // Element quantities (IFCELEMENTQUANTITY)
          if (Array.isArray(pset.Quantities)) {
            for (const qr of pset.Quantities) {
              if (!qr?.value) continue;
              try {
                const q = ifcApi.GetLine(modelID, qr.value);
                const qname = q.Name?.value;
                const qval =
                  q.AreaValue?.value ??
                  q.VolumeValue?.value ??
                  q.LengthValue?.value ??
                  q.CountValue?.value ??
                  q.WeightValue?.value;
                if (qname && qval !== undefined) props[qname] = Math.round(qval * 1000) / 1000;
              } catch {
                /* quantity parse failed */
              }
            }
          }
        } catch {
          /* pset parse failed */
        }

        const related = rel.RelatedObjects;
        if (!Array.isArray(related)) continue;
        for (const r of related) {
          if (r?.value) {
            if (!map[r.value]) map[r.value] = {};
            if (psetName) {
              map[r.value][psetName] = { ...(map[r.value][psetName] || {}), ...props };
            } else {
              Object.assign(map[r.value], props);
            }
          }
        }
      } catch {
        /* property rel parse failed */
      }
    }
  } catch (e) {
    console.warn("Property map extraction failed:", e);
  }
  return map;
}

/**
 * Parse an IFC file and extract building elements with geometry,
 * materials, properties, quantities, and storey assignments.
 * @param {ArrayBuffer} data - Raw IFC file contents
 * @returns {Promise<{ elements: Array, storeys: Array }>}
 */
export async function parseIFCFile(data) {
  const ifcApi = new WebIFC.IfcAPI();

  // Set WASM path — web-ifc ships WASM in its package
  ifcApi.SetWasmPath("https://unpkg.com/web-ifc@0.0.75/");

  await ifcApi.Init();
  const modelID = ifcApi.OpenModel(new Uint8Array(data));

  // Build relationship maps (storey, material, properties)
  const storeyMap = buildStoreyMap(ifcApi, modelID);
  const materialMap = buildMaterialMap(ifcApi, modelID);
  const propertyMap = buildPropertyMap(ifcApi, modelID);

  const elements = [];
  let _elementIndex = 0;

  for (const ifcType of EXTRACT_TYPES) {
    const ids = ifcApi.GetLineIDsWithType(modelID, ifcType);

    for (let i = 0; i < ids.size(); i++) {
      const expressID = ids.get(i);

      try {
        // Get element properties
        const props = ifcApi.GetLine(modelID, expressID);
        const name = props.Name?.value || props.Description?.value || IFC_TYPE_NAMES[ifcType] || "Element";
        const globalId = props.GlobalId?.value || `ifc-${expressID}`;

        // Get flat mesh geometry
        const flatMesh = ifcApi.GetFlatMesh(modelID, expressID);
        if (!flatMesh || flatMesh.geometries.size() === 0) continue;

        // Extract first geometry's vertex data
        const geom = flatMesh.geometries.get(0);
        const placedGeometry = ifcApi.GetGeometry(modelID, geom.geometryExpressID);
        const verts = ifcApi.GetVertexArray(placedGeometry.GetVertexData(), placedGeometry.GetVertexDataSize());
        const indices = ifcApi.GetIndexArray(placedGeometry.GetIndexData(), placedGeometry.GetIndexDataSize());

        if (!verts || verts.length === 0) continue;

        // Transform matrix
        const matrix = geom.flatTransformation;

        const trade = IFC_TYPE_TO_TRADE[ifcType] || "unassigned";
        const storey = storeyMap[expressID] || {};
        const material = materialMap[expressID] || {};
        const ifcProperties = propertyMap[expressID] || {};

        elements.push({
          id: `ifc-${expressID}`,
          type: IFC_TYPE_NAMES[ifcType]?.toLowerCase() || "element",
          ifcType,
          expressID,
          globalId,
          name,
          trade,
          division: "",
          description: `${IFC_TYPE_NAMES[ifcType] || "Element"}: ${name}`,
          cost: 0,
          linkedItemId: null,
          color: getTradeColor(trade),
          level: storey.storeyName || "",
          levelElevation: storey.elevation || 0,
          storeyId: storey.storeyId || "",
          material: material.name || "",
          materialLayers: material.layers || [],
          ifcProperties,
          geometry: {
            kind: "ifcMesh",
            vertices: Array.from(verts),
            indices: Array.from(indices),
            matrix: Array.from(matrix),
          },
        });

        _elementIndex++;
      } catch (e) {
        // Skip elements that fail to parse
        console.warn(`IFC parse skip expressID ${expressID}:`, e.message);
      }
    }
  }

  // Extract building storeys
  const storeys = [];
  try {
    const storeyIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);
    for (let i = 0; i < storeyIds.size(); i++) {
      const props = ifcApi.GetLine(modelID, storeyIds.get(i));
      storeys.push({
        id: props.GlobalId?.value || `storey-${i}`,
        name: props.Name?.value || `Level ${i}`,
        elevation: props.Elevation?.value || i * 12,
      });
    }
    storeys.sort((a, b) => a.elevation - b.elevation);
  } catch (e) {
    console.warn("Failed to extract storeys:", e);
  }

  ifcApi.CloseModel(modelID);

  return { elements, storeys };
}
