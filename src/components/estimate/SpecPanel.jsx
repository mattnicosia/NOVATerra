import { useTheme } from '@/hooks/useTheme';
import { useItemsStore } from '@/stores/itemsStore';
import { useSpecsStore } from '@/stores/specsStore';
import { useDatabaseStore } from '@/stores/databaseStore';
import { useUiStore } from '@/stores/uiStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, bt } from '@/utils/styles';

export default function SpecPanel({ item }) {
  const C = useTheme();
  const updateItem = useItemsStore(s => s.updateItem);
  const specs = useSpecsStore(s => s.specs);
  const elements = useDatabaseStore(s => s.elements);
  const setEstShowSpec = useUiStore(s => s.setEstShowSpec);

  // Find database element variants matching this item's code prefix
  const codePrefix = item.code ? item.code.split(".").slice(0, 2).join(".") : "";
  const variants = codePrefix ? elements.filter(e => e.code && e.code.startsWith(codePrefix) && e.name !== item.description) : [];

  return (
    <div style={{ padding: "8px 12px 8px 60px", background: C.bg2, borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${C.purple}`, animation: "fadeIn 0.15s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: 0.8 }}>
          Specification — {item.description.substring(0, 40)}
        </div>
        <button className="icon-btn" onClick={() => setEstShowSpec(null)}
          style={{ width: 16, height: 16, border: "none", background: "transparent", color: C.textDim, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Ic d={I.x} size={9} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
        <div style={{ flex: "0 0 200px" }}>
          <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>Spec Section</div>
          {specs.length > 0 ? (
            <select value={item.specSection || ""} onChange={e => updateItem(item.id, "specSection", e.target.value)}
              style={inp(C, { width: "100%", padding: "5px 8px", fontSize: 12 })}>
              <option value="">— Select Section —</option>
              {specs.map(sp => <option key={sp.id} value={sp.section || sp.id}>{sp.section || sp.name || sp.id}</option>)}
            </select>
          ) : (
            <input value={item.specSection || ""} onChange={e => updateItem(item.id, "specSection", e.target.value)}
              placeholder="e.g. 07 61 00"
              style={inp(C, { width: "100%", padding: "5px 8px", fontSize: 12 })} />
          )}
        </div>
        {variants.length > 0 && (
          <div style={{ flex: "0 0 200px" }}>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>Spec Variant</div>
            <select value={item.specVariantLabel || ""} onChange={e => {
              updateItem(item.id, "specVariantLabel", e.target.value);
              if (e.target.value) {
                const variant = variants.find(v => v.name === e.target.value);
                if (variant) {
                  updateItem(item.id, "material", variant.material || 0);
                  updateItem(item.id, "labor", variant.labor || 0);
                  updateItem(item.id, "equipment", variant.equipment || 0);
                }
              }
            }} style={inp(C, { width: "100%", padding: "5px 8px", fontSize: 12 })}>
              <option value="">— Base Spec —</option>
              {variants.map(v => <option key={v.id || v.code} value={v.name}>{v.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>Written Specification</div>
        <textarea value={item.specText || ""} onChange={e => updateItem(item.id, "specText", e.target.value)}
          placeholder="e.g. 24ga Galvalume, PVDF finish, Pac-Clad or equal, include underlayment and trim"
          rows={2} style={inp(C, { width: "100%", fontSize: 12, padding: "5px 8px", resize: "vertical", minHeight: 36 })} />
      </div>
    </div>
  );
}
