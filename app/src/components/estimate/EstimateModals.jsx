import { useTheme } from "@/hooks/useTheme";
import DatabasePickerModal from "@/components/estimate/DatabasePickerModal";
import AIPricingModal from "@/components/estimate/AIPricingModal";
import SendToDbModal from "@/components/estimate/SendToDbModal";
import BidIntelModal from "@/components/estimate/BidIntelModal";
import CsvImportModal from "@/components/import/CsvImportModal";
import AssemblyPickerModal from "@/components/estimate/AssemblyPickerModal";
import AIScopeGenerateModal from "@/components/estimate/AIScopeGenerateModal";
import TakeoffNOVAPanel from "@/components/takeoffs/TakeoffNOVAPanel";
import VersionHistoryPanel from "@/components/estimate/VersionHistoryPanel";

export default function EstimateModals({
  sendToDbItem,
  setSendToDbItem,
  bidIntelOpen,
  setBidIntelOpen,
  csvImportOpen,
  setCsvImportOpen,
  showAssemblyPicker,
  setShowAssemblyPicker,
  showScopeGenerate,
  setShowScopeGenerate,
  handleInsertAssembly,
  handleInsertDbItem,
  showNova,
  setShowNova,
  showHistory,
  setShowHistory,
  activeEstimateId,
}) {
  const C = useTheme();

  return (
    <>
      {/* Modals */}
      <DatabasePickerModal />
      <AIPricingModal />
      {sendToDbItem && <SendToDbModal item={sendToDbItem} onClose={() => setSendToDbItem(null)} />}
      {bidIntelOpen && <BidIntelModal onClose={() => setBidIntelOpen(false)} />}
      {csvImportOpen && <CsvImportModal onClose={() => setCsvImportOpen(false)} mode="append" />}
      {showAssemblyPicker && (
        <AssemblyPickerModal
          onClose={() => setShowAssemblyPicker(false)}
          onInsertAssembly={handleInsertAssembly}
          onInsertItem={handleInsertDbItem}
        />
      )}
      {showScopeGenerate && <AIScopeGenerateModal onClose={() => setShowScopeGenerate(false)} />}

      {/* NOVA AI sidebar */}
      {showNova && (
        <>
          <div
            onClick={() => setShowNova(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.15)",
              zIndex: 99,
            }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: 340,
              zIndex: 100,
              background: C.bg1,
              borderLeft: `1px solid ${C.border}`,
              boxShadow: "-8px 0 24px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <TakeoffNOVAPanel context="estimate" />
          </div>
        </>
      )}

      {/* Version History sidebar */}
      {showHistory && (
        <>
          <div
            onClick={() => setShowHistory(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.15)",
              zIndex: 99,
            }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: 340,
              zIndex: 100,
              background: C.bg1,
              borderLeft: `1px solid ${C.border}`,
              boxShadow: "-8px 0 24px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <VersionHistoryPanel estimateId={activeEstimateId} onClose={() => setShowHistory(false)} />
          </div>
        </>
      )}
    </>
  );
}
