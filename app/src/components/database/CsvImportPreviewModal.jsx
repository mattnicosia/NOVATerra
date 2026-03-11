import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useUiStore } from "@/stores/uiStore";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";
import { fmt2 } from "@/utils/format";
import { parseImportCsv } from "@/utils/csvExport";

export default function CsvImportPreviewModal({ onClose }) {
  const C = useTheme();
  const addElement = useDatabaseStore(s => s.addElement);
  const showToast = useUiStore(s => s.showToast);

  const [rows, setRows] = useState(null);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);

  const handleFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = parseImportCsv(ev.target.result);
      setRows(result.rows);
      setErrors(result.errors);
    };
    reader.readAsText(file);
  };

  const toggleRow = idx => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, _selected: !r._selected } : r)));
  };

  const toggleAll = () => {
    const allSelected = rows.every(r => r._selected);
    setRows(prev => prev.map(r => ({ ...r, _selected: !allSelected })));
  };

  const handleImport = () => {
    if (!rows) return;
    setImporting(true);
    const selected = rows.filter(r => r._selected);
    for (const r of selected) {
      addElement({
        code: r.code,
        name: r.name,
        unit: r.unit,
        material: r.material,
        labor: r.labor,
        equipment: r.equipment,
        subcontractor: r.subcontractor,
        trade: r.trade,
        source: "user",
      });
    }
    showToast(`Imported ${selected.length} item${selected.length !== 1 ? "s" : ""} to your cost library`, "success");
    onClose();
  };

  const selectedCount = rows ? rows.filter(r => r._selected).length : 0;

  return (
    <Modal onClose={onClose} width={700}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
          <Ic d={I.upload} size={14} color={C.accent} /> Import CSV to Cost Library
        </h3>
        <button
          onClick={onClose}
          style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer" }}
        >
          <Ic d={I.x} size={16} />
        </button>
      </div>

      {!rows && (
        <div style={{ padding: "24px 0", textAlign: "center" }}>
          <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
            Select a CSV file with columns: Code, Name, Unit, Material, Labor, Equipment, Trade
          </p>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              background: C.accent,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <Ic d={I.upload} size={12} color="#fff" />
            Choose File
            <input type="file" accept=".csv,.tsv,.txt" onChange={handleFile} style={{ display: "none" }} />
          </label>
        </div>
      )}

      {errors.length > 0 && (
        <div
          style={{
            padding: "8px 12px",
            background: `${C.red}10`,
            border: `1px solid ${C.red}30`,
            borderRadius: 6,
            marginBottom: 8,
          }}
        >
          {errors.map((err, i) => (
            <div key={i} style={{ fontSize: 11, color: C.red }}>
              {err}
            </div>
          ))}
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
            {rows.length} item{rows.length !== 1 ? "s" : ""} found &middot; {selectedCount} selected
          </div>
          <div
            style={{
              maxHeight: 340,
              overflowY: "auto",
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: C.bg2, position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: C.textDim }}>
                    <input type="checkbox" checked={rows.every(r => r._selected)} onChange={toggleAll} />
                  </th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: C.textDim }}>Code</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: C.textDim }}>Name</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: C.textDim }}>Unit</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.green }}>Material</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.blue }}>Labor</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.orange }}>
                    Equipment
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() => toggleRow(i)}
                    style={{
                      cursor: "pointer",
                      borderBottom: `1px solid ${C.border}`,
                      opacity: r._selected ? 1 : 0.4,
                      background: r._selected ? "transparent" : `${C.bg2}60`,
                    }}
                  >
                    <td style={{ padding: "5px 8px" }}>
                      <input
                        type="checkbox"
                        checked={r._selected}
                        onChange={() => toggleRow(i)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td style={{ padding: "5px 8px", color: C.purple, fontWeight: 600 }}>{r.code || "—"}</td>
                    <td
                      style={{
                        padding: "5px 8px",
                        color: C.text,
                        maxWidth: 180,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.name}
                    </td>
                    <td style={{ padding: "5px 8px", color: C.textMuted }}>{r.unit}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: C.green }}>{fmt2(r.material)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: C.blue }}>{fmt2(r.labor)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: C.orange }}>{fmt2(r.equipment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={onClose}
              style={bt(C, {
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                padding: "6px 14px",
                fontSize: 12,
              })}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={selectedCount === 0 || importing}
              style={bt(C, {
                background: selectedCount > 0 ? C.green : C.border,
                color: "#fff",
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                opacity: selectedCount > 0 ? 1 : 0.5,
              })}
            >
              Import {selectedCount} Item{selectedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </>
      )}

      {rows && rows.length === 0 && errors.length === 0 && (
        <div style={{ padding: 16, textAlign: "center", color: C.textMuted, fontSize: 12 }}>
          No data rows found in the CSV file.
        </div>
      )}
    </Modal>
  );
}
