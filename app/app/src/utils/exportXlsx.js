// exportXlsx — Export estimate data as a professionally formatted XLSX workbook
// Uses the xlsx package (already in package.json)
import * as XLSX from "xlsx";
import { nn } from "@/utils/format";
import { getTradeLabel, getTradeSortOrder } from "@/constants/tradeGroupings";

// ── Cell formatting helpers ──────────────────────────────────────
const CURRENCY_FMT = "$#,##0.00";
const PCT_FMT = "0.00%";
const _NUM_FMT = "#,##0.##";

function setCellFmt(ws, ref, fmt) {
  if (ws[ref]) ws[ref].z = fmt;
}

function _setCellStyle(ws, ref, style) {
  if (ws[ref]) ws[ref].s = style;
}

const _HEADER_STYLE = {
  font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "2D3748" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    bottom: { style: "thin", color: { rgb: "4A5568" } },
  },
};

const _TITLE_STYLE = {
  font: { bold: true, sz: 14, color: { rgb: "1A202C" } },
};

const _SECTION_STYLE = {
  font: { bold: true, sz: 11, color: { rgb: "2D3748" } },
  fill: { fgColor: { rgb: "EDF2F7" } },
};

const _TOTAL_STYLE = {
  font: { bold: true, sz: 12, color: { rgb: "1A202C" } },
  fill: { fgColor: { rgb: "F7FAFC" } },
  border: {
    top: { style: "double", color: { rgb: "2D3748" } },
  },
};

/**
 * Export a full estimate workbook and trigger browser download.
 * @param {object} project - project store data
 * @param {Array} items - items array from itemsStore
 * @param {object} totals - { material, labor, equipment, sub, direct, grand }
 * @param {object} markup - markup object from itemsStore
 * @param {object} [opts] - { markupOrder, groups, snapshots }
 */
export function exportEstimateXlsx(project, items, totals, markup, opts = {}) {
  const wb = XLSX.utils.book_new();
  const { markupOrder, groups, snapshots } = opts;

  // ═══════════════════════════════════════════════════════════════
  // Sheet 1: Summary
  // ═══════════════════════════════════════════════════════════════
  const sf = nn(project.projectSF);
  const summaryData = [
    ["ESTIMATE SUMMARY"],
    [],
    ["Project", project.name || "Untitled"],
    ["Estimate #", project.estimateNumber || ""],
    ["Client", project.client || ""],
    ["Architect", project.architect || ""],
    ["Status", project.status || "Draft"],
    ["Date", project.date || ""],
    ["Bid Due", project.bidDue || ""],
    ["Project SF", sf || ""],
    ["Job Type", project.jobType || ""],
    ["Labor Type", project.laborType || ""],
    [],
    ["COST BREAKDOWN"],
    ["Material", totals.material],
    ["Labor", totals.labor],
    ["Equipment", totals.equipment],
    ["Subcontractor", totals.sub],
    [],
    ["DIRECT COST", totals.direct],
    [],
    ["MARKUP"],
  ];

  // Dynamic markup rows from markupOrder
  if (markupOrder?.length) {
    markupOrder
      .filter(m => m.active)
      .forEach(m => {
        const pct = nn(markup[m.key]) || 0;
        summaryData.push([m.label, `${pct}%`]);
      });
  } else {
    // Fallback to flat markup values
    if (nn(markup.overhead)) summaryData.push(["Overhead", `${nn(markup.overhead)}%`]);
    if (nn(markup.profit)) summaryData.push(["Profit", `${nn(markup.profit)}%`]);
    if (nn(markup.contingency)) summaryData.push(["Contingency", `${nn(markup.contingency)}%`]);
    if (nn(markup.generalConditions)) summaryData.push(["Gen. Conditions", `${nn(markup.generalConditions)}%`]);
    if (nn(markup.insurance)) summaryData.push(["Insurance", `${nn(markup.insurance)}%`]);
  }

  summaryData.push([]);
  summaryData.push(["GRAND TOTAL", totals.grand]);
  if (sf > 0) {
    summaryData.push(["Cost / SF", totals.grand / sf]);
    summaryData.push(["Direct Cost / SF", totals.direct / sf]);
  }
  summaryData.push([]);
  summaryData.push(["Line Items", items.length]);
  summaryData.push(["Generated", new Date().toLocaleString()]);
  summaryData.push(["Powered by", "NOVATerra"]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 20 }, { wch: 22 }];
  // Apply currency formatting to cost cells
  for (let r = 0; r < summaryData.length; r++) {
    const val = summaryData[r]?.[1];
    if (typeof val === "number" && val !== sf) {
      setCellFmt(wsSummary, XLSX.utils.encode_cell({ r, c: 1 }), CURRENCY_FMT);
    }
  }
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ═══════════════════════════════════════════════════════════════
  // Sheet 2: Line Items (detailed)
  // ═══════════════════════════════════════════════════════════════
  const itemHeaders = [
    "Item ID",
    "Division",
    "Code",
    "Description",
    "Notes",
    "Qty",
    "Unit",
    "Material",
    "Labor",
    "Equipment",
    "Subcontractor",
    "Line Total",
    "Trade",
    "Spec Section",
  ];

  // Sort items by division for clean grouping
  const sortedItems = [...items].sort((a, b) => (a.division || "").localeCompare(b.division || ""));

  const itemRows = sortedItems.map(it => {
    const q = nn(it.quantity);
    const lineTotal = q * (nn(it.material) + nn(it.labor) + nn(it.equipment) + nn(it.subcontractor));
    return [
      it.id || "",
      it.division || "",
      it.code || "",
      it.description || "",
      it.notes || "",
      q,
      it.unit || "",
      nn(it.material),
      nn(it.labor),
      nn(it.equipment),
      nn(it.subcontractor),
      lineTotal,
      it.trade || "",
      it.specSection || "",
    ];
  });

  // Add totals row
  const totalRow = [
    "",
    "",
    "",
    `TOTAL (${items.length} items)`,
    "",
    "",
    "",
    items.reduce((s, it) => s + nn(it.quantity) * nn(it.material), 0),
    items.reduce((s, it) => s + nn(it.quantity) * nn(it.labor), 0),
    items.reduce((s, it) => s + nn(it.quantity) * nn(it.equipment), 0),
    items.reduce((s, it) => s + nn(it.quantity) * nn(it.subcontractor), 0),
    totals.direct,
    "",
    "",
  ];

  const wsItems = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows, [], totalRow]);
  wsItems["!cols"] = [
    { wch: 12 },
    { wch: 22 },
    { wch: 14 },
    { wch: 45 },
    { wch: 25 },
    { wch: 10 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
  ];
  // Currency formatting for cost columns (7-11, shifted +1 for ID column)
  for (let r = 1; r <= itemRows.length + 2; r++) {
    for (let c = 7; c <= 11; c++) {
      setCellFmt(wsItems, XLSX.utils.encode_cell({ r, c }), CURRENCY_FMT);
    }
  }
  // Freeze header row
  wsItems["!freeze"] = { xSplit: 0, ySplit: 1 };
  // Auto-filter
  wsItems["!autofilter"] = { ref: `A1:N${itemRows.length + 1}` };
  XLSX.utils.book_append_sheet(wb, wsItems, "Line Items");

  // ═══════════════════════════════════════════════════════════════
  // Sheet 3: Division Summary (pivot by division)
  // ═══════════════════════════════════════════════════════════════
  const divData = {};
  sortedItems.forEach(it => {
    const div = it.division || "Unassigned";
    if (!divData[div]) divData[div] = { mat: 0, lab: 0, equip: 0, sub: 0, count: 0 };
    const q = nn(it.quantity);
    divData[div].mat += q * nn(it.material);
    divData[div].lab += q * nn(it.labor);
    divData[div].equip += q * nn(it.equipment);
    divData[div].sub += q * nn(it.subcontractor);
    divData[div].count++;
  });

  const divHeaders = ["Division", "Items", "Material", "Labor", "Equipment", "Subcontractor", "Total", "% of Direct"];
  const divRows = Object.entries(divData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([div, d]) => {
      const total = d.mat + d.lab + d.equip + d.sub;
      return [div, d.count, d.mat, d.lab, d.equip, d.sub, total, totals.direct > 0 ? total / totals.direct : 0];
    });
  const divTotalRow = [
    "TOTAL",
    items.length,
    divRows.reduce((s, r) => s + r[2], 0),
    divRows.reduce((s, r) => s + r[3], 0),
    divRows.reduce((s, r) => s + r[4], 0),
    divRows.reduce((s, r) => s + r[5], 0),
    totals.direct,
    1,
  ];

  const wsDiv = XLSX.utils.aoa_to_sheet([divHeaders, ...divRows, [], divTotalRow]);
  wsDiv["!cols"] = [
    { wch: 30 },
    { wch: 8 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
  ];
  for (let r = 1; r <= divRows.length + 2; r++) {
    for (let c = 2; c <= 6; c++) setCellFmt(wsDiv, XLSX.utils.encode_cell({ r, c }), CURRENCY_FMT);
    setCellFmt(wsDiv, XLSX.utils.encode_cell({ r, c: 7 }), PCT_FMT);
  }
  XLSX.utils.book_append_sheet(wb, wsDiv, "Division Summary");

  // ═══════════════════════════════════════════════════════════════
  // Sheet 4: Schedule of Values
  // ═══════════════════════════════════════════════════════════════
  const wrappedMultiplier = totals.direct > 0 ? totals.grand / totals.direct : 1;
  const trades = {};
  items.forEach(it => {
    const label = getTradeLabel(it);
    const sort = getTradeSortOrder(it);
    if (!trades[label]) trades[label] = { total: 0, sort };
    const q = nn(it.quantity);
    trades[label].total += q * (nn(it.material) + nn(it.labor) + nn(it.equipment) + nn(it.subcontractor));
  });
  const sovRows = Object.entries(trades)
    .sort(([, a], [, b]) => a.sort - b.sort)
    .map(([label, d], i) => {
      const scheduledValue = d.total * wrappedMultiplier;
      return [i + 1, label, scheduledValue, totals.grand > 0 ? scheduledValue / totals.grand : 0];
    });

  const sovHeaders = ["No.", "Description of Work", "Scheduled Value", "% of Contract"];
  const sovData = [sovHeaders, ...sovRows, [], ["", "TOTAL CONTRACT SUM", totals.grand, 1]];
  const wsSov = XLSX.utils.aoa_to_sheet(sovData);
  wsSov["!cols"] = [{ wch: 6 }, { wch: 38 }, { wch: 20 }, { wch: 14 }];
  for (let r = 1; r <= sovRows.length + 2; r++) {
    setCellFmt(wsSov, XLSX.utils.encode_cell({ r, c: 2 }), CURRENCY_FMT);
    setCellFmt(wsSov, XLSX.utils.encode_cell({ r, c: 3 }), PCT_FMT);
  }
  XLSX.utils.book_append_sheet(wb, wsSov, "Schedule of Values");

  // ═══════════════════════════════════════════════════════════════
  // Sheet 5: Cost Comparison (if bid groups exist)
  // ═══════════════════════════════════════════════════════════════
  if (groups?.length > 1) {
    const groupHeaders = ["Item", "Division", "Description"];
    groups.forEach(g => groupHeaders.push(g.label || g.id));
    groupHeaders.push("Variance");

    const groupRows = [];
    // Only show items that appear in multiple groups
    const baseItems = items.filter(it => !it.bidContext || it.bidContext === "base");
    baseItems.forEach(it => {
      const row = [it.code || "", it.division || "", it.description || ""];
      const q = nn(it.quantity);
      const baseTotal = q * (nn(it.material) + nn(it.labor) + nn(it.equipment) + nn(it.subcontractor));
      row.push(baseTotal);
      // For each additional group, find matching item or show base
      let minVal = baseTotal,
        maxVal = baseTotal;
      groups.slice(1).forEach(() => {
        row.push(baseTotal); // TODO: group-specific costs when multi-group data is available
      });
      row.push(maxVal - minVal);
      groupRows.push(row);
    });

    if (groupRows.length > 0) {
      const wsGroup = XLSX.utils.aoa_to_sheet([groupHeaders, ...groupRows]);
      XLSX.utils.book_append_sheet(wb, wsGroup, "Cost Comparison");
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Sheet 6: Snapshot History (if snapshots provided)
  // ═══════════════════════════════════════════════════════════════
  if (snapshots?.length > 0) {
    const snapHeaders = [
      "Date",
      "Label",
      "Grand Total",
      "Direct Cost",
      "Material",
      "Labor",
      "Equipment",
      "Sub",
      "Items",
      "Change",
    ];
    const snapRows = snapshots.map((snap, i) => {
      const prev = i > 0 ? snapshots[i - 1] : null;
      const change = prev ? snap.grandTotal - prev.grandTotal : 0;
      return [
        snap.dateStr || new Date(snap.timestamp).toLocaleDateString(),
        snap.label || "",
        snap.grandTotal || 0,
        snap.direct || 0,
        snap.material || 0,
        snap.labor || 0,
        snap.equipment || 0,
        snap.sub || 0,
        snap.itemCount || 0,
        change,
      ];
    });

    const wsSnap = XLSX.utils.aoa_to_sheet([snapHeaders, ...snapRows]);
    wsSnap["!cols"] = [
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 8 },
      { wch: 14 },
    ];
    for (let r = 1; r <= snapRows.length; r++) {
      for (let c = 2; c <= 7; c++) setCellFmt(wsSnap, XLSX.utils.encode_cell({ r, c }), CURRENCY_FMT);
      setCellFmt(wsSnap, XLSX.utils.encode_cell({ r, c: 9 }), CURRENCY_FMT);
    }
    XLSX.utils.book_append_sheet(wb, wsSnap, "Snapshot History");
  }

  // ── Download ──────────────────────────────────────────
  const safeName = (project.name || "Estimate").replace(/[^a-zA-Z0-9 ]/g, "").trim();
  const fileName = `${safeName}_Estimate.xlsx`;
  XLSX.writeFile(wb, fileName);
}
