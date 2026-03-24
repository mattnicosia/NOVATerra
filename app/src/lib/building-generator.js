// building-generator.js — Pure function: project dimensions → cube array
// No side effects. No React. No Three.js. Just geometry math.

import { MODULE_SIZE_FT } from "./building-types";

let _cubeId = 0;
function uid() { return `cube-${_cubeId++}`; }

function randomScatter() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 12 + Math.random() * 6;
  const height = 12 + Math.random() * 10;
  return [
    Math.cos(angle) * radius,
    height,
    Math.sin(angle) * radius,
  ];
}

/**
 * Generate building cubes from project dimensions.
 * @param {import('./building-types').BuildingConfig} config
 * @returns {import('./building-types').CubeData[]}
 */
export function generateBuildingCubes(config) {
  _cubeId = 0;
  const {
    widthFt = 60,
    depthFt = 40,
    numFloors = 4,
    floorHeightFt = 12,
    buildingType = "commercial",
  } = config;

  const cubes = [];
  const modW = Math.max(2, Math.round(widthFt / MODULE_SIZE_FT));
  const modD = Math.max(2, Math.round(depthFt / MODULE_SIZE_FT));
  const modH = Math.max(1, Math.round(floorHeightFt / MODULE_SIZE_FT));

  const needMidColumns = widthFt > 30 || depthFt > 25;
  const hasPenthouse = buildingType === "commercial" && numFloors > 3;
  const isMixed = buildingType === "mixed-use";

  // ── Foundation — perimeter only (no overlap with floor slabs) ──
  for (let x = 0; x < modW; x++) {
    for (let z = 0; z < modD; z++) {
      const isPerimeter = x === 0 || x === modW - 1 || z === 0 || z === modD - 1;
      if (!isPerimeter) continue;
      cubes.push({
        id: uid(),
        target: [x - modW / 2, -0.5, z - modD / 2],
        start: randomScatter(),
        type: "foundation",
        floor: 0,
        delay: 0 + x * 0.002 + z * 0.002,
      });
    }
  }

  // ── Per floor ──
  for (let floor = 0; floor < numFloors; floor++) {
    const baseY = floor * modH;
    const floorDelay = floor * 0.03;
    const isGround = floor === 0;
    const isRetailFloor = isMixed && isGround;
    let cubeIdx = 0;

    // Floor slab (every 3rd floor + base + top) — interior only, skip perimeter
    if (floor === 0 || floor % 3 === 0 || floor === numFloors - 1) {
      for (let x = 1; x < modW - 1; x++) {
        for (let z = 1; z < modD - 1; z++) {
          cubes.push({
            id: uid(),
            target: [x - modW / 2, baseY, z - modD / 2],
            start: randomScatter(),
            type: "slab",
            floor,
            delay: floorDelay + (cubeIdx++) * 0.0015,
          });
        }
      }
    }

    // Walls + windows + doors per floor height module
    for (let h = 0; h < modH; h++) {
      const y = baseY + h + 0.5;

      // Front wall (z = 0)
      for (let x = 0; x < modW; x++) {
        const type = getCubeType(x, h, modW, modH, isGround, isRetailFloor, buildingType, "front");
        cubes.push({
          id: uid(),
          target: [x - modW / 2, y, -modD / 2],
          start: randomScatter(),
          type,
          floor,
          delay: floorDelay + (cubeIdx++) * 0.0015,
        });
      }

      // Back wall (z = modD - 1)
      for (let x = 0; x < modW; x++) {
        const type = getCubeType(x, h, modW, modH, isGround, false, buildingType, "back");
        cubes.push({
          id: uid(),
          target: [x - modW / 2, y, modD / 2 - 1],
          start: randomScatter(),
          type,
          floor,
          delay: floorDelay + (cubeIdx++) * 0.0015,
        });
      }

      // Left wall (x = 0)
      for (let z = 1; z < modD - 1; z++) {
        cubes.push({
          id: uid(),
          target: [-modW / 2, y, z - modD / 2],
          start: randomScatter(),
          type: "wall",
          floor,
          delay: floorDelay + (cubeIdx++) * 0.0015,
        });
      }

      // Right wall (x = modW - 1)
      for (let z = 1; z < modD - 1; z++) {
        cubes.push({
          id: uid(),
          target: [modW / 2 - 1, y, z - modD / 2],
          start: randomScatter(),
          type: "wall",
          floor,
          delay: floorDelay + (cubeIdx++) * 0.0015,
        });
      }
    }

    // Columns — interior only (corners already have wall cubes)
    if (needMidColumns) {
      const midX = Math.floor(modW / 2) - modW / 2;
      const midZ = Math.floor(modD / 2) - modD / 2;
      // Only interior mid-span columns (not at perimeter where walls exist)
      const interiorColumns = [
        [midX, midZ], // center column
      ];

      for (const [cx, cz] of interiorColumns) {
        for (let h = 0; h < modH; h++) {
          cubes.push({
            id: uid(),
            target: [cx, baseY + h + 0.5, cz],
            start: randomScatter(),
            type: "column",
            floor,
            delay: floorDelay + (cubeIdx++) * 0.0015,
          });
        }
      }
    }
  }

  // ── Roof parapet ──
  const roofY = numFloors * modH + 0.5;
  let roofIdx = 0;
  for (let x = 0; x < modW; x++) {
    cubes.push({ id: uid(), target: [x - modW / 2, roofY, -modD / 2], start: randomScatter(), type: "roof", floor: numFloors, delay: numFloors * 0.03 + (roofIdx++) * 0.002 });
    cubes.push({ id: uid(), target: [x - modW / 2, roofY, modD / 2 - 1], start: randomScatter(), type: "roof", floor: numFloors, delay: numFloors * 0.03 + (roofIdx++) * 0.002 });
  }
  for (let z = 1; z < modD - 1; z++) {
    cubes.push({ id: uid(), target: [-modW / 2, roofY, z - modD / 2], start: randomScatter(), type: "roof", floor: numFloors, delay: numFloors * 0.03 + (roofIdx++) * 0.002 });
    cubes.push({ id: uid(), target: [modW / 2 - 1, roofY, z - modD / 2], start: randomScatter(), type: "roof", floor: numFloors, delay: numFloors * 0.03 + (roofIdx++) * 0.002 });
  }

  // ── Mechanical penthouse (commercial > 3 floors) ──
  if (hasPenthouse) {
    const phW = Math.max(2, Math.floor(modW * 0.4));
    const phD = Math.max(2, Math.floor(modD * 0.4));
    const phStartX = Math.floor((modW - phW) / 2) - modW / 2;
    const phStartZ = Math.floor((modD - phD) / 2) - modD / 2;

    for (let x = 0; x < phW; x++) {
      for (let z = 0; z < phD; z++) {
        const isEdge = x === 0 || x === phW - 1 || z === 0 || z === phD - 1;
        if (isEdge) {
          cubes.push({
            id: uid(),
            target: [phStartX + x, roofY + 0.5, phStartZ + z],
            start: randomScatter(),
            type: "mechanical",
            floor: numFloors + 1,
            delay: (numFloors + 1) * 0.03 + (x * phD + z) * 0.002,
          });
        }
      }
    }
  }

  return cubes;
}

/**
 * Determine cube type based on position within the facade.
 */
function getCubeType(x, h, modW, modH, isGround, isRetailFloor, buildingType, face) {
  const midX = Math.floor(modW / 2);

  // Ground floor entry
  if (isGround && face === "front" && h < 2) {
    // Commercial: 3-wide lobby
    if (buildingType === "commercial" && x >= midX - 1 && x <= midX + 1) return "door";
    // Residential: single entry
    if (buildingType === "residential" && x === midX) return "door";
    // Mixed-use: retail bays
    if (isRetailFloor) return "retail";
  }

  // Windows: every other cube horizontally, in the middle height rows
  if (h > 0 && h < modH - 1 && x > 0 && x < modW - 1) {
    // Residential: staggered pattern
    if (buildingType === "residential" && x % 3 === 1) return "window";
    // Commercial: regular pattern
    if (buildingType === "commercial" && x % 2 === 1) return "window";
    // Mixed-use above ground: residential pattern
    if (buildingType === "mixed-use" && !isRetailFloor && x % 3 === 1) return "window";
  }

  return "wall";
}

/**
 * Compute metrics from building config.
 */
export function computeMetrics(config) {
  const { widthFt = 60, depthFt = 40, numFloors = 4, floorHeightFt = 12 } = config;
  const totalSF = widthFt * depthFt * numFloors;
  const buildingHeight = numFloors * floorHeightFt;
  const volume = widthFt * depthFt * buildingHeight;
  const volumeCY = Math.round(volume / 27);
  const cubes = generateBuildingCubes(config);

  return {
    totalSF,
    buildingHeight,
    volumeCY,
    moduleCount: cubes.length,
    footprintSF: widthFt * depthFt,
  };
}
