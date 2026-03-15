/**
 * Parse Excel (.xlsx, .xls) files into the same { headers, rows } format
 * as csvParser.js. Uses SheetJS for binary Excel parsing.
 *
 * @param {ArrayBuffer} buffer - Raw file bytes
 * @returns {{ headers: string[], rows: string[][] }}
 */
import { read, utils } from 'xlsx';

export function parseXLSX(buffer) {
  try {
    const workbook = read(buffer, { type: 'array' });

    // Use the first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { headers: [], rows: [] };

    const sheet = workbook.Sheets[sheetName];

    // Convert to array of arrays (each row is string[])
    // raw:false ensures formatted values (dates, currencies rendered as strings)
    // defval:"" ensures empty cells become empty strings instead of undefined
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
    const dataRows = aoa.slice(headerIdx + 1)
      .filter(row => row && row.some(c => String(c).trim() !== ""))
      .map(row => row.map(c => String(c ?? "")));

    return { headers, rows: dataRows };
  } catch (err) {
    console.error('[xlsxParser] Failed to parse Excel file:', err);
    return { headers: [], rows: [] };
  }
}

/**
 * Extract rows from a named sheet in an XLSX workbook.
 * Returns raw array-of-arrays, or null if the sheet doesn't exist.
 */
export function getXLSXSheet(buffer, sheetName) {
  try {
    const workbook = read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return null;
    return utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  } catch {
    return null;
  }
}
