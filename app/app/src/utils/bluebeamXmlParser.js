/**
 * Parse Bluebeam Studio Session / Markup XML exports into { headers, rows }
 * format consistent with csvParser.js and xlsxParser.js.
 *
 * Bluebeam XML exports come in several flavors:
 *   1. Markup Summary XML — exported from Markups List
 *   2. Studio Session XML — exported from a Studio Session
 *   3. Quantity Link XML — exported from Quantity Link takeoffs
 *
 * All share a common pattern: root element containing <Markup> or <Row> elements
 * with attributes representing columns (Subject, Label, Layer, Color, etc.)
 *
 * Uses native DOMParser — no external dependencies needed.
 *
 * @param {ArrayBuffer|string} input - Raw file bytes or XML text
 * @returns {{ headers: string[], rows: string[][] }}
 */

// ── Known Bluebeam field mappings (XML attr → human-friendly header) ──
const FIELD_MAP = {
  // Core identity
  Subject:       "Subject",
  Label:         "Label",
  Author:        "Author",
  Date:          "Date",
  Page:          "Page",
  PageLabel:     "Page Label",
  Space:         "Space",
  Layer:         "Layer",
  Status:        "Status",
  Color:         "Color",
  // Measurements (Quantity Link)
  Measurement:   "Measurement",
  Length:         "Length",
  Area:           "Area",
  Volume:        "Volume",
  Count:         "Count",
  Depth:         "Depth",
  // Custom columns (users define these)
  Column1:       "Column 1",
  Column2:       "Column 2",
  Column3:       "Column 3",
  Column4:       "Column 4",
  Column5:       "Column 5",
  Column6:       "Column 6",
  // Comments
  Comments:      "Comments",
  Comment:       "Comment",
  // Quantity Link specifics
  Description:   "Description",
  Formula:       "Formula",
  Total:         "Total",
  UnitPrice:     "Unit Price",
  ExtPrice:      "Extended Price",
  Unit:          "Unit",
  Quantity:      "Quantity",
};

/**
 * Detect if buffer/text is Bluebeam XML
 * @param {ArrayBuffer|string} input
 * @returns {boolean}
 */
export function isBluebeamXml(input) {
  const text = typeof input === "string"
    ? input.slice(0, 500)
    : new TextDecoder("utf-8").decode(new Uint8Array(input, 0, Math.min(500, input.byteLength)));

  // Check for XML declaration + Bluebeam-specific root elements
  if (!text.includes("<?xml") && !text.includes("<Markup") && !text.includes("<Summary")) return false;

  return (
    text.includes("Bluebeam") ||
    text.includes("<Markup") ||
    text.includes("<MarkupList") ||
    text.includes("<QuantityLink") ||
    text.includes("<Summary") ||
    text.includes("<Session")
  );
}

/**
 * Parse Bluebeam XML into { headers, rows } format
 * @param {ArrayBuffer|string} input
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseBluebeamXml(input) {
  try {
    const xmlText = typeof input === "string"
      ? input
      : new TextDecoder("utf-8").decode(input);

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");

    // Check for parse errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      console.error("[bluebeamXmlParser] XML parse error:", parseError.textContent);
      return { headers: [], rows: [] };
    }

    // ── Strategy 1: Find <Markup> elements (most common export) ──
    let elements = doc.querySelectorAll("Markup");

    // ── Strategy 2: Try <Row> elements (Quantity Link / tabular) ──
    if (elements.length === 0) {
      elements = doc.querySelectorAll("Row");
    }

    // ── Strategy 3: Try any repeated child of the root element ──
    if (elements.length === 0) {
      const root = doc.documentElement;
      if (root.children.length > 0) {
        // Find the most common child tag name (likely the data rows)
        const tagCounts = {};
        for (const child of root.children) {
          tagCounts[child.tagName] = (tagCounts[child.tagName] || 0) + 1;
        }
        const dataTag = Object.entries(tagCounts)
          .sort(([, a], [, b]) => b - a)[0]?.[0];

        if (dataTag && tagCounts[dataTag] > 1) {
          elements = doc.querySelectorAll(dataTag);
        }
      }
    }

    if (elements.length === 0) {
      return { headers: [], rows: [] };
    }

    // ── Collect all unique attribute names across all elements ──
    const attrSet = new Set();
    for (const el of elements) {
      for (const attr of el.attributes) {
        attrSet.add(attr.name);
      }
      // Also check child elements as some formats nest data in child tags
      for (const child of el.children) {
        attrSet.add(child.tagName);
      }
    }

    // ── Build ordered headers (known fields first, then unknowns) ──
    const knownOrder = Object.keys(FIELD_MAP);
    const attrList = Array.from(attrSet);
    const headers = [];
    const attrKeys = [];

    // Known fields first (in our preferred order)
    for (const key of knownOrder) {
      if (attrList.includes(key)) {
        headers.push(FIELD_MAP[key] || key);
        attrKeys.push(key);
      }
    }

    // Unknown fields after
    for (const key of attrList) {
      if (!attrKeys.includes(key)) {
        headers.push(key);
        attrKeys.push(key);
      }
    }

    // ── Extract rows ──
    const rows = [];
    for (const el of elements) {
      const row = attrKeys.map(key => {
        // Try attribute first
        const attrVal = el.getAttribute(key);
        if (attrVal !== null) return attrVal;

        // Try child element text content
        const child = el.querySelector(key);
        if (child) return child.textContent?.trim() || "";

        return "";
      });

      // Skip completely empty rows
      if (row.some(cell => cell.trim() !== "")) {
        rows.push(row);
      }
    }

    return { headers, rows };
  } catch (err) {
    console.error("[bluebeamXmlParser] Failed to parse:", err);
    return { headers: [], rows: [] };
  }
}
