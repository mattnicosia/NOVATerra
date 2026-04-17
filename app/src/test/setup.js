/**
 * Vitest Global Setup — runs before every test file.
 * Provides browser API mocks and cleanup for jsdom environment.
 */
import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";

// ── Browser API mocks ────────────────────────────────────────────────
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.ResizeObserver = ResizeObserverMock;

class IntersectionObserverMock {
  constructor(cb) {
    this._cb = cb;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.IntersectionObserver = IntersectionObserverMock;

// localStorage / sessionStorage polyfill for node-env tests
// (Zustand stores touch these at init — real browsers have them, jsdom has them,
// plain node does not.)
function createStoragePolyfill() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}
if (typeof globalThis.localStorage === "undefined") globalThis.localStorage = createStoragePolyfill();
if (typeof globalThis.sessionStorage === "undefined") globalThis.sessionStorage = createStoragePolyfill();

globalThis.matchMedia =
  globalThis.matchMedia ||
  vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

// URL object stubs
globalThis.URL.createObjectURL = globalThis.URL.createObjectURL || vi.fn(() => "blob:mock");
globalThis.URL.revokeObjectURL = globalThis.URL.revokeObjectURL || vi.fn();

// Canvas stub — skipped in node-env tests that don't have jsdom globals
if (typeof HTMLCanvasElement !== "undefined") {
HTMLCanvasElement.prototype.getContext =
  HTMLCanvasElement.prototype.getContext ||
  vi.fn(() => ({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: [] })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => []),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  }));
}

globalThis.scrollTo = globalThis.scrollTo || (() => {});

// ── Cleanup ──────────────────────────────────────────────────────────
afterEach(() => {
  vi.restoreAllMocks();
});
