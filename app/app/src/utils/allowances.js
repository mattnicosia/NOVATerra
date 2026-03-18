import { nn, fmt2 } from '@/utils/format';

// Check if item has any allowance flags
export const hasAllowance = (item) => {
  const ao = item.allowanceOf;
  if (!ao) return false;
  if (typeof ao === "string") return !!ao;
  return ao.material || ao.labor || ao.equipment || ao.subcontractor;
};

// Get flagged field names
export const getAllowanceFields = (item) => {
  const ao = item.allowanceOf;
  if (!ao) return [];
  if (typeof ao === "string") return ao ? [ao] : [];
  return ["material", "labor", "equipment", "subcontractor"].filter(f => ao[f]);
};

// Sum of flagged columns * qty * (1 + subMarkup%)
export const getItemAllowanceTotal = (item) => {
  const fields = getAllowanceFields(item);
  if (fields.length === 0) return 0;
  const q = nn(item.quantity);
  const base = fields.reduce((s, f) => s + nn(item[f]), 0) * q;
  const mkup = nn(item.allowanceSubMarkup);
  return base * (1 + mkup / 100);
};

// Professional allowance note
export const generateAllowanceNote = (item) => {
  const fields = getAllowanceFields(item);
  if (fields.length === 0) return "";
  const q = nn(item.quantity);
  const parts = fields.map(f => {
    const rate = nn(item[f]);
    const amt = rate * q;
    return `$${fmt2(amt).replace("$", "")} for ${f} ($${fmt2(rate).replace("$", "")}/${item.unit})`;
  });
  const mkup = nn(item.allowanceSubMarkup);
  let note = `An allowance of ${parts.join(" and ")} has been included for ${item.description}.`;
  if (mkup > 0) note += ` A ${mkup}% markup applies.`;
  note += " Final selection by Owner.";
  return note;
};
