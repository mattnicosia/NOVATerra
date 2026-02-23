import { useEffect, useRef } from 'react';
import { storage } from '@/utils/storage';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useDatabaseStore } from '@/stores/databaseStore';
import * as cloudSync from '@/utils/cloudSync';

/**
 * Bidirectional cloud sync on every app startup.
 *
 * Runs once per session after:
 *   1. persistenceLoaded === true (local data is in stores)
 *   2. user is authenticated (cloud needs user_id)
 *
 * Strategy:
 *   - Pull cloud data with timestamps
 *   - For each data type, merge cloud ↔ local:
 *     • If local has data but cloud doesn't → push local to cloud
 *     • If cloud has data but local doesn't → pull cloud to local
 *     • If both exist → use the one with more content (for master: more company profiles)
 *       then push the merged result to cloud so both sides converge
 *   - For estimates: push any local estimates missing from cloud,
 *     pull any cloud estimates missing from local
 */
export function useCloudSync() {
  const ran = useRef(false);
  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    if (ran.current) return;
    if (!persistenceLoaded || !user) return;
    ran.current = true;

    (async () => {
      try {
        console.log('[cloudSync] Starting bidirectional sync...');
        useUiStore.getState().setCloudSyncStatus('syncing');

        await syncMasterData();
        await syncEstimates();
        await syncSettings();
        await syncAssemblies();

        useUiStore.getState().setCloudSyncStatus('synced');
        useUiStore.getState().setCloudSyncLastAt(
          new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        );
        console.log('[cloudSync] Bidirectional sync complete.');

        // One-time background migration: re-push estimates with blobs so they
        // get uploaded to Supabase Storage. Estimates created before the blob
        // sync feature were pushed with blobs stripped and never uploaded.
        runBlobMigration().catch(err =>
          console.warn('[cloudSync] Blob migration failed:', err)
        );
      } catch (err) {
        console.error('[cloudSync] Sync failed:', err);
        useUiStore.getState().setCloudSyncStatus('error');
      }
    })();
  }, [persistenceLoaded, user]);
}

// ─── Master Data Sync ──────────────────────────────────────────────

async function syncMasterData() {
  const cloudResult = await cloudSync.pullDataWithMeta('master');
  const localRaw = await storage.get('bldg-master');
  const localMaster = localRaw ? JSON.parse(localRaw.value) : null;

  if (!localMaster && !cloudResult) return; // nothing anywhere

  if (localMaster && !cloudResult) {
    // Local only → push to cloud
    console.log('[cloudSync] Master: local only → pushing to cloud');
    await cloudSync.pushData('master', localMaster);
    return;
  }

  if (!localMaster && cloudResult) {
    // Cloud only → pull to local
    console.log('[cloudSync] Master: cloud only → pulling to local');
    applyMasterData(cloudResult.data);
    await storage.set('bldg-master', JSON.stringify(cloudResult.data));
    return;
  }

  // Both exist → merge
  const cloudMaster = cloudResult.data;
  const merged = mergeMasterData(localMaster, cloudMaster);

  // Apply merged data locally
  applyMasterData(merged);
  await storage.set('bldg-master', JSON.stringify(merged));

  // Push merged data to cloud so the other device gets it
  await cloudSync.pushData('master', merged);
  console.log('[cloudSync] Master: merged and pushed');
}

/**
 * Merge two master data objects. Strategy:
 * - For companyProfiles: union by id (keep profiles from both sides)
 * - For companyInfo: prefer local (user is actively editing on this machine)
 * - For contact arrays (clients, architects, etc): union by id
 * - For static arrays (jobTypes, bidTypes, etc): prefer local
 */
function mergeMasterData(local, cloud) {
  const merged = { ...local };

  // Merge companyProfiles — union by id
  const localProfiles = local.companyProfiles || [];
  const cloudProfiles = cloud.companyProfiles || [];
  const profileMap = new Map();
  // Cloud first (so local overrides if same id)
  for (const p of cloudProfiles) profileMap.set(p.id, p);
  for (const p of localProfiles) profileMap.set(p.id, p);
  merged.companyProfiles = Array.from(profileMap.values());

  // Merge contact categories — union by id
  for (const cat of ['clients', 'architects', 'engineers', 'estimators', 'subcontractors']) {
    const localItems = local[cat] || [];
    const cloudItems = cloud[cat] || [];
    const itemMap = new Map();
    for (const item of cloudItems) itemMap.set(item.id, item);
    for (const item of localItems) itemMap.set(item.id, item);
    merged[cat] = Array.from(itemMap.values());
  }

  // companyInfo: prefer local (has logos etc), but if local has no name and cloud does, use cloud
  if (!local.companyInfo?.name && cloud.companyInfo?.name) {
    merged.companyInfo = { ...cloud.companyInfo };
  }

  return merged;
}

function applyMasterData(data) {
  useMasterDataStore.getState().setMasterData({
    ...useMasterDataStore.getState().masterData,
    ...data,
  });
}

// ─── Estimates Sync ────────────────────────────────────────────────

async function syncEstimates() {
  // Get local index
  const idxRaw = await storage.get('bldg-index');
  const localIndex = idxRaw ? JSON.parse(idxRaw.value) : [];
  const localIndexMap = new Map(localIndex.map(e => [e.id, e]));

  // Get cloud index
  const cloudIndexResult = await cloudSync.pullDataWithMeta('index');
  const cloudIndex = (cloudIndexResult?.data && Array.isArray(cloudIndexResult.data))
    ? cloudIndexResult.data : [];
  const cloudIndexMap = new Map(cloudIndex.map(e => [e.id, e]));

  // Get all cloud estimates with metadata
  const cloudEstimates = await cloudSync.pullAllEstimatesWithMeta();
  const cloudEstMap = new Map(cloudEstimates.map(e => [e.estimate_id, e]));

  let changed = false;

  // Pull estimates that exist in cloud but not locally
  for (const ce of cloudEstimates) {
    if (!localIndexMap.has(ce.estimate_id)) {
      console.log(`[cloudSync] Estimates: pulling cloud estimate ${ce.estimate_id}`);
      await storage.set(`bldg-est-${ce.estimate_id}`, JSON.stringify(ce.data));
      // Add to local index from cloud index entry
      const cloudEntry = cloudIndexMap.get(ce.estimate_id);
      if (cloudEntry) {
        localIndex.push(cloudEntry);
        localIndexMap.set(ce.estimate_id, cloudEntry);
      }
      changed = true;
    }
  }

  // Push estimates that exist locally but not in cloud
  for (const entry of localIndex) {
    if (!cloudEstMap.has(entry.id)) {
      console.log(`[cloudSync] Estimates: pushing local estimate ${entry.id}`);
      const estRaw = await storage.get(`bldg-est-${entry.id}`);
      if (estRaw) {
        const estData = JSON.parse(estRaw.value);
        await cloudSync.pushEstimate(entry.id, estData);
      }
      changed = true;
    }
  }

  if (changed) {
    // Update local index in store and IndexedDB
    useEstimatesStore.getState().setEstimatesIndex(localIndex);
    await storage.set('bldg-index', JSON.stringify(localIndex));

    // Push merged index to cloud
    await cloudSync.pushData('index', localIndex);
    console.log(`[cloudSync] Estimates: synced, ${localIndex.length} total estimates`);
  }
}

// ─── Settings Sync ─────────────────────────────────────────────────

async function syncSettings() {
  const cloudResult = await cloudSync.pullDataWithMeta('settings');
  const localRaw = await storage.get('bldg-settings');
  const localSettings = localRaw ? JSON.parse(localRaw.value) : null;

  if (localSettings && !cloudResult) {
    await cloudSync.pushData('settings', localSettings);
    return;
  }

  if (!localSettings && cloudResult) {
    useUiStore.getState().setAppSettings({
      ...useUiStore.getState().appSettings,
      ...cloudResult.data,
    });
    await storage.set('bldg-settings', JSON.stringify(cloudResult.data));
    return;
  }

  // Both exist — prefer local (settings are device-specific mostly),
  // but push local to cloud so other device gets apiKey etc.
  if (localSettings) {
    await cloudSync.pushData('settings', localSettings);
  }
}

// ─── Assemblies Sync ───────────────────────────────────────────────

async function syncAssemblies() {
  const cloudResult = await cloudSync.pullDataWithMeta('assemblies');
  const localRaw = await storage.get('bldg-assemblies');
  const localAsm = localRaw ? JSON.parse(localRaw.value) : null;

  if (localAsm && !cloudResult) {
    await cloudSync.pushData('assemblies', localAsm);
    return;
  }

  if (!localAsm && cloudResult) {
    if (Array.isArray(cloudResult.data)) {
      useDatabaseStore.getState().setAssemblies(cloudResult.data);
      await storage.set('bldg-assemblies', JSON.stringify(cloudResult.data));
    }
    return;
  }

  // Both exist — union by id
  if (localAsm && cloudResult?.data && Array.isArray(localAsm) && Array.isArray(cloudResult.data)) {
    const asmMap = new Map();
    for (const a of cloudResult.data) asmMap.set(a.id, a);
    for (const a of localAsm) asmMap.set(a.id, a);
    const merged = Array.from(asmMap.values());
    useDatabaseStore.getState().setAssemblies(merged);
    await storage.set('bldg-assemblies', JSON.stringify(merged));
    await cloudSync.pushData('assemblies', merged);
  } else if (localAsm) {
    await cloudSync.pushData('assemblies', localAsm);
  }
}

// ─── One-Time Blob Migration ────────────────────────────────────────
//
// Re-pushes any local estimates that have drawing/document/specPdf blob
// data but were previously synced without uploading blobs to Storage.
// Runs in the background after normal sync, throttled to avoid overload.

async function runBlobMigration() {
  // v2: previous migration used proxy upload which failed on files > 4.5MB (Vercel limit)
  // v2 uses signed-URL direct uploads — no size limit
  const MIGRATION_KEY = 'blob_migration_v2';
  if (localStorage.getItem(MIGRATION_KEY) === 'done') return;

  const idxRaw = await storage.get('bldg-index');
  if (!idxRaw) { localStorage.setItem(MIGRATION_KEY, 'done'); return; }

  const index = JSON.parse(idxRaw.value);
  if (!index.length) { localStorage.setItem(MIGRATION_KEY, 'done'); return; }

  console.log(`[cloudSync] Blob migration: checking ${index.length} estimates...`);
  let migrated = 0;

  for (const entry of index) {
    try {
      const raw = await storage.get(`bldg-est-${entry.id}`);
      if (!raw) continue;

      const data = JSON.parse(raw.value);
      let hasUnuploadedBlobs = false;

      // Check drawings for blobs without storagePath
      if (Array.isArray(data.drawings)) {
        hasUnuploadedBlobs = data.drawings.some(d => d.data && !d.storagePath);
      }
      // Check documents
      if (!hasUnuploadedBlobs && Array.isArray(data.documents)) {
        hasUnuploadedBlobs = data.documents.some(d => d.data && !d.storagePath);
      }
      // Check specPdf
      if (!hasUnuploadedBlobs && data.specPdf && !data._specPdfStoragePath) {
        hasUnuploadedBlobs = true;
      }

      if (hasUnuploadedBlobs) {
        console.log(`[cloudSync] Blob migration: re-pushing estimate ${entry.id}`);
        await cloudSync.pushEstimate(entry.id, data);
        migrated++;
        // Small delay between pushes to avoid hammering the API
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.warn(`[cloudSync] Blob migration: failed for ${entry.id}:`, err.message);
    }
  }

  localStorage.setItem(MIGRATION_KEY, 'done');
  console.log(`[cloudSync] Blob migration complete. Re-pushed ${migrated} estimate(s).`);
}
