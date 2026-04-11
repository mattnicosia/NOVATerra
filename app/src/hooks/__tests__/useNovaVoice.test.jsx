import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import useNovaVoice from "@/hooks/useNovaVoice";

class MockRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = "en-US";
    this.maxAlternatives = 1;
    this.onstart = null;
    this.onresult = null;
    this.onend = null;
    this.onerror = null;
    this._finalTranscript = "";
  }

  start() {
    this.onstart?.();
  }

  stop() {
    this.onend?.();
  }
}

describe("useNovaVoice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.SpeechRecognition = MockRecognition;
    window.webkitSpeechRecognition = undefined;
    window.speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const MockUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
    window.SpeechSynthesisUtterance = MockUtterance;
    globalThis.SpeechSynthesisUtterance = MockUtterance;
  });

  it("returns unsupported safely when speech recognition is unavailable", () => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;

    const { result } = renderHook(() => useNovaVoice());

    expect(result.current.supported).toBe(false);
    expect(() => result.current.stopListening()).not.toThrow();
    expect(() => result.current.stopSpeaking()).not.toThrow();
  });

  it("suppresses the final callback when listening is manually cancelled", () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useNovaVoice());

    act(() => {
      result.current.startListening(onFinal);
    });
    expect(result.current.listening).toBe(true);

    act(() => {
      result.current.stopListening();
    });

    expect(result.current.listening).toBe(false);
    expect(onFinal).not.toHaveBeenCalled();
  });
});
