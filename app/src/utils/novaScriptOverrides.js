// ═══════════════════════════════════════════════════════════════
// novaScriptOverrides.js — Runtime override layer for NOVA script
// ═══════════════════════════════════════════════════════════════
// Stores user edits in localStorage. Deep-merges with defaults
// from novaScript.js so components always get a complete config.
// Pure JS module — importable anywhere (not React, not Zustand).
// ═══════════════════════════════════════════════════════════════

import { ONBOARDING, TOUR, SETUP, RETURNING } from '@/components/nova/novaScript';

const LS_KEY = 'nova_script_overrides';

const DEFAULTS = { ONBOARDING, TOUR, SETUP, RETURNING };

// ── localStorage read/write ──────────────────────────────────

export function getOverrides() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch { return {}; }
}

function saveOverrides(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
}

// ── Set a single override value ──────────────────────────────
// path: dot-separated, e.g. "firstContact.line1.text"
// For array items: "steps.0.text"

export function setOverride(section, path, value) {
  const all = getOverrides();
  if (!all[section]) all[section] = {};
  const keys = path.split('.');
  let obj = all[section];
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  saveOverrides(all);
}

// ── Reset ────────────────────────────────────────────────────

export function resetSection(section) {
  const all = getOverrides();
  delete all[section];
  saveOverrides(all);
}

export function resetAll() {
  localStorage.removeItem(LS_KEY);
}

// ── Deep merge (overrides onto defaults) ─────────────────────

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const result = Array.isArray(target) ? [...target] : { ...target };

  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = result[key];

    // Full array replacement (from add/remove step operations)
    if (Array.isArray(tv) && Array.isArray(sv)) {
      result[key] = sv;
    // Array items stored as index-keyed objects: { "0": {...}, "2": {...} }
    } else if (Array.isArray(tv) && typeof sv === 'object' && !Array.isArray(sv)) {
      const maxIdx = Math.max(tv.length - 1, ...Object.keys(sv).map(Number).filter(n => !isNaN(n)));
      const arr = [];
      for (let i = 0; i <= maxIdx; i++) {
        const base = tv[i] || {};
        const itemOverride = sv[String(i)];
        if (itemOverride && typeof itemOverride === 'object') {
          arr.push({ ...base, ...itemOverride });
        } else if (tv[i]) {
          arr.push(tv[i]);
        }
      }
      result[key] = arr;
    } else if (tv && typeof tv === 'object' && typeof sv === 'object' && !Array.isArray(sv)) {
      result[key] = deepMerge(tv, sv);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

// ── Template ↔ Function conversion ───────────────────────────
// For display: fnToTemplate((name) => `Hello, ${name}.`) → "Hello, {name}."
// For save:    templateToFn("Hello, {name}.", originalFn) → (name) => ...

export function fnToTemplate(fn) {
  if (typeof fn !== 'function') return fn;
  const src = fn.toString();
  const paramMatch = src.match(/^\(?(\w+)\)?\s*=>/);
  const paramName = paramMatch?.[1] || 'arg';
  try {
    return fn(`{${paramName}}`);
  } catch {
    return String(fn);
  }
}

export function templateToFn(templateStr, originalFn) {
  if (typeof originalFn !== 'function') return templateStr;
  const src = originalFn.toString();
  const paramMatch = src.match(/^\(?(\w+)\)?\s*=>/);
  const paramName = paramMatch?.[1] || 'arg';
  const placeholder = `{${paramName}}`;

  // No placeholder in the string → return plain string
  if (!templateStr.includes(placeholder)) return templateStr;

  // Check if original handles falsy input differently
  let handlesFalsy = false;
  try { handlesFalsy = originalFn('') !== originalFn('test'); } catch { /* ignore */ }

  if (handlesFalsy) {
    const fallback = originalFn('');
    return (arg) => arg ? templateStr.replaceAll(placeholder, arg) : fallback;
  }
  return (arg) => templateStr.replaceAll(placeholder, String(arg));
}

// ── Get merged config for a section ──────────────────────────
// Usage: const S = getScript('ONBOARDING');

export function getScript(section) {
  const defaults = DEFAULTS[section];
  if (!defaults) return {};
  const overrides = getOverrides()[section];
  if (!overrides) return defaults;

  const merged = deepMerge(defaults, overrides);

  // Re-hydrate any text fields that should be functions
  rehydrateFunctions(merged, defaults);

  return merged;
}

// Walk the merged object and convert template strings back to functions
// wherever the default has a function
function rehydrateFunctions(merged, defaults) {
  if (!merged || !defaults) return;
  for (const key of Object.keys(defaults)) {
    const dv = defaults[key];
    const mv = merged[key];

    if (key === 'text' && typeof dv === 'function' && typeof mv === 'string') {
      merged[key] = templateToFn(mv, dv);
    } else if (Array.isArray(dv) && Array.isArray(mv)) {
      mv.forEach((item, i) => {
        // For items beyond default length, use first default as template (for new steps)
        const template = dv[i] || dv[0];
        if (template) rehydrateFunctions(item, template);
      });
    } else if (dv && typeof dv === 'object' && mv && typeof mv === 'object') {
      rehydrateFunctions(mv, dv);
    }
  }
}

// ── Helper: get display value for any field ──────────────────
// Resolves functions to template strings for the editor UI

export function getDisplayValue(section, path) {
  const defaults = DEFAULTS[section];
  const overrides = getOverrides()[section] || {};
  const keys = path.split('.');

  let dv = defaults;
  let ov = overrides;
  for (const k of keys) {
    dv = dv?.[k];
    ov = ov?.[k];
  }

  // Override exists → return it
  if (ov !== undefined) return typeof dv === 'function' ? ov : ov;
  // Default is a function → convert to template
  if (typeof dv === 'function') return fnToTemplate(dv);
  return dv;
}

// ── Helper: check if a field is a function in defaults ───────

export function isTemplateFn(section, path) {
  let val = DEFAULTS[section];
  for (const k of path.split('.')) val = val?.[k];
  return typeof val === 'function';
}

// ── Helper: get default value for display ────────────────────

export function getDefaultValue(section, path) {
  let val = DEFAULTS[section];
  for (const k of path.split('.')) val = val?.[k];
  if (typeof val === 'function') return fnToTemplate(val);
  return val;
}

// ── Helper: check if a field has been overridden ─────────────

export function hasOverride(section, path) {
  let val = getOverrides()[section];
  if (!val) return false;
  for (const k of path.split('.')) {
    val = val?.[k];
    if (val === undefined) return false;
  }
  return true;
}

// ── Clear a single override ──────────────────────────────────

export function clearOverride(section, path) {
  const all = getOverrides();
  if (!all[section]) return;
  const keys = path.split('.');
  let obj = all[section];
  for (let i = 0; i < keys.length - 1; i++) {
    obj = obj?.[keys[i]];
    if (!obj) return;
  }
  delete obj[keys[keys.length - 1]];
  saveOverrides(all);
}

// ── Array step management ────────────────────────────────────
// These store full array replacements in overrides so add/remove
// operations are clean (no index-keyed partial merge ambiguity).

/** Get the current full array for a section's array path (merged) */
function getMergedArray(section, arrayPath) {
  const merged = getScript(section);
  let val = merged;
  for (const k of arrayPath.split('.')) val = val?.[k];
  return Array.isArray(val) ? val : [];
}

/** Replace an entire array in overrides */
export function setArrayOverride(section, arrayPath, newArray) {
  const all = getOverrides();
  if (!all[section]) all[section] = {};
  const keys = arrayPath.split('.');
  let obj = all[section];
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  // Store as a real array — deepMerge will use full-array-replacement path
  obj[keys[keys.length - 1]] = newArray;
  saveOverrides(all);
}

/** Add a step at a given position (default: end) */
export function addStepOverride(section, arrayPath, step, position) {
  const arr = getMergedArray(section, arrayPath);
  const pos = position !== undefined ? position : arr.length;
  arr.splice(pos, 0, step);
  setArrayOverride(section, arrayPath, arr);
}

/** Remove a step at a given index */
export function removeStepOverride(section, arrayPath, index) {
  const arr = getMergedArray(section, arrayPath);
  if (arr.length <= 1) return; // prevent removing last step
  arr.splice(index, 1);
  setArrayOverride(section, arrayPath, arr);
}

/** Move a step from one index to another */
export function moveStepOverride(section, arrayPath, fromIndex, toIndex) {
  const arr = getMergedArray(section, arrayPath);
  if (fromIndex < 0 || fromIndex >= arr.length) return;
  if (toIndex < 0 || toIndex >= arr.length) return;
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  setArrayOverride(section, arrayPath, arr);
}
