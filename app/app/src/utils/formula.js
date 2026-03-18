import { nn } from './format';

/**
 * Evaluate a user-defined formula with variable substitution.
 * Variables use `v.key` (e.g. "Height", "Waste") — matches takeoff.variables shape.
 * Also accepts `v.name` as fallback for backward compat.
 */
export const evalFormula = (formula, variables, measured) => {
  if (!formula || !formula.trim()) return measured;
  try {
    let expr = formula.trim();
    // Build variable list: always include Qty/Measured as built-ins
    const vars = [
      { key: "Measured", value: measured },
      { key: "Qty", value: measured },
      ...(variables || []),
    ];
    // Sort longest key first to prevent partial matches (e.g. "Height" before "He")
    vars.sort((a, b) => ((b.key || b.name || "").length) - ((a.key || a.name || "").length));
    vars.forEach(v => {
      const k = v.key || v.name;
      if (k) {
        const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        expr = expr.replace(re, String(nn(v.value)));
      }
    });
    // Safe math evaluation — only numbers and basic operators
    const safe = expr.replace(/[^0-9.+\-*/()% ]/g, "");
    if (!safe.trim()) return measured;
    return nn(Function('"use strict"; return (' + safe + ')')());
  } catch {
    return measured;
  }
};
