export const DEFAULT_LABOR_TYPES = [
  { key: "open_shop", label: "Open Shop", multiplier: 1.0 },
  { key: "union", label: "Union", multiplier: 1.35 },
  { key: "prevailing_wage", label: "Prevailing Wage", multiplier: 1.55 },
];

/**
 * Returns the labor multiplier for a given labor type key.
 * Falls back to 1.0 if key is not found or inputs are falsy.
 */
export function getLaborMultiplier(laborTypeKey, laborTypes) {
  if (!laborTypeKey || !laborTypes) return 1.0;
  const found = laborTypes.find(lt => lt.key === laborTypeKey);
  return found ? (parseFloat(found.multiplier) || 1.0) : 1.0;
}
