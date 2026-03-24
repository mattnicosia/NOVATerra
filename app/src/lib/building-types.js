// building-types.js — TypeScript-style interfaces as JSDoc for the building generator

/**
 * @typedef {'residential' | 'commercial' | 'mixed-use'} BuildingType
 */

/**
 * @typedef {Object} BuildingConfig
 * @property {number} widthFt - Building width in feet
 * @property {number} depthFt - Building depth in feet
 * @property {number} numFloors - Number of floors
 * @property {number} floorHeightFt - Floor-to-floor height in feet
 * @property {BuildingType} buildingType - Building classification
 * @property {string} [projectName] - Project name for display
 */

/**
 * @typedef {'foundation' | 'column' | 'wall' | 'window' | 'door' | 'slab' | 'roof' | 'retail' | 'mechanical'} CubeType
 */

/**
 * @typedef {Object} CubeData
 * @property {string} id - Unique cube identifier
 * @property {[number, number, number]} target - Target position [x, y, z]
 * @property {[number, number, number]} [start] - Random start position for animation
 * @property {CubeType} type - Cube classification
 * @property {number} floor - Floor number (0 = foundation)
 * @property {number} delay - Animation delay in seconds
 */

// ── Glass + steel with HDRI reflections ──
// With HDRI environment map, metallic surfaces actually reflect light properly.
// Glass blocks: moderate metalness for reflections + emissive for inner glow.
export const BUILDING_COLORS = {
  foundation: '#1A1D22',
  column:     '#6A7080',
  wall:       '#7080A0',
  window:     '#00CFFF',
  door:       '#00D4AA',
  retail:     '#FF8C00',
  slab:       '#3A404A',
  roof:       '#505868',
  mechanical: '#FF3B3B',
};

export const CUBE_MATERIALS = {
  foundation: {
    color: '#1A1D22', metalness: 0.5, roughness: 0.4,
    emissive: '#0A0D12', emissiveIntensity: 0.1,
  },
  column: {
    color: '#6A7080', metalness: 0.6, roughness: 0.25,
    emissive: '#303540', emissiveIntensity: 0.1,
  },
  wall: {
    color: '#7080A0', metalness: 0.65, roughness: 0.15,
    emissive: '#354060', emissiveIntensity: 0.15,
  },
  window: {
    color: '#00CFFF', metalness: 0.8, roughness: 0.05,
    emissive: '#00CFFF', emissiveIntensity: 0.6,
  },
  door: {
    color: '#00D4AA', metalness: 0.7, roughness: 0.1,
    emissive: '#00D4AA', emissiveIntensity: 0.5,
  },
  retail: {
    color: '#FF8C00', metalness: 0.65, roughness: 0.12,
    emissive: '#FF8C00', emissiveIntensity: 0.4,
  },
  slab: {
    color: '#3A404A', metalness: 0.4, roughness: 0.4,
    emissive: '#1A1E25', emissiveIntensity: 0.08,
  },
  roof: {
    color: '#505868', metalness: 0.5, roughness: 0.3,
    emissive: '#252A35', emissiveIntensity: 0.1,
  },
  mechanical: {
    color: '#FF3B3B', metalness: 0.6, roughness: 0.15,
    emissive: '#FF3B3B', emissiveIntensity: 0.4,
  },
};

export const MODULE_SIZE_FT = 5; // 1 cube = 5ft module
