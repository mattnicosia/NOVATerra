import { useEffect, useRef } from 'react';
import { storage } from '@/utils/storage';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import * as cloudSync from '@/utils/cloudSync';
import { idbKey } from '@/utils/idbKey';

const SEED_FLAG_KEY = 'bldg-cloud-seeded';

/**
 * One-time migration: push all existing local IndexedDB data to Supabase
 * when the user first gets cloud sync.
 *
 * Runs once after both conditions are met:
 *   1. persistenceLoaded === true (local data is in stores)
 *   2. user is authenticated (cloud push requires user_id)
 *
 * Sets a flag in IndexedDB so it never runs again on this browser.
 */
export function useInitialCloudSeed() {
  const ran = useRef(false);
  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    if (ran.current) return;
    if (!persistenceLoaded || !user) return;
    ran.current = true;

    (async () => {
      // Check if already seeded on this browser
      const flag = await storage.get(SEED_FLAG_KEY);
      if (flag) return;

      console.log('[cloudSeed] Starting initial cloud push...');
      useUiStore.getState().setCloudSyncStatus('syncing');

      try {
        // 1. Push index
        const idxRaw = await storage.get(idbKey('bldg-index'));
        let estimateIds = [];
        if (idxRaw) {
          const index = JSON.parse(idxRaw.value);
          if (Array.isArray(index) && index.length > 0) {
            await cloudSync.pushData('index', index);
            estimateIds = index.map(e => e.id);
          }
        }

        // 2. Push each estimate sequentially (avoid overwhelming Supabase)
        let pushed = 0;
        for (const estId of estimateIds) {
          const estRaw = await storage.get(idbKey(`bldg-est-${estId}`));
          if (estRaw) {
            const estData = JSON.parse(estRaw.value);
            await cloudSync.pushEstimate(estId, estData);
            pushed++;
          }
        }

        // 3. Push master data
        const masterRaw = await storage.get(idbKey('bldg-master'));
        if (masterRaw) {
          await cloudSync.pushData('master', JSON.parse(masterRaw.value));
        }

        // 4. Push settings
        const settingsRaw = await storage.get(idbKey('bldg-settings'));
        if (settingsRaw) {
          await cloudSync.pushData('settings', JSON.parse(settingsRaw.value));
        }

        // 5. Push assemblies
        const asmRaw = await storage.get(idbKey('bldg-assemblies'));
        if (asmRaw) {
          await cloudSync.pushData('assemblies', JSON.parse(asmRaw.value));
        }

        // Mark as seeded — never run again on this browser
        await storage.set(SEED_FLAG_KEY, '1');

        console.log(`[cloudSeed] Complete. Pushed ${pushed} estimates + global data.`);

        if (pushed > 0) {
          useUiStore.getState().showToast(
            `Cloud sync complete — ${pushed} estimate${pushed !== 1 ? 's' : ''} uploaded`,
            'success'
          );
        }
      } catch (err) {
        console.error('[cloudSeed] Initial cloud push failed:', err);
        useUiStore.getState().setCloudSyncStatus('error');
        // Do NOT set the flag — let it retry on next page load
      }
    })();
  }, [persistenceLoaded, user]);
}
