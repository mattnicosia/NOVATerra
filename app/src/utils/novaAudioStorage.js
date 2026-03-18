// novaAudioStorage — IndexedDB helpers for NOVA custom audio blobs
// Stores audio as base64 data URLs via the existing storage utility.
// Slots: 'drone', 'textPing', 'activation'

import { storage } from '@/utils/storage';
import { useNovaAudioStore } from '@/stores/novaAudioStore';

const KEY_PREFIX = 'nova-audio-';
const META_KEY = 'nova-audio-meta';

/** Save an audio File to IndexedDB + update store metadata */
export async function saveAudioBlob(slot, file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Convert to base64 in chunks to avoid stack overflow on large files
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  const dataUrl = `data:${file.type};base64,${base64}`;

  // Store audio blob
  await storage.set(`${KEY_PREFIX}${slot}`, dataUrl);

  // Update metadata in store + persist
  const meta = { name: file.name, size: file.size, type: file.type };
  useNovaAudioStore.getState().setAudioAsset(slot, meta);
  await persistMeta();
}

/** Load an audio data URL from IndexedDB */
export async function loadAudioBlob(slot) {
  const result = await storage.get(`${KEY_PREFIX}${slot}`);
  return result?.value || null;
}

/** Remove audio from a slot */
export async function removeAudioBlob(slot) {
  await storage.delete(`${KEY_PREFIX}${slot}`);
  useNovaAudioStore.getState().removeAudioAsset(slot);
  await persistMeta();
}

/** Save a volume level for a slot */
export async function saveSlotVolume(slot, level) {
  useNovaAudioStore.getState().setSlotVolume(slot, level);
  await persistMeta();
}

/** Load metadata + volumes on app startup */
export async function loadAudioMeta() {
  const result = await storage.get(META_KEY);
  if (result?.value) {
    try {
      const data = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
      // Support both old format (just assets) and new format (assets + volumes)
      if (data.assets) {
        useNovaAudioStore.getState().setAllAssets(data.assets);
        if (data.volumes) useNovaAudioStore.getState().setAllVolumes(data.volumes);
      } else {
        // Old format: entire object is the assets map
        useNovaAudioStore.getState().setAllAssets(data);
      }
    } catch { /* ignore corrupt data */ }
  }
}

/** Persist current metadata + volumes to IndexedDB */
async function persistMeta() {
  const { audioAssets, volumes } = useNovaAudioStore.getState();
  await storage.set(META_KEY, JSON.stringify({ assets: audioAssets, volumes }));
}
