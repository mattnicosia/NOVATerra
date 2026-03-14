// ============================================================
// NOVA Core — IndexedDB to Supabase Migration (Client-Side Export)
// scripts/nova-core/migrate_indexeddb.ts
//
// Step 1: Reads all records from the 'nova-estimates' IndexedDB store.
// Step 2: Serializes to JSON and POSTs to /api/nova-core/migrate.
// Step 3: On success (error_count === 0), sets migration_status = 'complete'.
//         Never deletes IndexedDB data.
//
// This module is imported client-side and called on first login
// when migration_status is not 'complete'.
// ============================================================

/** Check if migration has already been completed */
export async function getMigrationStatus(): Promise<string | null> {
  try {
    const db = await openDB('nova-estimates');
    const tx = db.transaction('meta', 'readonly');
    const store = tx.objectStore('meta');
    const req = store.get('migration_status');
    return await promisifyRequest<string | null>(req);
  } catch {
    return null;
  }
}

/** Set migration status in IndexedDB meta store */
async function setMigrationStatus(status: string): Promise<void> {
  try {
    const db = await openDB('nova-estimates');
    if (!db.objectStoreNames.contains('meta')) return;
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    store.put(status, 'migration_status');
    await promisifyTransaction(tx);
  } catch (err) {
    console.error('Failed to set migration status:', err);
  }
}

/** Export all records from IndexedDB and POST to migration endpoint */
export async function runMigration(orgId: string): Promise<{
  imported_count: number;
  flagged_count: number;
  flagged_records: any[];
  error_count: number;
}> {
  console.log('[NOVA Core Migration] Starting IndexedDB export...');

  // Step 1: Read all records from IndexedDB
  const records = await exportAllRecords();
  console.log(`[NOVA Core Migration] Exported ${records.length} records from IndexedDB.`);

  if (records.length === 0) {
    console.log('[NOVA Core Migration] No records to migrate.');
    await setMigrationStatus('complete');
    return { imported_count: 0, flagged_count: 0, flagged_records: [], error_count: 0 };
  }

  // Step 2: POST to migration endpoint
  const response = await fetch('/api/nova-core/migrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_id: orgId, records }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Migration endpoint returned ${response.status}: ${text}`);
  }

  const result = await response.json();
  console.log(`[NOVA Core Migration] Result:`, result);

  // Step 3: Mark as complete only if zero errors
  if (result.error_count === 0 && result.imported_count > 0) {
    await setMigrationStatus('complete');
    console.log('[NOVA Core Migration] Migration complete. IndexedDB marked as migrated.');
  } else if (result.error_count > 0) {
    console.warn(`[NOVA Core Migration] ${result.error_count} errors. NOT marking as complete.`);
    console.warn('[NOVA Core Migration] Flagged records:', result.flagged_records);
  }

  return result;
}

/** Read all records from every object store in the nova-estimates DB */
async function exportAllRecords(): Promise<any[]> {
  const db = await openDB('nova-estimates');
  const allRecords: any[] = [];

  const storeNames = Array.from(db.objectStoreNames).filter(
    name => name !== 'meta' // Skip meta store
  );

  for (const storeName of storeNames) {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const records = await promisifyRequest<any[]>(store.getAll());

      if (records && records.length > 0) {
        for (const record of records) {
          allRecords.push({
            _store: storeName,
            ...record,
          });
        }
      }
    } catch (err) {
      console.warn(`[NOVA Core Migration] Could not read store '${storeName}':`, err);
    }
  }

  return allRecords;
}

// ── IndexedDB helpers ──

function openDB(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // If DB doesn't exist yet, it will have no stores
    req.onupgradeneeded = () => {
      // Create meta store if it doesn't exist
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    };
  });
}

function promisifyRequest<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

function promisifyTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Client-side trigger: call this on first login.
 * Checks migration_status; if not 'complete', runs migration.
 */
export async function triggerMigrationIfNeeded(orgId: string): Promise<void> {
  // Check feature flag (defaults to false)
  const migrationEnabled = (import.meta as any).env?.NOVA_CORE_MIGRATION === 'true';
  if (!migrationEnabled) {
    return;
  }

  const status = await getMigrationStatus();
  if (status === 'complete') {
    console.log('[NOVA Core Migration] Already migrated. Skipping.');
    return;
  }

  try {
    const result = await runMigration(orgId);
    if (result.error_count > 0) {
      console.warn('[NOVA Core Migration] Partial migration. Review flagged records.');
    }
  } catch (err) {
    console.error('[NOVA Core Migration] Migration failed:', err);
  }
}
