/**
 * Cloud Sync — Supabase push/pull layer for cross-device persistence
 *
 * IndexedDB stays the primary store (offline-first). This module pushes data
 * to Supabase in the background and pulls from cloud when local is empty.
 *
 * All operations are fire-and-forget — cloud errors never block the UI.
 */

import { supabase } from './supabase';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';

// ---------- helpers ----------

const getUserId = () => useAuthStore.getState().user?.id;

const isReady = () => {
  if (!supabase) return false;
  if (!getUserId()) return false;
  return true;
};

const markSynced = () => {
  useUiStore.getState().setCloudSyncStatus("synced");
  useUiStore.getState().setCloudSyncLastAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
};

const markError = () => {
  useUiStore.getState().setCloudSyncStatus("error");
};

const markSyncing = () => {
  useUiStore.getState().setCloudSyncStatus("syncing");
};

/**
 * Strip large base64 blobs from estimate data before cloud push.
 * Drawings, documents, and specPdf can be 10-100MB+ of base64.
 * Phase 2 will sync these via Supabase Storage buckets.
 */
const stripBlobs = (data) => {
  if (!data) return data;
  const clean = { ...data };

  // Strip drawing data (base64 PDFs/images)
  if (Array.isArray(clean.drawings)) {
    clean.drawings = clean.drawings.map(d => {
      if (!d.data) return d;
      const { data: _blob, ...rest } = d;
      return { ...rest, _cloudBlobStripped: true };
    });
  }

  // Strip document data
  if (Array.isArray(clean.documents)) {
    clean.documents = clean.documents.map(d => {
      if (!d.data) return d;
      const { data: _blob, ...rest } = d;
      return { ...rest, _cloudBlobStripped: true };
    });
  }

  // Strip spec PDF
  if (clean.specPdf) {
    clean.specPdf = null;
    clean._specPdfStripped = true;
  }

  return clean;
};

/**
 * Strip large base64 logos from master data before cloud push.
 * Company logos can be 1-5MB+ of base64 each.
 */
const stripMasterBlobs = (data) => {
  if (!data) return data;
  const clean = { ...data };

  // Strip primary company logo
  if (clean.companyInfo?.logo) {
    clean.companyInfo = { ...clean.companyInfo, logo: null, _logoStripped: true };
  }

  // Strip company profile logos
  if (Array.isArray(clean.companyProfiles)) {
    clean.companyProfiles = clean.companyProfiles.map(p => {
      if (!p.logo) return p;
      return { ...p, logo: null, _logoStripped: true };
    });
  }

  return clean;
};

// ---------- push operations ----------

/**
 * Upsert a key-value pair to the user_data table.
 * Used for: settings, master, assemblies, index
 */
export const pushData = async (key, data) => {
  if (!isReady()) return;
  markSyncing();
  try {
    // Strip logos from master data to reduce payload size
    const cleanData = key === 'master' ? stripMasterBlobs(data) : data;
    const { error } = await supabase
      .from('user_data')
      .upsert(
        { user_id: getUserId(), key, data: cleanData, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,key' }
      );
    if (error) throw error;
    markSynced();
  } catch (err) {
    console.warn(`[cloudSync] pushData("${key}") failed:`, err.message || err);
    markError();
  }
};

/**
 * Upsert an estimate to the user_estimates table.
 * Strips base64 blobs before upload.
 */
export const pushEstimate = async (estimateId, data) => {
  if (!isReady()) return;
  markSyncing();
  try {
    const cleanData = stripBlobs(data);
    const { error } = await supabase
      .from('user_estimates')
      .upsert(
        { user_id: getUserId(), estimate_id: estimateId, data: cleanData, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,estimate_id' }
      );
    if (error) throw error;
    markSynced();
  } catch (err) {
    console.warn(`[cloudSync] pushEstimate("${estimateId}") failed:`, err.message || err);
    markError();
  }
};

/**
 * Delete an estimate from the cloud.
 */
export const deleteEstimate = async (estimateId) => {
  if (!isReady()) return;
  markSyncing();
  try {
    const { error } = await supabase
      .from('user_estimates')
      .delete()
      .eq('user_id', getUserId())
      .eq('estimate_id', estimateId);
    if (error) throw error;
    markSynced();
  } catch (err) {
    console.warn(`[cloudSync] deleteEstimate("${estimateId}") failed:`, err.message || err);
    markError();
  }
};

// ---------- pull operations ----------

/**
 * Pull a key-value pair from the user_data table.
 * Returns the data object or null if not found.
 */
export const pullData = async (key) => {
  if (!isReady()) return null;
  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('data')
      .eq('user_id', getUserId())
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;
    return data?.data || null;
  } catch (err) {
    console.warn(`[cloudSync] pullData("${key}") failed:`, err.message || err);
    return null;
  }
};

/**
 * Pull a key-value pair AND its updated_at timestamp.
 * Returns { data, updated_at } or null if not found.
 */
export const pullDataWithMeta = async (key) => {
  if (!isReady()) return null;
  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('data, updated_at')
      .eq('user_id', getUserId())
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;
    return data ? { data: data.data, updated_at: data.updated_at } : null;
  } catch (err) {
    console.warn(`[cloudSync] pullDataWithMeta("${key}") failed:`, err.message || err);
    return null;
  }
};

/**
 * Pull all estimates with their metadata (estimate_id, data, updated_at).
 */
export const pullAllEstimatesWithMeta = async () => {
  if (!isReady()) return [];
  try {
    const { data, error } = await supabase
      .from('user_estimates')
      .select('estimate_id, data, updated_at')
      .eq('user_id', getUserId());
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[cloudSync] pullAllEstimatesWithMeta() failed:', err.message || err);
    return [];
  }
};

/**
 * Pull a single estimate from the cloud.
 * Returns the estimate data object or null if not found.
 * Note: drawings/documents will have _cloudBlobStripped markers (no binary data).
 */
export const pullEstimate = async (estimateId) => {
  if (!isReady()) return null;
  try {
    const { data, error } = await supabase
      .from('user_estimates')
      .select('data')
      .eq('user_id', getUserId())
      .eq('estimate_id', estimateId)
      .maybeSingle();
    if (error) throw error;
    return data?.data || null;
  } catch (err) {
    console.warn(`[cloudSync] pullEstimate("${estimateId}") failed:`, err.message || err);
    return null;
  }
};

/**
 * Pull all estimates for the current user (used for initial sync on new device).
 * Returns array of { estimate_id, data } objects.
 */
export const pullAllEstimates = async () => {
  if (!isReady()) return [];
  try {
    const { data, error } = await supabase
      .from('user_estimates')
      .select('estimate_id, data')
      .eq('user_id', getUserId());
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[cloudSync] pullAllEstimates() failed:', err.message || err);
    return [];
  }
};
