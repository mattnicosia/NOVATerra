import { nn } from './format';
import { evaluateArithmeticExpression } from "./safeExpression";

/**
 * Evaluate a user-defined formula with variable substitution.
 * Variables use `v.key` (e.g. "Height", "Waste") — matches takeoff.variables shape.
 * Also accepts `v.name` as fallback for backward compat.
 */
export const evalFormula = (formula, variables, measured) => {
  if (!formula || !formula.trim()) return measured;
  try {
    const scope = {
      Measured: measured,
      Qty: measured,
    };
    (variables || []).forEach(variable => {
      const key = variable?.key || variable?.name;
      if (key) scope[key] = nn(variable.value);
    });
    return nn(evaluateArithmeticExpression(formula, scope));
  } catch {
    return measured;
  }
};
