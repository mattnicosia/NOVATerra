import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";
import AssemblyCard from "@/components/shared/AssemblyCard";
import EmptyState from "@/components/shared/EmptyState";

export default function AssembliesTab({
  C,
  T,
  assemblies,
  dbAssemblySearch,
  setDbAssemblySearch,
  addAssembly,
  removeAssembly,
  setAiAssemblyOpen,
  showToast,
}) {
  return (
    <div
      style={{
        flex: 1,
        background: C.bg1,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 14px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
          <input
            placeholder="Search assemblies..."
            value={dbAssemblySearch}
            onChange={e => setDbAssemblySearch(e.target.value)}
            style={inp(C, { paddingLeft: 28, fontSize: 12 })}
          />
          <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>
            <Ic d={I.search} size={12} color={C.textDim} />
          </div>
        </div>
        <button
          className="accent-btn"
          onClick={() => setAiAssemblyOpen(true)}
          style={bt(C, {
            background: `linear-gradient(135deg, ${C.accent}, ${C.accentAlt || C.purple})`,
            color: "#fff",
            padding: "5px 14px",
            fontSize: 10,
            border: "none",
            boxShadow: `0 1px 6px ${C.accent}30`,
          })}
        >
          <Ic d={I.ai} size={12} color="#fff" /> AI Generate
        </button>
        <button
          className="accent-btn"
          onClick={() => {
            addAssembly({ code: "", name: "New Assembly", description: "", elements: [] });
            showToast("New assembly created");
          }}
          style={bt(C, { background: C.accent, color: "#fff", padding: "5px 12px", fontSize: 10 })}
        >
          <Ic d={I.plus} size={11} color="#fff" sw={2.5} /> Create Assembly
        </button>
        <span style={{ fontSize: 10, color: C.textDim }}>{assemblies.length} assemblies</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {assemblies
          .filter(asm => {
            if (!dbAssemblySearch) return true;
            const q = dbAssemblySearch.toLowerCase();
            return (
              (asm.name || "").toLowerCase().includes(q) ||
              (asm.code || "").toLowerCase().includes(q) ||
              (asm.description || "").toLowerCase().includes(q)
            );
          })
          .map(asm => (
            <AssemblyCard
              key={asm.id}
              asm={asm}
              onDelete={id => {
                if (confirm(`Delete assembly "${asm.name}"?`)) {
                  removeAssembly(id);
                  showToast("Assembly deleted");
                }
              }}
            />
          ))}
        {assemblies.length === 0 && (
          <EmptyState
            icon={I.assembly}
            title="No assemblies yet"
            subtitle="Assemblies are pre-built combinations of scope items. Create one or use AI to generate."
            action={() => setAiAssemblyOpen(true)}
            actionLabel="AI Generate"
            actionIcon={I.ai}
          />
        )}
      </div>
    </div>
  );
}
