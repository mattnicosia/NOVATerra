// exportXlsx — Export estimate data as a multi-sheet XLSX workbook
// Uses the xlsx package (already in package.json)
import * as XLSX from 'xlsx';
import { nn } from '@/utils/format';
import { getTradeLabel, getTradeSortOrder } from '@/constants/tradeGroupings';

/**
 * Export a full estimate workbook and trigger browser download.
 * @param {object} project - project store data
 * @param {Array} items - items array from itemsStore
 * @param {object} totals - { material, labor, equipment, sub, direct, grand }
 * @param {object} markup - markup object from itemsStore
 */
export function exportEstimateXlsx(project, items, totals, markup) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ──────────────────────────────────
  const summaryData = [
    ['ESTIMATE SUMMARY'],
    [],
    ['Project', project.name || 'Untitled'],
    ['Client', project.client || ''],
    ['Status', project.status || 'Draft'],
    ['Date', project.date || ''],
    ['Bid Due', project.bidDue || ''],
    ['Project SF', nn(project.projectSF) || ''],
    ['Job Type', project.jobType || ''],
    [],
    ['COST BREAKDOWN'],
    ['Material', totals.material],
    ['Labor', totals.labor],
    ['Equipment', totals.equipment],
    ['Subcontractor', totals.sub],
    ['Direct Cost', totals.direct],
    [],
    ['MARKUP'],
    ['Overhead', `${nn(markup.overhead)}%`],
    ['Profit', `${nn(markup.profit)}%`],
    ['Contingency', `${nn(markup.contingency)}%`],
    ['Gen. Conditions', `${nn(markup.generalConditions)}%`],
    ['Insurance', `${nn(markup.insurance)}%`],
    [],
    ['GRAND TOTAL', totals.grand],
    [],
    nn(project.projectSF) > 0 ? ['Cost / SF', totals.grand / nn(project.projectSF)] : [],
  ].filter(row => row.length > 0);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  // Format currency columns
  wsSummary['!cols'] = [{ wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Sheet 2: Line Items ───────────────────────────────
  const headers = ['Division', 'Code', 'Description', 'Qty', 'Unit', 'Material', 'Labor', 'Equipment', 'Subcontractor', 'Line Total'];
  const rows = items.map(it => {
    const q = nn(it.quantity);
    const lineTotal = q * (nn(it.material) + nn(it.labor) + nn(it.equipment) + nn(it.subcontractor));
    return [
      it.division || '',
      it.code || '',
      it.description || '',
      q,
      it.unit || '',
      nn(it.material),
      nn(it.labor),
      nn(it.equipment),
      nn(it.subcontractor),
      lineTotal,
    ];
  });

  const wsItems = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  wsItems['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 40 }, { wch: 8 }, { wch: 6 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsItems, 'Line Items');

  // ── Sheet 3: Schedule of Values ───────────────────────
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
    .map(([label, d], i) => [i + 1, label, d.total * wrappedMultiplier]);

  const sovHeaders = ['No.', 'Description of Work', 'Scheduled Value'];
  const sovData = [sovHeaders, ...sovRows, [], ['', 'TOTAL CONTRACT SUM', totals.grand]];
  const wsSov = XLSX.utils.aoa_to_sheet(sovData);
  wsSov['!cols'] = [{ wch: 6 }, { wch: 35 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSov, 'Schedule of Values');

  // ── Download ──────────────────────────────────────────
  const fileName = `${(project.name || 'Estimate').replace(/[^a-zA-Z0-9 ]/g, '')}_Estimate.xlsx`;
  XLSX.writeFile(wb, fileName);
}
