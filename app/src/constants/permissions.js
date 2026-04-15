/**
 * Permission system constants and resolution logic.
 *
 * STACK-style: 4 preset roles + 7 individually toggleable permissions per user.
 * Admin picks a preset, optionally flips individual toggles.
 *
 * Resolution order: role defaults → org template overrides → per-user JSONB overrides.
 */

// ── Permission Keys ──────────────────────────────────────────────────
export const PERMISSION_KEYS = {
  ESTIMATE_VISIBILITY: "estimate_visibility", // "all" | "assigned"
  ESTIMATE_EDITING: "estimate_editing", // "full" | "assigned" | "view"
  TAKEOFF_CREATION: "takeoff_creation", // true | false
  PRICING: "pricing", // "edit" | "hidden"
  DELETE: "delete", // "all" | "items" | "none"
  ASSIGN_MANAGE: "assign_manage", // true | false
  ORG_SETTINGS: "org_settings", // true | false
};

// ── Permission display metadata (for settings UI) ────────────────────
export const PERMISSION_META = {
  [PERMISSION_KEYS.ESTIMATE_VISIBILITY]: {
    label: "Estimate Visibility",
    description: "Which estimates this user can see",
    options: [
      { value: "all", label: "All Estimates" },
      { value: "assigned", label: "Assigned Only" },
    ],
  },
  [PERMISSION_KEYS.ESTIMATE_EDITING]: {
    label: "Estimate Editing",
    description: "Which estimates this user can modify",
    options: [
      { value: "full", label: "All Estimates" },
      { value: "assigned", label: "Assigned Only" },
      { value: "view", label: "View Only" },
    ],
  },
  [PERMISSION_KEYS.TAKEOFF_CREATION]: {
    label: "Takeoff Creation",
    description: "Can create and edit takeoffs",
    options: [
      { value: true, label: "Yes" },
      { value: false, label: "No" },
    ],
  },
  [PERMISSION_KEYS.PRICING]: {
    label: "Pricing",
    description: "Can see and edit unit prices and totals",
    options: [
      { value: "edit", label: "See + Edit" },
      { value: "hidden", label: "Hidden" },
    ],
  },
  [PERMISSION_KEYS.DELETE]: {
    label: "Delete",
    description: "What this user can delete",
    options: [
      { value: "all", label: "Estimates + Items" },
      { value: "items", label: "Items Only" },
      { value: "none", label: "Nothing" },
    ],
  },
  [PERMISSION_KEYS.ASSIGN_MANAGE]: {
    label: "Assign & Manage",
    description: "Can assign users to estimates",
    options: [
      { value: true, label: "Yes" },
      { value: false, label: "No" },
    ],
  },
  [PERMISSION_KEYS.ORG_SETTINGS]: {
    label: "Organization Settings",
    description: "Can manage company profiles, master data, and user permissions",
    options: [
      { value: true, label: "Yes" },
      { value: false, label: "No" },
    ],
  },
};

// ── Role Presets ─────────────────────────────────────────────────────
// Maps DB role values to their default permission set.
// These are the starting point — admins can toggle individual permissions on top.
export const ROLE_PRESETS = {
  owner: {
    estimate_visibility: "all",
    estimate_editing: "full",
    takeoff_creation: true,
    pricing: "edit",
    delete: "all",
    assign_manage: true,
    org_settings: true,
  },
  manager: {
    estimate_visibility: "all",
    estimate_editing: "full",
    takeoff_creation: true,
    pricing: "edit",
    delete: "all",
    assign_manage: true,
    org_settings: false,
  },
  estimator: {
    estimate_visibility: "all",
    estimate_editing: "full",
    takeoff_creation: true,
    pricing: "edit",
    delete: "items",
    assign_manage: false,
    org_settings: false,
  },
  client: {
    estimate_visibility: "assigned",
    estimate_editing: "view",
    takeoff_creation: false,
    pricing: "hidden",
    delete: "none",
    assign_manage: false,
    org_settings: false,
  },
};

// ── Display Names ────────────────────────────────────────────────────
// Maps DB role values to user-facing names.
export const ROLE_DISPLAY_NAMES = {
  owner: "Owner / Admin",
  manager: "Senior Estimator",
  estimator: "Estimator",
  client: "Junior / Guest Estimator",
};

// All roles in display order (for dropdowns)
export const ROLE_OPTIONS = [
  { value: "owner", label: ROLE_DISPLAY_NAMES.owner },
  { value: "manager", label: ROLE_DISPLAY_NAMES.manager },
  { value: "estimator", label: ROLE_DISPLAY_NAMES.estimator },
  { value: "client", label: ROLE_DISPLAY_NAMES.client },
];

// ── Permission Resolution ────────────────────────────────────────────
/**
 * Resolve effective permissions for a member.
 *
 * Layers (later overrides earlier):
 *   1. Role preset defaults (from ROLE_PRESETS)
 *   2. Org-level template overrides (if the org has a custom template for this role)
 *   3. Per-user JSONB overrides (from org_members.permissions)
 *
 * @param {object} member — org_members row (needs .role and .permissions)
 * @param {array} orgTemplates — permission_templates rows for the org
 * @returns {object} flat permissions object with all 7 keys resolved
 */
export function resolvePermissions(member, orgTemplates = []) {
  if (!member?.role) return { ...ROLE_PRESETS.client }; // safest fallback

  // Layer 1: role defaults
  const roleDefaults = ROLE_PRESETS[member.role] || ROLE_PRESETS.client;
  const base = { ...roleDefaults };

  // Layer 2: org template overrides (if any)
  const template = orgTemplates.find(
    t => t.role_key === member.role && t.is_default,
  );
  if (template?.permissions) {
    for (const [key, val] of Object.entries(template.permissions)) {
      if (val !== undefined && val !== null) base[key] = val;
    }
  }

  // Layer 3: per-user overrides
  if (member.permissions && typeof member.permissions === "object") {
    for (const [key, val] of Object.entries(member.permissions)) {
      if (val !== undefined && val !== null) base[key] = val;
    }
  }

  return base;
}

/**
 * Check if a permission value differs from the role default.
 * Used in the settings UI to show "Custom" badges.
 */
export function isOverridden(role, key, effectiveValue) {
  const preset = ROLE_PRESETS[role];
  if (!preset) return false;
  return preset[key] !== effectiveValue;
}

/**
 * Get the number of overridden permissions for a member.
 */
export function countOverrides(member, orgTemplates = []) {
  if (!member?.role) return 0;
  const effective = resolvePermissions(member, orgTemplates);
  const preset = ROLE_PRESETS[member.role] || {};
  let count = 0;
  for (const key of Object.values(PERMISSION_KEYS)) {
    if (effective[key] !== preset[key]) count++;
  }
  return count;
}
