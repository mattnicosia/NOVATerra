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

// ── Push operations ────────────────────────────────────────

/**
 * Upsert company profiles to normalized table.
 * Maps companyInfo (default profile) + companyProfiles[] (additional profiles).
 */
export async function pushProfiles(masterData) {
  if (!isReady()) return;
  const userId = getUserId();
  const scope = getScope();
  const orgId = scope?.org_id || null;

  const rows = [];

  // Default profile from companyInfo
  const defaultRow = companyInfoToRow(masterData.companyInfo, userId, orgId);
  if (defaultRow && defaultRow.name) rows.push(defaultRow);

  // Additional profiles
  for (const p of masterData.companyProfiles || []) {
    const row = profileToRow(p, userId, orgId);
    if (row) rows.push(row);
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("company_profiles")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    console.warn("[cloudSyncProfiles] pushProfiles failed:", error.message);
  }
}

/**
 * Push contacts to normalized table.
 * Replace strategy: delete all for this user+org+type, then insert fresh.
 * This avoids orphaned rows without needing per-contact delete hooks.
 */
export async function pushContacts(masterData) {
  if (!isReady()) return;
  const userId = getUserId();
  const scope = getScope();
  const orgId = scope?.org_id || null;

  const typeMap = {
    clients: "client",
    architects: "architect",
    engineers: "engineer",
    estimators: "estimator",
    subcontractors: "subcontractor",
  };

  for (const [key, contactType] of Object.entries(typeMap)) {
    const items = masterData[key] || [];
    const rows = items.map(c => contactToRow(c, contactType, userId, orgId)).filter(Boolean);

    // Delete existing for this type, then insert fresh
    let deleteQuery = supabase
      .from("contacts")
      .delete()
      .eq("user_id", userId)
      .eq("contact_type", contactType);

    if (orgId) {
      deleteQuery = deleteQuery.eq("org_id", orgId);
    } else {
      deleteQuery = deleteQuery.is("org_id", null);
    }

    const { error: delErr } = await deleteQuery;
    if (delErr) {
      console.warn(`[cloudSyncProfiles] delete ${contactType} failed:`, delErr.message);
      continue; // Skip insert if delete failed
    }

    if (rows.length > 0) {
      // Batch insert in chunks of 50
      for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50);
        const { error: insErr } = await supabase.from("contacts").insert(chunk);
        if (insErr) {
          console.warn(`[cloudSyncProfiles] insert ${contactType} failed:`, insErr.message);
        }
      }
    }
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

// ── One-time migration seed ────────────────────────────────

/**
 * Seed normalized tables from the existing JSONB blob.
 * Runs once per user, guarded by localStorage flag.
 */
export async function seedFromJsonb(masterData) {
  if (!isReady()) return;
  const userId = getUserId();
  const flag = `profiles-seeded-${userId}`;

  if (localStorage.getItem(flag)) return; // Already seeded

  // Check if normalized tables already have data
  const profiles = await pullProfiles();
  if (profiles.length > 0) {
    localStorage.setItem(flag, "1");
    return; // Already populated (maybe another device seeded)
  }

  // Check if JSONB has anything worth seeding
  const hasProfiles =
    masterData.companyInfo?.name ||
    (masterData.companyProfiles || []).length > 0;
  const hasContacts =
    (masterData.clients || []).length > 0 ||
    (masterData.architects || []).length > 0 ||
    (masterData.engineers || []).length > 0 ||
    (masterData.subcontractors || []).length > 0;

  if (!hasProfiles && !hasContacts) {
    localStorage.setItem(flag, "1");
    return; // Nothing to seed
  }

  console.log("[cloudSyncProfiles] Seeding normalized tables from JSONB blob...");

  if (hasProfiles) {
    await pushProfiles(masterData).catch(err => {
      console.warn("[cloudSyncProfiles] Seed profiles failed:", err?.message);
    });
  }

  if (hasContacts) {
    await pushContacts(masterData).catch(err => {
      console.warn("[cloudSyncProfiles] Seed contacts failed:", err?.message);
    });
  }

  localStorage.setItem(flag, "1");
  console.log("[cloudSyncProfiles] Seed complete.");
}
