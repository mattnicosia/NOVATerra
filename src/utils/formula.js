import { nn } from './format';

export const evalFormula = (formula, variables, measured) => {
  if (!formula) return measured;
  try {
    let expr = formula;
    (variables || []).forEach(v => {
      const re = new RegExp(`\\b${v.name}\\b`, 'g');
      expr = expr.replace(re, String(nn(v.value)));
    });
    expr = expr.replace(/\bQty\b/gi, String(measured));
    // Safe math evaluation — only numbers and basic operators
    if (!/^[\d\s+\-*/().]+$/.test(expr)) return measured;
    return nn(Function('"use strict"; return (' + expr + ')')());
  } catch {
    return measured;
  }
};
