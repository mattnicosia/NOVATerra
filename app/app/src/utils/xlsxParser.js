/**
 * Parse Excel (.xlsx, .xls) files into { headers, rows } format.
 * Uses SheetJS for binary Excel parsing.
 *
 * @param {ArrayBuffer} buffer - Raw file bytes
 * @param {object} [options]
 * @param {string} [options.sheetName] - Specific sheet to parse (default: first)
 * @returns {{ headers: string[], rows: string[][], sheetNames: string[] }}
 */
import { read, utils } from "xlsx";

export function parseXLSX(buffer, options = {}) {
  try {
    const workbook = read(buffer, { type: "array" });
    const sheetNames = workbook.SheetNames || [];

    if (sheetNames.length === 0) return { headers: [], rows: [], sheetNames: [] };

    // Use specified sheet or first sheet
    const sheetName = options.sheetName && sheetNames.includes(options.sheetName) ? options.sheetName : sheetNames[0];

    const result = parseSheet(workbook.Sheets[sheetName]);
    result.sheetNames = sheetNames;
    return result;
  } catch (err) {
    console.error("[xlsxParser] Failed to parse Excel file:", err);
    return { headers: [], rows: [], sheetNames: [] };
  }
}

/**
 * Parse all sheets in an Excel workbook.
 * Returns an array of { name, headers, rows } for each non-empty sheet.
 *
 * @param {ArrayBuffer} buffer
 * @returns {{ name: string, headers: string[], rows: string[][] }[]}
 */
export function parseAllSheets(buffer) {
  try {
    const workbook = read(buffer, { type: "array" });
    const results = [];

    for (const name of workbook.SheetNames) {
      const parsed = parseSheet(workbook.Sheets[name]);
      if (parsed.headers.length > 0 && parsed.rows.length > 0) {
        results.push({ name, ...parsed });
      }
    }

    return results;
  } catch (err) {
    console.error("[xlsxParser] Failed to parse all sheets:", err);
    return [];
  }
}

/** Parse a single worksheet into { headers, rows } */
function parseSheet(sheet) {
  if (!sheet) return { headers: [], rows: [] };

  const aoa = utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  if (!aoa || aoa.length === 0) return { headers: [], rows: [] };

  // First non-empty row is headers
  let headerIdx = 0;
  while (headerIdx < aoa.length) {
    const row = aoa[headerIdx];
    if (row && row.some(c => String(c).trim() !== "")) break;
    headerIdx++;
  }
  if (headerIdx >= aoa.length) return { headers: [], rows: [] };

  const headers = aoa[headerIdx].map(h => String(h).trim());
  const dataRows = aoa
    .slice(headerIdx + 1)
    .filter(row => row && row.some(c => String(c).trim() !== ""))
    .map(row => row.map(c => String(c ?? "")));

  return { headers, rows: dataRows };
}
