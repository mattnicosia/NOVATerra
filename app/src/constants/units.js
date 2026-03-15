export const UNITS = ["SF","LF","SY","CY","EA","HR","LS","TON","LB","GAL","DAY","WK","MO","CF","BD FT","SQRE","MSF","VLF","PAIR","SET","BAG","BOX","ROLL","PALLET","MBF","CLF","BATH"];

export const BASE_UNITS = ["EA", "SF", "LF"];

// Dynamic conversions — keyed by base unit
// Each entry: { label, target, formula, vars: [{ key, value }] }
export const CONVERSIONS = {
  LF: [
    { label: "LF \u2192 SF", target: "SF", formula: "Qty * Height", vars: [{ key: "Height", value: 8 }] },
    { label: "LF \u2192 CY", target: "CY", formula: "Qty * Height * Width / 12 / 27", vars: [{ key: "Height", value: 8 }, { key: "Width", value: 12 }] },
  ],
  SF: [
    { label: "SF \u2192 SY", target: "SY", formula: "Qty / 9", vars: [] },
    { label: "SF \u2192 CY", target: "CY", formula: "Qty * Depth / 12 / 27", vars: [{ key: "Depth", value: 4 }] },
  ],
};
