// pascalSpaceDetection.js — Adapted from Pascal Editor (MIT License)
// https://github.com/pascalorg/editor
//
// Detects enclosed rooms from wall segments using flood-fill grid algorithm.
// Input: wall segments as [{id, start:[x,z], end:[x,z], thickness}] in feet-space
// Output: room polygons + wall side classifications (interior/exterior)

// ── Types ──
// Space = { id, levelId, polygon: [[x,z]...], wallIds: [], isExterior: false }
// WallSideUpdate = { wallId, frontSide: 'interior'|'exterior'|'unknown', backSide: same }

const TOLERANCE = 0.01; // ~1/8 inch in feet

// ── Main export ──
export function detectSpacesForLevel(levelId, walls, gridResolution = 0.5) {
  if (!walls || walls.length === 0) return { wallUpdates: [], spaces: [] };

  const grid = buildGrid(walls, gridResolution);
  floodFillFromEdges(grid);
  const spaces = findInteriorSpaces(grid, levelId);
  const wallUpdates = assignWallSides(walls, grid);

  return { wallUpdates, spaces };
}

// ── Grid building ──
function buildGrid(walls, resolution) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;

  for (const wall of walls) {
    minX = Math.min(minX, wall.start[0], wall.end[0]);
    minZ = Math.min(minZ, wall.start[1], wall.end[1]);
    maxX = Math.max(maxX, wall.start[0], wall.end[0]);
    maxZ = Math.max(maxZ, wall.start[1], wall.end[1]);
  }

  // Padding around bounds (2 feet)
  const padding = 2;
  minX -= padding; minZ -= padding; maxX += padding; maxZ += padding;

  const width = Math.ceil((maxX - minX) / resolution);
  const height = Math.ceil((maxZ - minZ) / resolution);

  const grid = { cells: new Map(), resolution, minX, minZ, maxX, maxZ, width, height };

  for (const wall of walls) markWallCells(grid, wall);

  return grid;
}

function markWallCells(grid, wall) {
  const thickness = wall.thickness ?? 0.5; // default 6" wall in feet
  const [x1, z1] = wall.start;
  const [x2, z2] = wall.end;

  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return;

  const dirX = dx / len, dirZ = dz / len;
  const perpX = -dirZ, perpZ = dirX;

  // Dense sampling along wall length
  const steps = Math.max(Math.ceil(len / (grid.resolution * 0.5)), 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t;
    const z = z1 + dz * t;

    // Dense sampling across thickness
    const thickSteps = Math.max(Math.ceil(thickness / (grid.resolution * 0.5)), 2);
    for (let j = 0; j <= thickSteps; j++) {
      const offset = (j / thickSteps - 0.5) * thickness;
      const wx = x + perpX * offset;
      const wz = z + perpZ * offset;

      const key = getCellKey(grid, wx, wz);
      if (key) grid.cells.set(key, "wall");
    }
  }
}

// ── Flood fill exterior ──
function floodFillFromEdges(grid) {
  const queue = [];

  for (let x = 0; x < grid.width; x++) {
    for (let z = 0; z < grid.height; z++) {
      if (x === 0 || x === grid.width - 1 || z === 0 || z === grid.height - 1) {
        const key = `${x},${z}`;
        if (grid.cells.get(key) !== "wall") {
          grid.cells.set(key, "exterior");
          queue.push(key);
        }
      }
    }
  }

  while (queue.length > 0) {
    const key = queue.shift();
    const [x, z] = key.split(",").map(Number);

    for (const [nx, nz] of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]) {
      if (nx < 0 || nx >= grid.width || nz < 0 || nz >= grid.height) continue;
      const nKey = `${nx},${nz}`;
      const cell = grid.cells.get(nKey);
      if (cell !== "wall" && cell !== "exterior") {
        grid.cells.set(nKey, "exterior");
        queue.push(nKey);
      }
    }
  }
}

// ── Find interior rooms ──
function findInteriorSpaces(grid, levelId) {
  const spaces = [];
  const visited = new Set();

  for (let x = 0; x < grid.width; x++) {
    for (let z = 0; z < grid.height; z++) {
      const key = `${x},${z}`;
      if (visited.has(key)) continue;

      const cell = grid.cells.get(key);
      if (cell === "wall" || cell === "exterior") { visited.add(key); continue; }

      // Found interior cell — flood fill to find full room
      const spaceCells = new Set();
      const queue = [key];
      visited.add(key); spaceCells.add(key);
      grid.cells.set(key, "interior");

      while (queue.length > 0) {
        const curKey = queue.shift();
        const [cx, cz] = curKey.split(",").map(Number);

        for (const [nx, nz] of [[cx+1,cz],[cx-1,cz],[cx,cz+1],[cx,cz-1]]) {
          if (nx < 0 || nx >= grid.width || nz < 0 || nz >= grid.height) continue;
          const nKey = `${nx},${nz}`;
          if (visited.has(nKey)) continue;

          const nCell = grid.cells.get(nKey);
          if (nCell === "wall" || nCell === "exterior") { visited.add(nKey); continue; }

          visited.add(nKey); spaceCells.add(nKey);
          grid.cells.set(nKey, "interior");
          queue.push(nKey);
        }
      }

      // Extract bounding polygon from cells
      const polygon = extractPolygonFromCells(spaceCells, grid);
      // Calculate area in sq ft
      const area = Math.abs(
        (polygon[2][0] - polygon[0][0]) * (polygon[2][1] - polygon[0][1])
      );

      // Skip tiny spaces (< 4 sq ft — likely artifacts)
      if (area < 4) continue;

      spaces.push({
        id: `space-${spaces.length}`,
        levelId,
        polygon,
        wallIds: [],
        isExterior: false,
        area,
      });
    }
  }

  return spaces;
}

function extractPolygonFromCells(cells, grid) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;

  for (const key of cells) {
    const [x, z] = key.split(",").map(Number);
    const worldX = grid.minX + x * grid.resolution;
    const worldZ = grid.minZ + z * grid.resolution;
    minX = Math.min(minX, worldX); minZ = Math.min(minZ, worldZ);
    maxX = Math.max(maxX, worldX + grid.resolution);
    maxZ = Math.max(maxZ, worldZ + grid.resolution);
  }

  return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
}

// ── Wall side classification ──
function assignWallSides(walls, grid) {
  const updates = [];

  for (const wall of walls) {
    const thickness = wall.thickness ?? 0.5;
    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;

    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) continue;

    const perpX = -dz / len, perpZ = dx / len;
    const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2;
    const offset = thickness / 2 + grid.resolution;

    const frontKey = getCellKey(grid, midX + perpX * offset, midZ + perpZ * offset);
    const backKey = getCellKey(grid, midX - perpX * offset, midZ - perpZ * offset);

    const frontCell = frontKey ? grid.cells.get(frontKey) : undefined;
    const backCell = backKey ? grid.cells.get(backKey) : undefined;

    updates.push({
      wallId: wall.id,
      frontSide: classifySide(frontCell),
      backSide: classifySide(backCell),
    });
  }

  return updates;
}

function classifySide(cell) {
  if (cell === "exterior") return "exterior";
  if (cell === "interior") return "interior";
  return "unknown";
}

// ── Grid utilities ──
function getCellKey(grid, x, z) {
  const cellX = Math.floor((x - grid.minX) / grid.resolution);
  const cellZ = Math.floor((z - grid.minZ) / grid.resolution);
  if (cellX < 0 || cellX >= grid.width || cellZ < 0 || cellZ >= grid.height) return null;
  return `${cellX},${cellZ}`;
}

// ── Wall connectivity check ──
export function wallTouchesOthers(wall, otherWalls, threshold = 0.1) {
  for (const other of otherWalls) {
    if (other.id === wall.id) continue;
    if (
      distanceToSegment(wall.start, other.start, other.end) < threshold ||
      distanceToSegment(wall.end, other.start, other.end) < threshold ||
      distanceToSegment(other.start, wall.start, wall.end) < threshold ||
      distanceToSegment(other.end, wall.start, wall.end) < threshold
    ) return true;
  }
  return false;
}

function distanceToSegment(point, segStart, segEnd) {
  const [px, pz] = point;
  const [x1, z1] = segStart;
  const [x2, z2] = segEnd;
  const dx = x2 - x1, dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.0001) {
    const dpx = px - x1, dpz = pz - z1;
    return Math.sqrt(dpx * dpx + dpz * dpz);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq));
  const projX = x1 + t * dx, projZ = z1 + t * dz;
  return Math.sqrt((px - projX) ** 2 + (pz - projZ) ** 2);
}
