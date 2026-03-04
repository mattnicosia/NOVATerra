/**
 * Scope Sheet Generator
 *
 * Generates scope summaries from estimate items for inclusion in
 * bid packages. Rounds quantities to avoid exposing exact GC numbers.
 * Gives subs context no competitor provides without GC liability.
 */

import { CSI } from "@/constants/csi";

function roundQty(qty) {
  if (!qty || qty <= 0) return null;
  if (qty <= 5) return qty;
  if (qty <= 25) return Math.round(qty / 5) * 5;
  if (qty <= 100) return Math.round(qty / 10) * 10;
  if (qty <= 1000) return Math.round(qty / 50) * 50;
  if (qty <= 10000) return Math.round(qty / 500) * 500;
  return Math.round(qty / 1000) * 1000;
}

function formatRoundedQty(qty, unit) {
  const rounded = roundQty(qty);
  if (!rounded) return null;
  const formatted = rounded.toLocaleString("en-US");
  return `~${formatted} ${unit || "EA"}`;
}

export function generateScopeSheet(selectedItems, csiData) {
  if (!selectedItems || selectedItems.length === 0) {
    return { divisions: [], plainText: "", html: "" };
  }

  // Group by 2-digit division
  const byDiv = {};
  for (const item of selectedItems) {
    const code = String(item.code || "").trim();
    const divMatch = code.match(/^(\d{2})/);
    const div = divMatch ? divMatch[1] : item.division || "00";
    if (!byDiv[div]) byDiv[div] = [];
    byDiv[div].push(item);
  }

  const csi = csiData || CSI;
  const divisions = Object.keys(byDiv)
    .sort()
    .map(div => {
      const divItems = byDiv[div];
      const divName = csi[div]?.name || `Division ${div}`;

      const lineItems = divItems.map(item => {
        const qty = Number(item.quantity) || 0;
        return {
          code: item.code,
          description: item.description || "",
          approximateQty: formatRoundedQty(qty, item.unit),
          unit: item.unit || "",
          specSection: item.specSection || null,
        };
      });

      // Collect unique spec sections
      const specSections = [...new Set(lineItems.filter(i => i.specSection).map(i => i.specSection))];

      return {
        division: div,
        divisionName: divName,
        itemCount: lineItems.length,
        lineItems,
        specSections,
      };
    });

  // Generate plain text
  const plainText = divisions
    .map(d => {
      let section = `${d.divisionName} (Div ${d.division}) — ${d.itemCount} item${d.itemCount !== 1 ? "s" : ""}`;
      for (const item of d.lineItems) {
        section += `\n  • ${item.description}`;
        if (item.approximateQty) section += ` — ${item.approximateQty}`;
      }
      if (d.specSections.length > 0) {
        section += `\n  Spec sections: ${d.specSections.join(", ")}`;
      }
      return section;
    })
    .join("\n\n");

  // Generate HTML for email — uses dark text on light backgrounds
  // since most email clients (Gmail, Outlook) render on white
  const html = `<div style="font-family: 'DM Sans', Arial, sans-serif; font-size: 14px; color: #333333;">
${divisions
  .map(
    d => `
<div style="margin-bottom: 16px;">
  <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 6px;">
    ${d.divisionName} <span style="color: #666666;">(Div ${d.division})</span>
  </div>
  <ul style="margin: 0; padding-left: 18px; color: #444444;">
${d.lineItems
  .map(
    item =>
      `    <li style="margin-bottom: 3px;">${item.description}${item.approximateQty ? ` <span style="color: #0066cc; font-weight: 500;">— ${item.approximateQty}</span>` : ""}</li>`,
  )
  .join("\n")}
  </ul>
${d.specSections.length > 0 ? `  <div style="font-size: 12px; color: #888888; margin-top: 4px;">Spec: ${d.specSections.join(", ")}</div>` : ""}
</div>`,
  )
  .join("\n")}
</div>`;

  return { divisions, plainText, html };
}
