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
 */

import { novaPlans } from "./agents/plans";
import { novaCost } from "./agents/cost";
import { novaSpecs } from "./agents/specs";

// ── Agent Registry ──────────────────────────────────────────────

const AGENTS = {
  plans: novaPlans,
  cost: novaCost,
  specs: novaSpecs,
  // Future: scope, field, market
};

/**
 * Get a specific agent by name
 * @param {"plans"|"cost"|"specs"} name
 * @returns {object} Agent with { systemPrompt(), buildContext() }
 */
export function getAgent(name) {
  return AGENTS[name] || null;
}

/**
 * Get the system prompt for an agent, including its knowledge base
 * @param {"plans"|"cost"|"specs"} agentName
 * @param {object} [context] - Additional context (project type, firm, etc.)
 * @returns {string} Complete system prompt
 */
export function getSystemPrompt(agentName, context = {}) {
  const agent = AGENTS[agentName];
  if (!agent) return "";
  return agent.systemPrompt(context);
}

/**
 * Build knowledge context for injection into a prompt
 * @param {"plans"|"cost"|"specs"} agentName
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
 * @param {string} taskType - e.g., "schedule-detection", "schedule-parse", "notes-extract", "rom-augment"
 * @returns {string[]} Ordered list of agent names to invoke
 */
export function routeTask(taskType) {
  switch (taskType) {
    case "schedule-detection":
    case "schedule-parse":
    case "notes-extract":
    case "title-block":
    case "mark-counting":
      return ["plans"];

    case "rom-augment":
      return ["plans", "cost"];

    case "scope-analysis":
      return ["plans", "specs"];

    default:
      return ["plans"];
  }
}

export default { getAgent, getSystemPrompt, getKnowledge, routeTask };
