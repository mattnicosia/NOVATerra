// modelExport.js — Export 3D model to glTF/GLB format
// Builds a Three.js scene from model elements + material assignments, then exports

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { getMaterial } from "@/utils/materialEngine";

/**
 * Build a Three.js Scene from model elements and material assignments.
 * Pure function — no store access.
 * @param {Array} elements - Model elements from modelStore
 * @param {Object} materialAssignments - { [elementId]: { slug, overrides } }
 * @returns {THREE.Scene}
 */
export function buildExportScene(elements, materialAssignments = {}) {
  const scene = new THREE.Scene();
  scene.name = "NOVATerra Export";

  elements.forEach(el => {
    const mesh = elementToMesh(el, materialAssignments[el.id]);
    if (mesh) {
      mesh.name = el.description || el.id;
      mesh.userData = {
        elementId: el.id,
        type: el.type,
        trade: el.trade,
        cost: el.cost,
        division: el.division,
      };
      // Add material assignment info to userData
      const assignment = materialAssignments[el.id];
      if (assignment?.slug) {
        const mat = getMaterial(assignment.slug);
        if (mat) {
          mesh.userData.materialSlug = assignment.slug;
          mesh.userData.materialName = mat.name;
          mesh.userData.ifcMaterial = mat.ifcMaterial;
          mesh.userData.specSection = mat.specSection;
          mesh.userData.costPerUnit = mat.cost.totalPerUnit;
          mesh.userData.unit = mat.cost.unit;
        }
      }
      scene.add(mesh);
    }
  });

  return scene;
}

/**
 * Convert a single element to a Three.js Mesh with material.
 */
function elementToMesh(el, assignment) {
  const g = el.geometry;
  if (!g) return null;

  let geometry;

  if (g.kind === "extrudedPath" && g.path?.length >= 2) {
    // Wall — extrude profile along path
    const shape = new THREE.Shape();
    const t = g.thickness || 0.5;
    const h = g.height || 10;
    shape.moveTo(-t / 2, 0);
    shape.lineTo(t / 2, 0);
    shape.lineTo(t / 2, h);
    shape.lineTo(-t / 2, h);
    shape.closePath();

    const pts = g.path.map(p => new THREE.Vector3(p.x, 0, p.z));
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0);

    try {
      geometry = new THREE.ExtrudeGeometry(shape, {
        steps: Math.max((g.path.length - 1) * 4, 8),
        bevelEnabled: false,
        extrudePath: curve,
      });
    } catch {
      return null;
    }
  } else if (g.kind === "polygon" && g.points?.length >= 3) {
    // Slab — flat polygon
    const shape = new THREE.Shape();
    shape.moveTo(g.points[0].x, g.points[0].z);
    for (let i = 1; i < g.points.length; i++) {
      shape.lineTo(g.points[i].x, g.points[i].z);
    }
    shape.closePath();
    geometry = new THREE.ExtrudeGeometry(shape, {
      depth: g.thickness || 0.5,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
  } else if (g.kind === "box" && g.position) {
    // Box — placed object
    geometry = new THREE.BoxGeometry(g.width || 3, g.height || 2, g.depth || 3);
  } else {
    return null;
  }

  // Build material from assignment or element defaults
  const matProps = getMaterialProps(el, assignment);
  const material = new THREE.MeshStandardMaterial(matProps);

  const mesh = new THREE.Mesh(geometry, material);

  // Position
  const elev = g.elevation || 0;
  if (g.kind === "box" && g.position) {
    mesh.position.set(g.position.x, elev + (g.height || 2) / 2, g.position.z);
  } else {
    mesh.position.set(0, elev, 0);
  }

  return mesh;
}

/**
 * Get Three.js material properties from material assignment or element defaults.
 */
function getMaterialProps(el, assignment) {
  if (assignment?.slug) {
    const mat = getMaterial(assignment.slug);
    if (mat) {
      return {
        color: mat.visual.color,
        roughness: mat.visual.roughness,
        metalness: mat.visual.metalness || 0,
        transparent: (mat.visual.opacity || 1) < 1,
        opacity: mat.visual.opacity || 1,
        side: THREE.DoubleSide,
        name: mat.ifcMaterial || mat.name,
      };
    }
  }
  // Fallback to element color
  return {
    color: el.color || "#cccccc",
    roughness: 0.7,
    metalness: 0,
    side: THREE.DoubleSide,
  };
}

/**
 * Export model to GLB (binary glTF).
 * @param {Array} elements
 * @param {Object} materialAssignments
 * @param {string} filename - Download filename (default: "model.glb")
 * @returns {Promise<Blob>}
 */
export async function exportToGLB(elements, materialAssignments = {}, filename = "model.glb") {
  const scene = buildExportScene(elements, materialAssignments);
  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (buffer) => {
        const blob = new Blob([buffer], { type: "application/octet-stream" });
        // Trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        resolve(blob);
      },
      (error) => reject(error),
      { binary: true }
    );
  });
}

/**
 * Export model to glTF (JSON format).
 * @param {Array} elements
 * @param {Object} materialAssignments
 * @param {string} filename
 * @returns {Promise<object>}
 */
export async function exportToGLTF(elements, materialAssignments = {}, filename = "model.gltf") {
  const scene = buildExportScene(elements, materialAssignments);
  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (gltf) => {
        const blob = new Blob([JSON.stringify(gltf)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        resolve(gltf);
      },
      (error) => reject(error),
      { binary: false }
    );
  });
}

/**
 * Store wrapper: export current model from store state.
 * @param {"glb"|"gltf"} format
 * @param {string} filename
 */
export async function exportModelFromStore(format = "glb", filename) {
  const { useModelStore } = await import("@/stores/modelStore");
  const { elements, materialAssignments } = useModelStore.getState();

  if (elements.length === 0) throw new Error("No elements to export");

  const defaultName = `novaterra-model.${format}`;
  if (format === "gltf") {
    return exportToGLTF(elements, materialAssignments, filename || defaultName);
  }
  return exportToGLB(elements, materialAssignments, filename || defaultName);
}
