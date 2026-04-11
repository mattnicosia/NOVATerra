import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const {
  mockSetTkNovaHighlights,
  mockVoice,
  mockStoreState,
  callAnthropicStream,
} = vi.hoisted(() => ({
  mockSetTkNovaHighlights: vi.fn(),
  mockVoice: {
    supported: true,
    speaking: false,
    transcript: "",
    interimTranscript: "",
    startListening: vi.fn(),
    stopListening: vi.fn(),
    speak: vi.fn(),
    stopSpeaking: vi.fn(),
  },
  mockStoreState: {
    takeoffs: [],
    selectedDrawingId: "sheet-1",
    drawings: [{ id: "sheet-1", label: "A1.1", sheetNumber: "A1.1" }],
    setTkNovaHighlights: null,
  },
  callAnthropicStream: vi.fn(),
}));

mockStoreState.setTkNovaHighlights = mockSetTkNovaHighlights;

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({
    accent: "#7C5CFC",
    bg: "#101010",
    border: "#333",
    text: "#fff",
    textDim: "#bbb",
  }),
}));

vi.mock("@/stores/drawingPipelineStore", () => {
  const useDrawingPipelineStore = vi.fn(() => mockStoreState);
  useDrawingPipelineStore.getState = vi.fn(() => mockStoreState);
  return { useDrawingPipelineStore };
});

vi.mock("@/hooks/useNovaVoice", () => ({
  default: () => mockVoice,
}));

vi.mock("@/utils/ai", () => ({
  callAnthropicStream,
  optimizeImageForAI: vi.fn(),
  imageBlock: vi.fn((base64) => ({ type: "image", source: { data: base64 } })),
}));

import NovaOrb from "@/components/nova/NovaOrb";

describe("NovaOrb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVoice.supported = true;
    mockVoice.speaking = false;
    mockVoice.transcript = "";
    mockVoice.interimTranscript = "";
    mockVoice.startListening.mockImplementation(async (cb) => {
      mockVoice._onFinal = cb;
    });
    callAnthropicStream.mockImplementation(async ({ onText }) => {
      onText("Hello");
      onText("Hello there [POINT:10,20:Door]");
    });
  });

  it("replaces streamed text instead of duplicating it and clears highlights on unmount", async () => {
    const { unmount } = render(<NovaOrb canvasRef={{ current: null }} drawingImgRef={{ current: null }} />);

    fireEvent.click(screen.getByRole("button"));
    await mockVoice._onFinal("What is this?");

    expect(await screen.findByText("Hello there")).toBeInTheDocument();
    expect(screen.queryByText("HelloHello there")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockSetTkNovaHighlights).toHaveBeenCalledWith([{ xPct: 10, yPct: 20, label: "Door", screen: 0 }]);
    });

    unmount();

    expect(mockSetTkNovaHighlights).toHaveBeenLastCalledWith([]);
  });

  it("does not activate from the n shortcut while typing in a contentEditable element", () => {
    render(<NovaOrb canvasRef={{ current: null }} drawingImgRef={{ current: null }} />);

    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.tabIndex = 0;
    Object.defineProperty(editable, "isContentEditable", { value: true, configurable: true });
    document.body.appendChild(editable);
    editable.focus();

    fireEvent.keyDown(editable, { key: "n" });

    expect(mockVoice.startListening).not.toHaveBeenCalled();

    editable.remove();
  });
});
