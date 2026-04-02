/**
 * In-memory mock of the IndexedDB storage wrapper (utils/storage.js).
 * Drop-in replacement: vi.mock("@/utils/storage", () => import("@/test/mocks/storage"))
 */
import { vi } from "vitest";

const _store = new Map();

export const storage = {
  get: vi.fn(async (key) => {
    const val = _store.get(key);
    return val !== undefined ? { value: val } : undefined;
  }),
  set: vi.fn(async (key, value) => {
    _store.set(key, value);
    return true;
  }),
  delete: vi.fn(async (key) => {
    _store.delete(key);
    return true;
  }),
  clearAll: vi.fn(async () => {
    _store.clear();
    return true;
  }),
  keys: vi.fn(async () => [..._store.keys()]),
  getUsage: vi.fn(async () => ({ usage: 0, quota: 1e9, pctUsed: "0%" })),
};

/** Expose the backing map for test assertions */
export const _backingStore = _store;

/** Reset mock state between tests */
export function resetStorage() {
  _store.clear();
  Object.values(storage).forEach((fn) => fn.mockClear?.());
}
