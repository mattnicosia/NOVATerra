/**
 * NOVA Orchestrator — Routes tasks to specialized sub-agents
 *
 * Each sub-agent has:
 *   1. A knowledge document (markdown, imported as ?raw)
 *   2. A system prompt persona
 *   3. Domain-specific context injection
 *
 * The orchestrator decides which agent(s) to invoke based on the task,
 * injects the right knowledge, and chains outputs between agents.
 *
 * Agents:
 *   plans  — Drawing reading, schedule parsing, notes extraction, mark counting
 *   cost   — CSI divisions, $/SF pricing, scope gaps, ROM generation
 *   specs  — Specification interpretation, cost-impacting clauses
 *   field  — Means & methods, sequencing, crew productivity, equipment
 *   market — Regional cost indices, labor rates, union/open-shop, regulatory factors
 */

import { novaPlans } from "./agents/plans";
import { novaCost } from "./agents/cost";
import { novaSpecs } from "./agents/specs";
import { novaField } from "./agents/field";
import { novaMarket } from "./agents/market";

// ── Agent Registry ──────────────────────────────────────────────

const AGENTS = {
  plans: novaPlans,
  cost: novaCost,
  specs: novaSpecs,
  field: novaField,
  market: novaMarket,
};

/**
 * Get a specific agent by name
 * @param {"plans"|"cost"|"specs"|"field"|"market"} name
 * @returns {object} Agent with { systemPrompt(), getKnowledge() }
 */
export function getAgent(name) {
  return AGENTS[name] || null;
}

/**
 * Get the system prompt for an agent, including its knowledge base
 * @param {"plans"|"cost"|"specs"|"field"|"market"} agentName
 * @param {object} [context] - Additional context (project type, firm, location, etc.)
 * @returns {string} Complete system prompt
 */
export function getSystemPrompt(agentName, context = {}) {
  const agent = AGENTS[agentName];
  if (!agent) return "";
  return agent.systemPrompt(context);
}

/**
 * Build knowledge context for injection into a prompt
 * @param {"plans"|"cost"|"specs"|"field"|"market"} agentName
 * @param {string} section - Which section of knowledge to include
 * @param {object} [context] - Additional context
 * @returns {string} Knowledge context block
 */
export function getKnowledge(agentName, section, context = {}) {
  const agent = AGENTS[agentName];
  if (!agent) return "";
  return agent.getKnowledge(section, context);
}

/**
 * Route a task to the appropriate agent(s)
 * @param {string} taskType
 * @returns {string[]} Ordered list of agent names to invoke
 */
export function routeTask(taskType) {
  switch (taskType) {
    // Drawing analysis tasks
    case "schedule-detection":
    case "schedule-parse":
    case "notes-extract":
    case "title-block":
    case "mark-counting":
      return ["plans"];

    // Cost estimation tasks
    case "rom-augment":
      return ["plans", "cost", "market"];
    case "cost-validation":
      return ["cost", "market"];
    case "scope-gap-check":
      return ["cost", "specs"];

    // Spec analysis tasks
    case "scope-analysis":
      return ["plans", "specs"];
    case "spec-review":
      return ["specs"];

    // Field / sequencing tasks
    case "schedule-duration":
    case "sequencing":
      return ["field"];
    case "crew-estimate":
      return ["field", "cost"];

    // Regional analysis tasks
    case "regional-adjustment":
      return ["market"];
    case "full-estimate":
      return ["plans", "cost", "specs", "field", "market"];

    default:
      return ["plans"];
  }
}

/**
 * Get all registered agent names
 * @returns {string[]}
 */
export function getAgentNames() {
  return Object.keys(AGENTS);
}

export default { getAgent, getSystemPrompt, getKnowledge, routeTask, getAgentNames };
