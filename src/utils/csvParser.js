/**
 * Parse CSV/TSV text into structured rows.
 * Handles:
 *   - Auto-detection of delimiter (comma, tab, semicolon, pipe)
 *   - Quoted fields, commas inside quotes, doubled "" escapes
 *   - BOM characters, mixed line endings (\r\n, \n, \r)
 *   - UTF-16 decoded text (BOM already handled by caller)
 *
 * @param {string} text - Raw CSV/TSV content (already decoded to string)
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCSV(text) {
  if (!text) return { headers: [], rows: [] };

  // Strip BOM if present (may remain after TextDecoder)
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  // Auto-detect delimiter from the first non-empty line
  const delimiter = detectDelimiter(text);

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Doubled quote "" → literal quote
        if (i + 1 < text.length && text[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        cell += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        row.push(cell);
        cell = "";
        i++;
      } else if (ch === '\r') {
        row.push(cell);
        cell = "";
        if (row.some(c => c.trim() !== "")) rows.push(row);
        row = [];
        i++;
        if (i < text.length && text[i] === '\n') i++;
      } else if (ch === '\n') {
        row.push(cell);
        cell = "";
        if (row.some(c => c.trim() !== "")) rows.push(row);
        row = [];
        i++;
      } else {
        cell += ch;
        i++;
      }
    }
  }

  // Flush last cell/row
  row.push(cell);
  if (row.some(c => c.trim() !== "")) rows.push(row);

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows };
}

/**
 * Auto-detect the delimiter used in a CSV/TSV file.
 * Examines the first line (outside quotes) and picks the most common delimiter.
 *
 * @param {string} text - Full file content
 * @returns {string} The detected delimiter character
 */
function detectDelimiter(text) {
  // Get first line (handle \r\n, \n, \r)
  let firstLine = "";
  let inQuotes = false;
  for (let i = 0; i < text.length && i < 5000; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      break;
    }
    firstLine += ch;
  }

  const candidates = [
    { ch: '\t', count: 0 },
    { ch: ',',  count: 0 },
    { ch: ';',  count: 0 },
    { ch: '|',  count: 0 },
  ];

  // Count occurrences of each candidate in the first line (outside quotes)
  inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (inQuotes) continue;
    for (const c of candidates) {
      if (ch === c.ch) c.count++;
    }
  }

  // Pick the candidate with the most occurrences
  candidates.sort((a, b) => b.count - a.count);

  // If the best candidate has at least 1 occurrence, use it; otherwise default to comma
  return candidates[0].count > 0 ? candidates[0].ch : ',';
}
