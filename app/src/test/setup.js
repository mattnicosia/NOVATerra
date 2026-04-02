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

// Canvas stub
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

globalThis.scrollTo = vi.fn();

// ── Cleanup ──────────────────────────────────────────────────────────
afterEach(() => {
  vi.restoreAllMocks();
});
