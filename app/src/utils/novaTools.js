// NOVA Tool Definitions & Executor
// Enables NOVA AI to modify the estimate via Anthropic tool use API

import { useItemsStore } from '@/stores/itemsStore';
import { useProjectStore } from '@/stores/projectStore';
import { autoTradeFromCode } from '@/constants/tradeGroupings';
import { nn } from '@/utils/format';

// ── Tool Definitions (Anthropic tool use schema) ──────────────────────

export const NOVA_TOOLS = [
  {
    name: "update_line_items",
    description: "Update one or more existing line items in the estimate. Use this when the user asks to change prices, quantities, units, descriptions, or other cost fields on items. You must reference items by their ID (shown in project context as [id:xxx]).",
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
              description: { type: "string", description: "New description text" },
              material: { type: "number", description: "New material unit cost" },
              labor: { type: "number", description: "New labor unit cost" },
              equipment: { type: "number", description: "New equipment unit cost" },
              subcontractor: { type: "number", description: "New subcontractor unit cost" },
              quantity: { type: "number", description: "New quantity" },
              unit: { type: "string", description: "New unit of measure (EA, SF, LF, etc.)" },
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
    description: "Add new line items to the estimate. Use when the user asks to add scope items, pricing, or new line items. Include as much detail as possible: code, description, division, quantity, unit, and cost fields.",
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
              quantity: { type: "number", description: "Quantity (default 1)" },
              unit: { type: "string", description: "Unit of measure (EA, SF, LF, CY, etc.)" },
              material: { type: "number", description: "Material unit cost" },
              labor: { type: "number", description: "Labor unit cost" },
              equipment: { type: "number", description: "Equipment unit cost" },
              subcontractor: { type: "number", description: "Subcontractor unit cost" },
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
    description: "Remove line items from the estimate by ID. Use when the user explicitly asks to delete or remove specific items. Always confirm with the user before removing items.",
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
      const { updates } = toolInput;
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
        const allFields = ["description", ...costFields, "quantity", "unit"];

        for (const f of allFields) {
          if (upd[f] === undefined) continue;
          let val = upd[f];
          // Validate costs — clamp negatives to 0
          if (costFields.includes(f)) val = clampCost(val);
          // Validate quantity — clamp negatives to 0
          if (f === "quantity") val = clampQty(val);
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
        store.batchUpdateItem(upd.item_id, changes);
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
      const { items: newItems } = toolInput;
      const results = [];

      for (const ni of newItems) {
        if (!ni.description) {
          results.push({ status: "skipped", message: "Missing description" });
          continue;
        }

        const division = ni.division || divFromCode(ni.code) || "";
        store.addElement(division, {
          code: ni.code || "",
          name: ni.description,
          unit: ni.unit || "EA",
          material: clampCost(ni.material),
          labor: clampCost(ni.labor),
          equipment: clampCost(ni.equipment),
          subcontractor: clampCost(ni.subcontractor),
          quantity: clampQty(ni.quantity) || 1,
          trade: autoTradeFromCode(ni.code) || "",
        });

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
      const { item_ids } = toolInput;
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
