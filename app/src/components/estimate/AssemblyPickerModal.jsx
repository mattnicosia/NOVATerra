import { useTheme } from '@/hooks/useTheme';
import Modal from '@/components/shared/Modal';
import AssemblySearch from '@/components/shared/AssemblySearch';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

export default function AssemblyPickerModal({ onClose, onInsertAssembly, onInsertItem }) {
  const C = useTheme();
  return (
    <Modal onClose={onClose} wide>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, fontFamily: "'DM Sans',sans-serif" }}>
          <Ic d={I.assembly} size={16} color={C.accent} /> Add from Database
        </h3>
        <button onClick={onClose} style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer" }}>
          <Ic d={I.x} size={16} />
        </button>
      </div>
      <AssemblySearch
        onInsertAssembly={(asm) => { onInsertAssembly(asm); onClose(); }}
        onInsertItem={(el) => { onInsertItem(el); onClose(); }}
        placeholder="Search assemblies & cost database..."
        autoFocus
      />
    </Modal>
  );
}
