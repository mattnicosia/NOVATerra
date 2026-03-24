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

export const BUILDING_COLORS = {
  foundation: '#1e1e1e',
  column: '#d4ccc0',
  wall: '#b0a898',
  window: '#4a9eff',
  door: '#e85c30',
  retail: '#ffb840',
  slab: '#706860',
  roof: '#e85c30',
  mechanical: '#555050',
};

export const CUBE_MATERIALS = {
  foundation: { color: '#1e1e1e', metalness: 0.1, roughness: 0.9, emissive: '#000000', emissiveIntensity: 0 },
  column:     { color: '#d4ccc0', metalness: 0.15, roughness: 0.7, emissive: '#000000', emissiveIntensity: 0 },
  wall:       { color: '#b0a898', metalness: 0.05, roughness: 0.85, emissive: '#000000', emissiveIntensity: 0 },
  window:     { color: '#4a9eff', metalness: 0.85, roughness: 0.05, emissive: '#4a9eff', emissiveIntensity: 0.3 },
  door:       { color: '#e85c30', metalness: 0.3, roughness: 0.4, emissive: '#e85c30', emissiveIntensity: 0.2 },
  retail:     { color: '#ffb840', metalness: 0.4, roughness: 0.3, emissive: '#ffb840', emissiveIntensity: 0.25 },
  slab:       { color: '#706860', metalness: 0.05, roughness: 0.9, emissive: '#000000', emissiveIntensity: 0 },
  roof:       { color: '#e85c30', metalness: 0.2, roughness: 0.6, emissive: '#e85c30', emissiveIntensity: 0.1 },
  mechanical: { color: '#555050', metalness: 0.3, roughness: 0.7, emissive: '#000000', emissiveIntensity: 0 },
};

export const MODULE_SIZE_FT = 5; // 1 cube = 5ft module
