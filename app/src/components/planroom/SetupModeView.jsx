// SetupModeView — First-time focused upload experience for new estimates
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";

export default function SetupModeView({ C, T, estId, hasProcessing, scanProgress, handleUpload, stopScan }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  const isProcessing = hasProcessing || scanProgress.phase;

  const handleSkip = () => {
    useProjectStore.getState().setProject({ ...useProjectStore.getState().project, setupComplete: true });
    if (estId) navigate(`/estimate/${estId}/info`);
  };

  const onDragOver = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };
  const onDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUpload(files);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100%",
        padding: T.space[7],
        fontFamily: T.font.sans,
      }}
    >
      <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "center" }}>
          <Ic d={I.ai} size={32} color={C.accent} />
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: C.text,
            margin: 0,
            marginBottom: 6,
            fontFamily: T.font.sans,
          }}
        >
          Upload Your Construction Plans
        </h1>
        <p style={{ fontSize: 12, color: C.textDim, margin: 0, marginBottom: 28, lineHeight: 1.6 }}>
          Drop your PDF plans below and NOVA will automatically extract project details, detect schedules, and
          generate a rough order of magnitude estimate.
        </p>
        {isProcessing ? (
          <div
            style={{
              ...card(C),
              padding: "24px 28px",
              marginBottom: 20,
              textAlign: "left",
              border: `1px solid ${C.accent}20`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Ic d={I.ai} size={18} color={C.accent} />
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>NOVA is analyzing your drawings...</div>
            </div>
            {scanProgress.phase && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>
                  {scanProgress.message}
                  <span style={{ float: "right" }}>
                    {scanProgress.phase === "detect"
                      ? "Phase 1/4"
                      : scanProgress.phase === "notes"
                        ? "Phase 2/4"
                        : scanProgress.phase === "parse"
                          ? "Phase 3/4"
                          : "Phase 4/4"}
                  </span>
                </div>
                <div style={{ height: 4, background: C.bg2, borderRadius: 2, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 2,
                      transition: "width 0.3s ease",
                      background: `linear-gradient(90deg, ${C.accent}, ${C.purple || C.accent})`,
                      width:
                        scanProgress.total > 0
                          ? `${Math.round((scanProgress.current / scanProgress.total) * 100)}%`
                          : "0%",
                    }}
                  />
                </div>
              </div>
            )}
            {!scanProgress.phase && hasProcessing && (
              <div style={{ fontSize: 10, color: C.textDim }}>Processing uploaded documents...</div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <div style={{ fontSize: 9, color: C.textDim }}>
                This may take a minute depending on the number of sheets. Project info will be auto-filled from your
                title blocks.
              </div>
              <button
                onClick={() => {
                  stopScan();
                  setRescanning(false);
                }}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.red || "#ef4444"}30`,
                  color: C.red || "#ef4444",
                  fontSize: 9,
                  fontWeight: 600,
                  padding: "4px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: T.font.sans,
                  flexShrink: 0,
                  marginLeft: 12,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = `${C.red || "#ef4444"}10`;
                  e.currentTarget.style.borderColor = `${C.red || "#ef4444"}50`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = `${C.red || "#ef4444"}30`;
                }}
              >
                Stop
              </button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              ...card(C),
              padding: "40px 24px",
              textAlign: "center",
              cursor: "pointer",
              border: dragOver ? `2px dashed ${C.accent}` : `2px dashed ${C.border}`,
              background: dragOver ? `${C.accent}08` : C.glassBg,
              transition: "all 0.2s ease",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: T.radius.lg,
                background: `${C.accent}12`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
                marginBottom: 14,
              }}
            >
              <Ic d={I.upload} size={26} color={C.accent} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
              {dragOver ? "Drop files here" : "Drop PDF plans here or click to browse"}
            </div>
            <div style={{ fontSize: 10, color: C.textDim }}>
              PDF drawings, specifications, addenda — any project document
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx,.ifc,.dwg,.dxf,image/*"
              style={{ display: "none" }}
              onChange={e => {
                handleUpload(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
          </div>
        )}
        {!isProcessing && (
          <button
            onClick={handleSkip}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              color: C.textDim,
              padding: "8px 16px",
              fontFamily: T.font.sans,
              transition: "color 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = C.text)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textDim)}
          >
            Skip — I don't have plans yet →
          </button>
        )}
      </div>
    </div>
  );
}
