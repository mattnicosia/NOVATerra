import { useRef } from "react";
import { MODULE_LIST } from "@/constants/modules";

export default function TakeoffModuleSelector({ C, T, activeModule, setActiveModule }) {
  const lastModuleRef = useRef(null);

  return (
    <div style={{ padding: "8px 10px 8px", borderBottom: `1px solid ${C.border}` }}>
      <div
        style={{
          display: "flex",
          gap: 0,
          background: C.bg2,
          borderRadius: 5,
          padding: 2,
          marginBottom: activeModule ? 7 : 0,
        }}
      >
        <button
          onClick={() => setActiveModule(null)}
          style={{
            flex: 1,
            padding: "4px 0",
            fontSize: 10,
            fontWeight: 600,
            background: !activeModule ? C.accent : "transparent",
            color: !activeModule ? "#fff" : C.textDim,
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            transition: "all 0.15s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke={!activeModule ? "#fff" : C.textDim}
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01" />
          </svg>
          All
        </button>
        <button
          onClick={() => {
            if (activeModule) return;
            const last = lastModuleRef.current || MODULE_LIST.find(b => b.available)?.id || null;
            if (last) setActiveModule(last);
          }}
          style={{
            flex: 1,
            padding: "4px 0",
            fontSize: 10,
            fontWeight: 600,
            background: activeModule ? C.accent : "transparent",
            color: activeModule ? "#fff" : C.textDim,
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            transition: "all 0.15s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke={activeModule ? "#fff" : C.textDim}
            strokeWidth="2"
            strokeLinecap="round"
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Modules
        </button>
      </div>
      {activeModule && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {MODULE_LIST.map(b => {
            const isActive = activeModule === b.id;
            return (
              <button
                key={b.id}
                onClick={() => b.available && setActiveModule(b.id)}
                style={{
                  padding: "3px 9px",
                  fontSize: 9,
                  fontWeight: 600,
                  border: `1px solid ${isActive ? C.accent + "60" : C.border}`,
                  background: isActive ? C.accent + "15" : "transparent",
                  color: isActive ? C.accent : b.available ? C.textMuted : C.textDimmer,
                  borderRadius: 4,
                  cursor: b.available ? "pointer" : "default",
                  opacity: b.available ? 1 : 0.4,
                  transition: "all 0.15s",
                }}
                title={b.available ? `${b.name} Module` : `${b.name} Module (Coming Soon)`}
              >
                {b.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
