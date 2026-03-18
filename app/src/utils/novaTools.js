// NOVA Tool Definitions & Executor
// Enables NOVA AI to modify the estimate via Anthropic tool use API

import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { autoTradeFromCode } from "@/constants/tradeGroupings";
import { nn } from "@/utils/format";

// ── Tool Definitions (Anthropic tool use schema) ──────────────────────

export const NOVA_TOOLS = [
  {
    name: "update_line_items",
    description:
      "Update one or more existing line items in the estimate. Use this when the user asks to change ANY field on items — prices, quantities, units, descriptions, CSI codes, divisions, trades, notes, spec references, drawing references, bid context, or any other property. You must reference items by their ID (shown in project context as [id:xxx]).",
    input_schema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          description: "Array of item updates. Each must include item_id and at least one field to change.",
          items: {
            type: "object",
            properties: {
              item_id: { type: "string", description: "The item ID to update (from project context)" },
              code: { type: "string", description: "CSI code (e.g., '03.300', '08.110')" },
              description: { type: "string", description: "New description text" },
              division: { type: "string", description: "Division label (e.g., '03 - Concrete', '08 - Openings')" },
              trade: { type: "string", description: "Trade assignment (e.g., 'Concrete', 'Electrical')" },
              material: { type: "number", description: "New material unit cost" },
              labor: { type: "number", description: "New labor unit cost" },
              equipment: { type: "number", description: "New equipment unit cost" },
              subcontractor: { type: "number", description: "New subcontractor unit cost" },
              quantity: { type: "number", description: "New quantity" },
              unit: { type: "string", description: "New unit of measure (EA, SF, LF, CY, etc.)" },
              notes: { type: "string", description: "Item notes" },
              drawingRef: { type: "string", description: "Drawing sheet reference" },
              specSection: { type: "string", description: "Specification section reference" },
              specText: { type: "string", description: "Specification text" },
              bidContext: {
                type: "string",
                description: "Bid context: 'base', 'alternate', 'unit-price', 'allowance'",
              },
            },
            required: ["item_id"],
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "add_line_items",
    description:
      "Add new line items to the estimate. Use when the user asks to add scope items, pricing, or new line items. Include as much detail as possible: code, description, division, quantity, unit, trade, and cost fields.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Array of new items to add",
          items: {
            type: "object",
            properties: {
              code: { type: "string", description: "CSI code (e.g., '08.110', '03.300')" },
              description: { type: "string", description: "Item description" },
              division: { type: "string", description: "Division label (e.g., '08 - Openings')" },
              trade: { type: "string", description: "Trade assignment (e.g., 'Concrete', 'Electrical')" },
              quantity: { type: "number", description: "Quantity (default 1)" },
              unit: { type: "string", description: "Unit of measure (EA, SF, LF, CY, etc.)" },
              material: { type: "number", description: "Material unit cost" },
              labor: { type: "number", description: "Labor unit cost" },
              equipment: { type: "number", description: "Equipment unit cost" },
              subcontractor: { type: "number", description: "Subcontractor unit cost" },
              notes: { type: "string", description: "Item notes" },
              drawingRef: { type: "string", description: "Drawing sheet reference" },
              specSection: { type: "string", description: "Specification section reference" },
              bidContext: {
                type: "string",
                description: "Bid context: 'base', 'alternate', 'unit-price', 'allowance'",
              },
            },
            required: ["description"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "remove_line_items",
    description:
      "Remove line items from the estimate by ID. Use when the user explicitly asks to delete or remove specific items. Always confirm with the user before removing items.",
    input_schema: {
      type: "object",
      properties: {
        item_ids: {
          type: "array",
          description: "Array of item IDs to remove",
          items: { type: "string" },
        },
      },
      required: ["item_ids"],
    },
  },
];

// ── Preview — returns structured proposal data without executing ──────

export function previewNovaTool(toolName, toolInput) {
  const store = useItemsStore.getState();
  const projectStore = useProjectStore.getState();
  const divFromCode = projectStore.divFromCode;

  switch (toolName) {
    case "add_line_items": {
      const rawItems = toolInput?.items;
      const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
      return items
        .filter(ni => ni.description)
        .map(ni => ({
          type: "add",
          description: ni.description,
          code: ni.code || "",
          division: ni.division || divFromCode(ni.code) || "",
          quantity: nn(ni.quantity) || 1,
          unit: ni.unit || "EA",
          material: nn(ni.material),
          labor: nn(ni.labor),
          equipment: nn(ni.equipment),
          subcontractor: nn(ni.subcontractor),
          specSection: ni.specSection || "",
          notes: ni.notes || "",
          _raw: ni,
        }));
    }
    case "update_line_items": {
      const rawUpdates = toolInput?.updates;
      const updates = Array.isArray(rawUpdates) ? rawUpdates : rawUpdates ? [rawUpdates] : [];
      return updates
        .map(upd => {
          const item = store.items.find(i => i.id === upd.item_id);
          if (!item) return { type: "update", itemId: upd.item_id, notFound: true, _raw: upd };
          const changes = {};
          const costFields = ["material", "labor", "equipment", "subcontractor"];
          const stringFields = [
            "code",
            "description",
            "division",
            "trade",
            "unit",
            "notes",
            "drawingRef",
            "specSection",
            "specText",
            "bidContext",
          ];
          for (const f of [...stringFields, ...costFields, "quantity"]) {
            if (upd[f] === undefined) continue;
            let val = upd[f];
            if (costFields.includes(f)) val = clampCost(val);
            if (f === "quantity") val = clampQty(val);
            if (val !== item[f]) changes[f] = { before: item[f], after: val };
          }
          return {
            type: "update",
            itemId: upd.item_id,
            description: item.description,
            code: item.code,
            changes,
            _raw: upd,
          };
        })
        .filter(p => !p.notFound && Object.keys(p.changes || {}).length > 0);
    }
    case "remove_line_items": {
      const rawIds = toolInput?.item_ids;
      const ids = Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [];
      return [...new Set(ids)]
        .map(id => {
          const item = store.items.find(i => i.id === id);
          return item ? { type: "remove", itemId: id, description: item.description, code: item.code } : null;
        })
        .filter(Boolean);
    }
    default:
      return [];
  }
}

// ── Validation Helpers ────────────────────────────────────────────────

function clampCost(v) {
  const n = nn(v);
  return n < 0 ? 0 : n;
}

function clampQty(v) {
  const n = nn(v);
  return n < 0 ? 0 : n;
}

// ── Tool Executor ─────────────────────────────────────────────────────

export function executeNovaTool(toolName, toolInput) {
  const store = useItemsStore.getState();
  const projectStore = useProjectStore.getState();
  const divFromCode = projectStore.divFromCode;

  switch (toolName) {
    case "update_line_items": {
      const rawUpdates = toolInput?.updates;
      const updates = Array.isArray(rawUpdates) ? rawUpdates : rawUpdates ? [rawUpdates] : [];
      const results = [];
      let changeCount = 0;

      for (const upd of updates) {
        const item = store.items.find(i => i.id === upd.item_id);
        if (!item) {
          results.push({ item_id: upd.item_id, status: "not_found", message: `Item ${upd.item_id} not found` });
          continue;
        }

        // Build validated changes object
        const changes = {};
        const before = {};
        const costFields = ["material", "labor", "equipment", "subcontractor"];
        const stringFields = [
          "code",
          "description",
          "division",
          "trade",
          "unit",
          "notes",
          "drawingRef",
          "specSection",
          "specText",
          "bidContext",
        ];
        const allFields = [...stringFields, ...costFields, "quantity"];

        for (const f of allFields) {
          if (upd[f] === undefined) continue;
          let val = upd[f];
          // Validate costs — clamp negatives to 0
          if (costFields.includes(f)) val = clampCost(val);
          // Validate quantity — clamp negatives to 0
          if (f === "quantity") val = clampQty(val);
          // Auto-derive division + trade from code when code changes and they aren't explicitly set
          if (f === "code") {
            if (!upd.division) {
              const derivedDiv = divFromCode(val);
              if (derivedDiv && derivedDiv !== item.division) {
                before.division = item.division;
                changes.division = derivedDiv;
              }
            }
            if (!upd.trade) {
              const derivedTrade = autoTradeFromCode(val);
              if (derivedTrade && derivedTrade !== item.trade) {
                before.trade = item.trade;
                changes.trade = derivedTrade;
              }
            }
          }
          // Only record if actually different
          if (val !== item[f]) {
            before[f] = item[f];
            changes[f] = val;
          }
        }

        if (Object.keys(changes).length === 0) {
          results.push({ item_id: upd.item_id, status: "no_change", description: item.description });
          continue;
        }

        // Use batch update — applies all fields at once, recalculates directive once
        // Include source + novaProposed when flagged (from approval queue)
        const batchFields = { ...changes };
        if (upd._novaProposed !== undefined) batchFields.novaProposed = upd._novaProposed;
        if (upd._source) batchFields.source = upd._source;
        store.batchUpdateItem(upd.item_id, batchFields);
        changeCount++;

        results.push({
          item_id: upd.item_id,
          status: "updated",
          description: item.description,
          before,
          after: changes,
        });
      }

      return {
        success: true,
        action: "update_line_items",
        message: `Updated ${changeCount} item${changeCount !== 1 ? "s" : ""}`,
        results,
      };
    }

    case "add_line_items": {
      const rawItems = toolInput?.items;
      const newItems = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
      const results = [];

      for (const ni of newItems) {
        if (!ni.description) {
          results.push({ status: "skipped", message: "Missing description" });
          continue;
        }

        const division = ni.division || divFromCode(ni.code) || "";
        store.addElement(
          division,
          {
            code: ni.code || "",
            name: ni.description,
            unit: ni.unit || "EA",
            material: clampCost(ni.material),
            labor: clampCost(ni.labor),
            equipment: clampCost(ni.equipment),
            subcontractor: clampCost(ni.subcontractor),
            quantity: clampQty(ni.quantity) || 1,
            trade: ni.trade || autoTradeFromCode(ni.code) || "",
            notes: ni.notes || "",
            drawingRef: ni.drawingRef || "",
            specSection: ni.specSection || "",
            source: ni._source || { category: "nova", label: "NOVA" },
            novaProposed: ni._novaProposed !== undefined ? ni._novaProposed : true,
          },
          ni.bidContext || "base",
        );

        results.push({
          status: "added",
          description: ni.description,
          division,
          code: ni.code || "",
        });
      }

      return {
        success: true,
        action: "add_line_items",
        message: `Added ${results.filter(r => r.status === "added").length} item${results.length !== 1 ? "s" : ""}`,
        results,
      };
    }

    case "remove_line_items": {
      const rawIds = toolInput?.item_ids;
      const item_ids = Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [];
      // Deduplicate IDs
      const uniqueIds = [...new Set(item_ids)];
      const results = [];

      for (const id of uniqueIds) {
        const item = store.items.find(i => i.id === id);
        if (!item) {
          results.push({ item_id: id, status: "not_found" });
          continue;
        }
        store.removeItem(id);
        results.push({ item_id: id, status: "removed", description: item.description });
      }

      const removedCount = results.filter(r => r.status === "removed").length;
      return {
        success: true,
        action: "remove_line_items",
        message: `Removed ${removedCount} item${removedCount !== 1 ? "s" : ""}`,
        results,
      };
    }

    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}
