import { useEffect, useRef } from 'react';
import { saveEstimate, saveMasterData, saveSettings, saveAssemblies } from './usePersistence';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useProjectStore } from '@/stores/projectStore';
import { useItemsStore } from '@/stores/itemsStore';
import { useTakeoffsStore } from '@/stores/takeoffsStore';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { useBidLevelingStore } from '@/stores/bidLevelingStore';
import { useAlternatesStore } from '@/stores/alternatesStore';
import { useSpecsStore } from '@/stores/specsStore';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useDatabaseStore } from '@/stores/databaseStore';
import { useModuleStore } from '@/stores/moduleStore';
import { useUiStore } from '@/stores/uiStore';

export function useAutoSave() {
  const timer = useRef(null);
  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);

  // Watch estimate-related stores for changes
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const markup = useItemsStore(s => s.markup);
  const markupOrder = useItemsStore(s => s.markupOrder);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const drawings = useDrawingsStore(s => s.drawings);
  const bidCells = useBidLevelingStore(s => s.bidCells);
  const alternates = useAlternatesStore(s => s.alternates);
  const exclusions = useSpecsStore(s => s.exclusions);
  const moduleInstances = useModuleStore(s => s.moduleInstances);
  const elements = useDatabaseStore(s => s.elements);

  useEffect(() => {
    if (!persistenceLoaded || !activeId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveEstimate();
    }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [persistenceLoaded, activeId, project, items, markup, markupOrder, takeoffs, drawings, bidCells, alternates, exclusions, moduleInstances, elements]);

  // Watch master data
  const masterData = useMasterDataStore(s => s.masterData);
  useEffect(() => {
    if (!persistenceLoaded) return;
    saveMasterData();
  }, [persistenceLoaded, masterData]);

  // Watch settings
  const appSettings = useUiStore(s => s.appSettings);
  useEffect(() => {
    if (!persistenceLoaded) return;
    saveSettings();
  }, [persistenceLoaded, appSettings]);

  // Watch assemblies (global library)
  const assemblies = useDatabaseStore(s => s.assemblies);
  useEffect(() => {
    if (!persistenceLoaded) return;
    saveAssemblies();
  }, [persistenceLoaded, assemblies]);
}
