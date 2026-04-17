// NOVA Tool Definitions & Executor
// Enables NOVA AI to modify the estimate via Anthropic tool use API

import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { autoTradeFromCode } from "@/constants/tradeGroupings";
import { nn } from "@/utils/format";
import { runSubagent, SPECIALISTS } from "@/utils/novaSubagents";

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
  {
    name: "search_cost_database",
    description:
      "Search the cost database for materials, assemblies, and elements by description or CSI code. Returns matching items with unit costs.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (material name, CSI code, or description)" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_proposals",
    description:
      "Search historical proposals and cost data for similar projects. Returns matching proposals with $/SF benchmarks.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (project type, building description, or trade)" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "calculate_totals",
    description:
      "Calculate current estimate totals grouped by division, trade, or bid context. Returns cost breakdowns with $/SF.",
    input_schema: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: ["division", "trade", "bid_context"],
          description: "How to group the totals (default: division)",
        },
      },
      required: [],
    },
  },
  {
    name: "query_project_info",
    description:
      "Get current project metadata, scan results, and ROM data.",
    input_schema: {
      type: "object",
      properties: {
        include: {
          type: "array",
          items: { type: "string" },
          description: "Fields to include: 'project', 'rom', 'scan', 'schedules'. Default: all",
        },
      },
      required: [],
    },
  },
  {
    name: "search_specs",
    description:
      "Search the user's indexed SPEC BOOKS for relevant spec section language. Use this when the user asks about specific CSI sections (e.g., 'what does 09 21 16 require?'), material requirements, submittal requirements, or anything that would be written in a project specification. Also use when setting up a line item and you need to cite the spec section. Returns matching spec chunks with section number, title, page range, and text content. Prefer THIS over search_cost_database when the user asks about requirements vs pricing.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural language search. Can be a CSI code ('09 21 16'), a material ('gypsum board type X'), or a requirement ('submittal for concrete mix design').",
        },
        section: {
          type: "string",
          description: "Optional: filter to a specific CSI section number like '09 21 16'",
        },
        division: {
          type: "string",
          description: "Optional: filter to a specific division like '09' or '03'",
        },
        limit: { type: "number", description: "Max results (default 5, cap 15)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_my_history",
    description:
      "Search the user's PAST ESTIMATES AND LINE ITEMS across every project they've ever estimated. Use this for questions like 'what did I pay for framing on the last 5 projects?', 'show me my historical $/SF for office buildouts', 'have I estimated this before?'. Returns matching line items (with project context, unit costs, quantities) and/or estimate-level rollups (with total cost, $/SF, building type). This is the user's own private history, not generic cost data.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural-language search. Be specific: 'steel stud framing 5/8\" gyp' beats 'framing'. Include building type or trade if relevant.",
        },
        scope: {
          type: "string",
          enum: ["items", "estimates", "both"],
          description:
            "'items' = individual line items, 'estimates' = project-level rollups, 'both' = mix. Default 'both'.",
        },
        limit: { type: "number", description: "Max results per scope (default 8, cap 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "consult_specialist",
    description:
      "Delegate a sub-question to a specialist sub-agent with its own extended thinking budget and focused prompt. Use this when a query requires deep analysis in one domain (cost benchmarking, scope completeness, or drawing interpretation) rather than direct action. You can call this tool MULTIPLE times in parallel in a single turn — the specialists will think simultaneously and their results are synthesized together. Do NOT use for simple lookups, direct actions, or questions already answerable from the estimate context.",
    input_schema: {
      type: "object",
      properties: {
        specialist: {
          type: "string",
          enum: ["cost", "scope", "plans"],
          description:
            "Which specialist to consult. 'cost' = NOVA-Cost (unit pricing, $/SF benchmarks, historical data). 'scope' = NOVA-Scope (CSI division coverage, scope gaps, completeness). 'plans' = NOVA-Plans (drawing interpretation — requires PDFs attached to the current user message).",
        },
        query: {
          type: "string",
          description:
            "The focused sub-question to send to the specialist. Phrase it clearly and include any item IDs, sheet numbers, or specific scope in question. The specialist sees the full estimate context automatically — you don't need to restate it.",
        },
      },
      required: ["specialist", "query"],
    },
  },
  {
    name: "filter_takeoff_suggestions",
    description:
      "Filter the auto-generated takeoff suggestions. Use when the user asks to narrow down, keep only certain items, or remove items from the auto-takeoff list. Modifies the pending suggestions before they are added to the estimate.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["keep_only", "remove", "keep_divisions", "remove_divisions"],
          description:
            "keep_only: keep items matching criteria. remove: remove items matching criteria. keep_divisions: keep only specified CSI divisions. remove_divisions: remove specified CSI divisions.",
        },
        criteria: {
          type: "string",
          description:
            "For keep_only/remove: text to match against item descriptions (case-insensitive). For keep_divisions/remove_divisions: comma-separated CSI division codes like '09,22,23'",
        },
      },
      required: ["action", "criteria"],
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

export async function executeNovaTool(toolName, toolInput) {
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

    case "search_cost_database": {
      const { searchSimilar } = await import("@/utils/vectorSearch");
      const { results } = await searchSimilar(toolInput.query, {
        kinds: ['seed_element', 'user_element', 'assembly'],
        limit: toolInput.limit || 5,
        threshold: 0.3,
      });
      return {
        success: true,
        action: "search_cost_database",
        results: results.map(r => ({
          content: r.content,
          kind: r.kind,
          similarity: r.similarity,
          ...r.metadata,
        })),
      };
    }

    case "search_proposals": {
      const { searchSimilar } = await import("@/utils/vectorSearch");
      const { results } = await searchSimilar(toolInput.query, {
        kinds: ['proposal'],
        limit: toolInput.limit || 5,
        threshold: 0.3,
      });
      return {
        success: true,
        action: "search_proposals",
        results: results.map(r => ({
          content: r.content,
          similarity: r.similarity,
          ...r.metadata,
        })),
      };
    }

    case "calculate_totals": {
      const items = store.items;
      const project = projectStore.project;
      const sf = parseFloat(project?.buildingSF) || 0;
      const groupBy = toolInput.group_by || 'division';

      const groups = {};
      for (const item of items) {
        const key = item[groupBy] || item.divisionCode || 'Unassigned';
        if (!groups[key]) groups[key] = { items: 0, totalCost: 0 };
        groups[key].items++;
        const cost = store.getItemTotal?.(item.id) || 0;
        groups[key].totalCost += cost;
      }

      const grandTotal = Object.values(groups).reduce((s, g) => s + g.totalCost, 0);
      return {
        success: true,
        action: "calculate_totals",
        groups: Object.entries(groups).map(([key, g]) => ({
          [groupBy]: key,
          itemCount: g.items,
          totalCost: Math.round(g.totalCost),
          perSF: sf > 0 ? Math.round(g.totalCost / sf * 100) / 100 : null,
        })).sort((a, b) => b.totalCost - a.totalCost),
        grandTotal: Math.round(grandTotal),
        perSF: sf > 0 ? Math.round(grandTotal / sf * 100) / 100 : null,
        itemCount: items.length,
        buildingSF: sf || 'not set',
      };
    }

    case "query_project_info": {
      const { useDrawingPipelineStore } = await import("@/stores/drawingPipelineStore");
      const include = toolInput.include || ['project', 'rom', 'scan', 'schedules'];
      const result = {};

      if (include.includes('project')) {
        const project = projectStore.project;
        result.project = {
          name: project?.name, client: project?.client, location: project?.location,
          buildingSF: project?.buildingSF, jobType: project?.jobType,
          buildingType: project?.buildingType, bidDue: project?.bidDue,
        };
      }
      if (include.includes('rom')) {
        const scanResults = useDrawingPipelineStore.getState().scanResults;
        const rom = scanResults?.rom;
        if (rom?.totals) {
          result.rom = {
            totals: rom.totals,
            divisionCount: Object.keys(rom.divisions || {}).length,
            verified: rom._verificationResult || null,
          };
        }
      }
      if (include.includes('scan')) {
        const scanResults = useDrawingPipelineStore.getState().scanResults;
        result.scan = {
          hasResults: !!scanResults,
          drawingCount: useDrawingPipelineStore.getState().drawings.length,
          schedulesDetected: scanResults?.schedules?.length || 0,
          notesExtracted: scanResults?.notes?.length || 0,
        };
      }
      if (include.includes('schedules')) {
        const scanResults = useDrawingPipelineStore.getState().scanResults;
        result.schedules = (scanResults?.schedules || []).map(s => ({
          type: s.type, entryCount: s.entries?.length || 0, sheetLabel: s.sheetLabel,
        }));
      }
      return { success: true, action: "query_project_info", ...result };
    }

    case "search_specs": {
      const { searchSimilar } = await import("@/utils/vectorSearch");
      const { query, section, division, limit: rawLimit } = toolInput || {};
      const limit = Math.min(15, Math.max(1, parseInt(rawLimit, 10) || 5));
      if (!query) return { success: false, message: "query required" };

      // Run vector search first, then filter client-side by section/division if provided.
      const { results } = await searchSimilar(query, {
        kinds: ["spec"],
        limit: limit * 3, // over-fetch so filter has results
        threshold: 0.2,
      });

      let filtered = results || [];
      if (section) {
        const normSec = String(section).replace(/\s/g, "");
        filtered = filtered.filter(r => (r.metadata?.sectionNumber || "").replace(/\s/g, "") === normSec);
      }
      if (division) {
        const divCode = String(division).match(/^\d{2}/)?.[0];
        if (divCode) {
          filtered = filtered.filter(r => (r.metadata?.sectionNumber || "").trim().startsWith(divCode));
        }
      }
      filtered = filtered.slice(0, limit);

      const shaped = filtered.map(r => {
        const m = r.metadata || {};
        return {
          specBook: m.specBookName,
          section: m.sectionNumber,
          title: m.sectionTitle,
          division: m.division,
          pages: m.pageStart && m.pageEnd ? `${m.pageStart}-${m.pageEnd}` : null,
          part: m.partNumber || null,
          similarity: Number(r.similarity?.toFixed?.(3) || 0),
          excerpt: (r.content || "").slice(0, 1200),
        };
      });

      return {
        success: true,
        action: "search_specs",
        query,
        count: shaped.length,
        results: shaped,
      };
    }

    case "search_my_history": {
      const { searchSimilar } = await import("@/utils/vectorSearch");
      const { query, scope = "both", limit: rawLimit } = toolInput || {};
      const limit = Math.min(20, Math.max(1, parseInt(rawLimit, 10) || 8));
      if (!query) return { success: false, message: "query required" };

      const kinds = scope === "items" ? ["estimate_item"]
                  : scope === "estimates" ? ["user_estimate"]
                  : ["estimate_item", "user_estimate"];

      const { results } = await searchSimilar(query, { kinds, limit, threshold: 0.25 });

      // Shape results for the LLM: surface the useful metadata inline
      const shaped = (results || []).map(r => {
        const m = r.metadata || {};
        if (r.kind === "user_estimate") {
          return {
            type: "estimate",
            project: m.projectName,
            buildingType: m.buildingType,
            projectSF: m.projectSF,
            totalCost: m.totalCost,
            perSF: m.perSF,
            itemCount: m.itemCount,
            estimateId: m.estimateId,
            similarity: Number(r.similarity?.toFixed?.(3) || 0),
            summary: r.content,
          };
        }
        return {
          type: "item",
          project: m.projectName,
          buildingType: m.buildingType,
          description: m.description,
          code: m.code,
          division: m.division,
          trade: m.trade,
          unit: m.unit,
          quantity: m.quantity,
          unitCost: m.unitCost,
          lineTotal: m.lineTotal,
          estimateId: m.estimateId,
          similarity: Number(r.similarity?.toFixed?.(3) || 0),
        };
      });

      return {
        success: true,
        action: "search_my_history",
        query,
        scope,
        count: shaped.length,
        results: shaped,
      };
    }

    case "consult_specialist": {
      const { specialist, query } = toolInput || {};
      if (!specialist || !SPECIALISTS[specialist]) {
        return {
          success: false,
          action: "consult_specialist",
          message: `Unknown specialist: ${specialist}. Valid: ${Object.keys(SPECIALISTS).join(", ")}`,
        };
      }
      // Read attached PDFs from a short-lived registry populated by NovaChatPanel
      // before the tool loop runs (the main agent's user message blocks).
      const pdfs = globalThis.__novaPendingPdfs || [];
      const result = await runSubagent(specialist, query, pdfs);
      return {
        success: !result.error,
        action: "consult_specialist",
        specialist,
        label: result.label,
        text: result.text,
        toolCalls: result.toolCalls || [],
        error: result.error || undefined,
      };
    }

    case "filter_takeoff_suggestions": {
      const { action, criteria } = toolInput;
      const { useDrawingPipelineStore } = await import("@/stores/drawingPipelineStore");
      const { useUiStore } = await import("@/stores/uiStore");
      const { generateTakeoffSuggestions } = await import("@/nova/predictive/generateSuggestions");
      const scanResults = useDrawingPipelineStore.getState().scanResults;
      if (!scanResults) return { success: false, message: "No scan results available. Run a plan scan first." };

      const suggestions = generateTakeoffSuggestions(scanResults);
      if (!suggestions.length) return { success: false, message: "No takeoff suggestions generated from scan data." };

      let kept = [];
      let removed = [];
      const lowerCriteria = criteria.toLowerCase();

      switch (action) {
        case "keep_only":
          kept = suggestions.filter(s => s.description.toLowerCase().includes(lowerCriteria));
          removed = suggestions.filter(s => !s.description.toLowerCase().includes(lowerCriteria));
          break;
        case "remove":
          kept = suggestions.filter(s => !s.description.toLowerCase().includes(lowerCriteria));
          removed = suggestions.filter(s => s.description.toLowerCase().includes(lowerCriteria));
          break;
        case "keep_divisions": {
          const divs = criteria.split(",").map(d => d.trim());
          kept = suggestions.filter(s => divs.some(d => s.code?.startsWith(d)));
          removed = suggestions.filter(s => !divs.some(d => s.code?.startsWith(d)));
          break;
        }
        case "remove_divisions": {
          const divs = criteria.split(",").map(d => d.trim());
          kept = suggestions.filter(s => !divs.some(d => s.code?.startsWith(d)));
          removed = suggestions.filter(s => divs.some(d => s.code?.startsWith(d)));
          break;
        }
        default:
          return { success: false, message: `Unknown action: ${action}` };
      }

      // Store filtered suggestions in uiStore for AutoTakeoffModal to pick up
      useUiStore.getState().setFilteredSuggestions(kept);

      return {
        success: true,
        action: "filter_takeoff_suggestions",
        message: `Filtered: ${kept.length} items kept, ${removed.length} removed. ${
          action === "keep_only" || action === "keep_divisions"
            ? `Keeping items matching "${criteria}"`
            : `Removed items matching "${criteria}"`
        }`,
        kept: kept.length,
        removed: removed.length,
        keptSummary: kept.slice(0, 8).map(s => ({ code: s.code, desc: s.description.slice(0, 60) })),
      };
    }

    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}
