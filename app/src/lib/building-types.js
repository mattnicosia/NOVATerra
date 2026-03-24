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

// ── Glowing glass + dark steel ──
// Blocks glow from within like backlit glass panels. No HDRI needed.
export const BUILDING_COLORS = {
  foundation: '#1A1D22',
  column:     '#3A3F4A',
  wall:       '#4A5060',
  window:     '#00BFFF',
  door:       '#00D4AA',
  retail:     '#FF8C00',
  slab:       '#2A2E36',
  roof:       '#353A44',
  mechanical: '#FF3B3B',
};

export const CUBE_MATERIALS = {
  foundation: {
    color: '#2A2E36', metalness: 0.2, roughness: 0.6,
    emissive: '#181C22', emissiveIntensity: 0.2,
  },
  column: {
    color: '#4A5058', metalness: 0.25, roughness: 0.5,
    emissive: '#303540', emissiveIntensity: 0.3,
  },
  wall: {
    color: '#5A6070', metalness: 0.2, roughness: 0.4,
    emissive: '#3A4555', emissiveIntensity: 0.45,
  },
  window: {
    color: '#00BFFF', metalness: 0.5, roughness: 0.1,
    emissive: '#00BFFF', emissiveIntensity: 0.7,
  },
  door: {
    color: '#00D4AA', metalness: 0.4, roughness: 0.2,
    emissive: '#00D4AA', emissiveIntensity: 0.6,
  },
  retail: {
    color: '#FF8C00', metalness: 0.4, roughness: 0.2,
    emissive: '#FF8C00', emissiveIntensity: 0.5,
  },
  slab: {
    color: '#353A44', metalness: 0.2, roughness: 0.5,
    emissive: '#1E2230', emissiveIntensity: 0.25,
  },
  roof: {
    color: '#404550', metalness: 0.25, roughness: 0.45,
    emissive: '#252A35', emissiveIntensity: 0.3,
  },
  mechanical: {
    color: '#FF3B3B', metalness: 0.4, roughness: 0.2,
    emissive: '#FF3B3B', emissiveIntensity: 0.5,
  },
};

export const MODULE_SIZE_FT = 5; // 1 cube = 5ft module
