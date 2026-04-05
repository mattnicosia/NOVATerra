/**
 * Cloud Sync — Normalized company_profiles & contacts tables.
 *
 * Dual-write layer: the app still writes the master JSONB blob as primary,
 * and this module writes to normalized Supabase tables as a secondary.
 * Fire-and-forget — failures here never block the UI or JSONB path.
 */

import { supabase } from "./supabase";
import { getUserId, getScope, isReady } from "./cloudSync-auth";

// ── Field mapping helpers ──────────────────────────────────

function companyInfoToRow(companyInfo, userId, orgId) {
  if (!companyInfo) return null;
  return {
    id: companyInfo.id || `default-${userId}`,
    org_id: orgId || null,
    user_id: userId,
    name: companyInfo.name || "",
    short_name: companyInfo.shortName || null,
    address: companyInfo.address || "",
    city: companyInfo.city || "",
    state: companyInfo.state || "",
    zip: companyInfo.zip || "",
    phone: companyInfo.phone || "",
    email: companyInfo.email || "",
    website: companyInfo.website || "",
    license_no: companyInfo.licenseNo || "",
    ein: companyInfo.ein || "",
    logo: null, // logos go to Supabase Storage, not the DB column
    brand_colors: companyInfo.brandColors || [],
    palettes: companyInfo.palettes || [],
    boilerplate_exclusions: companyInfo.boilerplateExclusions || [],
    boilerplate_notes: companyInfo.boilerplateNotes || [],
    boilerplate_qualifications: companyInfo.boilerplateQualifications || [],
    default_terms: companyInfo.defaultTerms || null,
    is_default: true,
  };
}

function profileToRow(profile, userId, orgId) {
  if (!profile?.id) return null;
  return {
    id: profile.id,
    org_id: orgId || null,
    user_id: userId,
    name: profile.name || "",
    short_name: profile.shortName || null,
    address: profile.address || "",
    city: profile.city || "",
    state: profile.state || "",
    zip: profile.zip || "",
    phone: profile.phone || "",
    email: profile.email || "",
    website: profile.website || "",
    license_no: profile.licenseNo || "",
    ein: profile.ein || "",
    logo: null,
    brand_colors: profile.brandColors || [],
    palettes: profile.palettes || [],
    boilerplate_exclusions: profile.boilerplateExclusions || [],
    boilerplate_notes: profile.boilerplateNotes || [],
    boilerplate_qualifications: profile.boilerplateQualifications || [],
    default_terms: profile.defaultTerms || null,
    is_default: false,
  };
}

function contactToRow(contact, contactType, userId, orgId) {
  if (!contact?.id) return null;

  const row = {
    id: contact.id,
    org_id: orgId || null,
    user_id: userId,
    contact_type: contactType,
    company_name: contact.name || contact.companyName || "",
    contact_name: contact.contactName || contact.contact || "",
    title: contact.title || "",
    email: contact.email || "",
    phone: contact.phone || "",
    address: contact.address || "",
    city: contact.city || "",
    state: contact.state || "",
    zip: contact.zip || "",
    notes: contact.notes || "",
    tags: contact.tags || [],
    metadata: {},
  };

  // Subcontractor-specific fields go in metadata
  if (contactType === "subcontractor") {
    row.metadata = {
      trades: contact.trades || [],
      markets: contact.markets || [],
      insuranceExpiry: contact.insuranceExpiry || "",
      bondingCapacity: contact.bondingCapacity || "",
      emr: contact.emr || "",
      certifications: contact.certifications || [],
      yearsInBusiness: contact.yearsInBusiness || "",
      preferred: contact.preferred || false,
      website: contact.website || "",
      licenseNo: contact.licenseNo || "",
      _legacyTrade: contact._legacyTrade || "",
    };
  }

  // Preserve companyProfileId reference
  if (contact.companyProfileId) {
    row.metadata = { ...row.metadata, companyProfileId: contact.companyProfileId };
  }

  return row;
}

// ── Atomic write (single Postgres transaction via RPC) ────

/**
 * Save profiles and contacts atomically via a Postgres function.
 * Both tables are written in a single transaction — if either fails,
 * the entire operation rolls back. No dual-write problem.
 */
export async function saveAtomically(masterData) {
  if (!isReady()) return;
  const userId = getUserId();
  const scope = getScope();
  const orgId = scope?.org_id || null;

  // Build profiles array (default + additional)
  const profiles = [];
  const defaultInfo = masterData.companyInfo;
  if (defaultInfo?.name) {
    profiles.push({
      id: defaultInfo.id || `default-${userId}`,
      is_default: true,
      name: defaultInfo.name || "",
      short_name: defaultInfo.shortName || null,
      address: defaultInfo.address || "",
      city: defaultInfo.city || "",
      state: defaultInfo.state || "",
      zip: defaultInfo.zip || "",
      phone: defaultInfo.phone || "",
      email: defaultInfo.email || "",
      website: defaultInfo.website || "",
      license_no: defaultInfo.licenseNo || "",
      ein: defaultInfo.ein || "",
      logo: defaultInfo.logo || null,
      brand_colors: defaultInfo.brandColors || [],
      palettes: defaultInfo.palettes || [],
      boilerplate_exclusions: defaultInfo.boilerplateExclusions || [],
      boilerplate_notes: defaultInfo.boilerplateNotes || [],
      boilerplate_qualifications: defaultInfo.boilerplateQualifications || [],
      default_terms: defaultInfo.defaultTerms || null,
    });
  }
  for (const p of masterData.companyProfiles || []) {
    if (!p?.id) continue;
    profiles.push({
      id: p.id,
      is_default: false,
      name: p.name || "",
      short_name: p.shortName || null,
      address: p.address || "",
      city: p.city || "",
      state: p.state || "",
      zip: p.zip || "",
      phone: p.phone || "",
      email: p.email || "",
      website: p.website || "",
      license_no: p.licenseNo || "",
      ein: p.ein || "",
      logo: p.logo || null,
      brand_colors: p.brandColors || [],
      palettes: p.palettes || [],
      boilerplate_exclusions: p.boilerplateExclusions || [],
      boilerplate_notes: p.boilerplateNotes || [],
      boilerplate_qualifications: p.boilerplateQualifications || [],
      default_terms: p.defaultTerms || null,
    });
  }

  // Build contacts array with contact_type
  const contacts = [];
  const typeMap = {
    clients: "client",
    architects: "architect",
    engineers: "engineer",
    estimators: "estimator",
    subcontractors: "subcontractor",
  };
  for (const [key, type] of Object.entries(typeMap)) {
    for (const c of masterData[key] || []) {
      const row = contactToRow(c, type, userId, orgId);
      if (row) contacts.push(row);
    }
  }

  const { error } = await supabase.rpc("save_profiles_and_contacts", {
    p_user_id: userId,
    p_org_id: orgId,
    p_profiles: profiles,
    p_contacts: contacts,
  });
  if (error) {
    console.error("[cloudSyncProfiles] atomic save failed:", error.message);
    throw error;
  }
}

// ── Pull operations ────────────────────────────────────────

/** Pull company profiles from normalized table. */
export async function pullProfiles() {
  if (!isReady()) return [];
  const userId = getUserId();
  const scope = getScope();

  let query = supabase.from("company_profiles").select("*");
  if (scope) {
    query = query.eq("org_id", scope.org_id);
  } else {
    query = query.eq("user_id", userId).is("org_id", null);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[cloudSyncProfiles] pullProfiles failed:", error.message);
    return [];
  }
  return data || [];
}

/** Pull contacts from normalized table. */
export async function pullContacts() {
  if (!isReady()) return [];
  const userId = getUserId();
  const scope = getScope();

  let query = supabase.from("contacts").select("*");
  if (scope) {
    query = query.eq("org_id", scope.org_id);
  } else {
    query = query.eq("user_id", userId).is("org_id", null);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[cloudSyncProfiles] pullContacts failed:", error.message);
    return [];
  }
  return data || [];
}

