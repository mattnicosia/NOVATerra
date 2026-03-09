/**
 * CSV Export/Import utilities for the user cost library.
 *
 * Export: Converts user elements to CSV (code, name, unit, material, labor, equipment, subcontractor, trade).
 * Import: Parses CSV rows and returns structured element data ready for addElement().
 */

const CSV_COLUMNS = ["Code", "Name", "Unit", "Material", "Labor", "Equipment", "Subcontractor", "Trade"];

/**
 * Export user elements to CSV and trigger browser download.
 * @param {Array} elements - Array of user elements (from getUserElements())
 * @param {string} [filename] - Optional filename (defaults to "cost-library-export.csv")
 */
export function exportUserElementsCsv(elements, filename = "cost-library-export.csv") {
  const escapeField = (val) => {
    const str = val == null ? "" : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [CSV_COLUMNS.join(",")];
  for (const el of elements) {
    rows.push([
      escapeField(el.code),
      escapeField(el.name),
      escapeField(el.unit || "EA"),
      el.material ?? "",
      el.labor ?? "",
      el.equipment ?? "",
      el.subcontractor ?? "",
      escapeField(el.trade || ""),
    ].join(","));
  }

  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse CSV text into element objects.
 * Attempts to auto-detect column mapping from the header row.
 * @param {string} csvText - Raw CSV text content
 * @returns {{ headers: string[], rows: object[], errors: string[] }}
 */
export function parseImportCsv(csvText) {
  const errors = [];
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    errors.push("CSV must have a header row and at least one data row.");
    return { headers: [], rows: [], errors };
  }

  // Parse header
  const headers = parseCsvLine(lines[0]);
  const colMap = mapColumns(headers);

  if (!colMap.name && !colMap.code) {
    errors.push("Could not find a 'Name' or 'Code' column in the header row.");
    return { headers, rows: [], errors };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.every(f => !f.trim())) continue; // skip blank rows

    const row = {
      code: getField(fields, colMap.code),
      name: getField(fields, colMap.name) || getField(fields, colMap.code) || `Item ${i}`,
      unit: getField(fields, colMap.unit) || "EA",
      material: parseNum(getField(fields, colMap.material)),
      labor: parseNum(getField(fields, colMap.labor)),
      equipment: parseNum(getField(fields, colMap.equipment)),
      subcontractor: parseNum(getField(fields, colMap.subcontractor)),
      trade: getField(fields, colMap.trade) || "",
      _lineNum: i + 1,
      _selected: true,
    };
    rows.push(row);
  }

  return { headers, rows, errors };
}

// ─── Internal helpers ───────────────────────────────────────────

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function mapColumns(headers) {
  const lc = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return {
    code: findCol(lc, ["code", "itemcode", "csicode", "costcode"]),
    name: findCol(lc, ["name", "description", "itemname", "desc"]),
    unit: findCol(lc, ["unit", "uom", "unitofmeasure"]),
    material: findCol(lc, ["material", "mat", "materialcost"]),
    labor: findCol(lc, ["labor", "laborcost", "lab"]),
    equipment: findCol(lc, ["equipment", "equip", "equipmentcost", "eq"]),
    subcontractor: findCol(lc, ["subcontractor", "sub", "subcost"]),
    trade: findCol(lc, ["trade", "division", "tradename"]),
  };
}

function findCol(lc, candidates) {
  for (const c of candidates) {
    const idx = lc.indexOf(c);
    if (idx !== -1) return idx;
  }
  return null;
}

function getField(fields, idx) {
  if (idx == null || idx >= fields.length) return "";
  return fields[idx];
}

function parseNum(val) {
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/[$,]/g, ""));
  return isNaN(n) ? 0 : n;
}
