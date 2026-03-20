// MaterialPicker.jsx — Structured material assignment for 3D model elements
// Replaces free-text spec fields with searchable catalog picker + swap impact analysis

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useModelStore } from "@/stores/modelStore";
import { useProductStore } from "@/stores/productStore";
import { bt, inp, card } from "@/utils/styles";
import { getMaterial, searchMaterials, getCategories, getMaterialsForElement, computeSwapImpact } from "@/utils/materialEngine";
import { MATERIAL_CATEGORIES } from "@/constants/materialCatalog";
import { fmt } from "@/utils/format";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function MaterialPicker({ element }) {
  const C = useTheme();
  const T = C.T;

  const materialAssignments = useModelStore(s => s.materialAssignments);
  const assignMaterial = useModelStore(s => s.assignMaterial);
  const removeMaterialAssignment = useModelStore(s => s.removeMaterialAssignment);

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [pendingSlug, setPendingSlug] = useState(null);

  // Current assignment
  const currentAssignment = element ? materialAssignments?.[element.id] : null;
  const currentSlug = currentAssignment?.slug || null;
  const currentMat = useMemo(() => currentSlug ? getMaterial(currentSlug) : null, [currentSlug]);

  // Categories
  const categories = useMemo(() => getCategories(), []);

  // Suggested materials for this element type/trade
  const suggestions = useMemo(() => {
    if (!element) return [];
    return getMaterialsForElement(element);
  }, [element]);

  // Search/filter results
  const results = useMemo(() => {
    if (!query && !activeCategory) return [];
    let list = query ? searchMaterials(query) : suggestions;
    if (activeCategory) list = list.filter(m => m.category === activeCategory);
    return list;
  }, [query, activeCategory, suggestions]);

  // Swap impact when hovering/selecting a new material
  const swapImpact = useMemo(() => {
    if (!pendingSlug || !currentSlug || pendingSlug === currentSlug) return null;
    return computeSwapImpact(currentSlug, pendingSlug, { areaSF: 1 });
  }, [pendingSlug, currentSlug]);

  const handleSelect = useCallback((slug) => {
    if (!element) return;
    assignMaterial(element.id, slug);
    setPendingSlug(null);
    setQuery("");
    setActiveCategory(null);
  }, [element, assignMaterial]);

  const handleRemove = useCallback(() => {
    if (!element) return;
    removeMaterialAssignment(element.id);
    setPendingSlug(null);
  }, [element, removeMaterialAssignment]);

  if (!element) {
    return (
      <div style={{ ...card(C), padding: T.space[4], textAlign: "center" }}>
        <div style={{ fontSize: T.fontSize.sm, color: C.textDim }}>
          Select an element to assign materials
        </div>
      </div>
    );
  }

  const showingResults = query.length > 0 || activeCategory;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>

      {/* ── Current Assignment ─────────────────────────── */}
      <div style={{ ...card(C), padding: T.space[3] }}>
        <div style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: C.accent,
          marginBottom: T.space[2],
          fontFamily: T.font.display,
        }}>
          Material
        </div>

        {currentMat ? (
          <div>
            {/* Material header row */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: T.space[2],
              marginBottom: T.space[2],
            }}>
              <Swatch color={currentMat.visual?.color} T={T} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: T.fontSize.sm,
                  fontWeight: T.fontWeight.bold,
                  color: C.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: T.font.display,
                }}>
                  {currentMat.name}
                </div>
                {currentMat.manufacturer && (
                  <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
                    {currentMat.manufacturer}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                style={{
                  ...bt(C),
                  padding: "3px 6px",
                  fontSize: 8,
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textDim,
                  borderRadius: T.radius.sm,
                }}
              >
                <Ic
                  d={I.chevron}
                  size={8}
                  color={C.textDim}
                  style={{ transform: showDetails ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
                />
              </button>
            </div>

            {/* Cost summary row */}
            {currentMat.cost && (
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "4px 0",
                borderTop: `1px solid ${C.border}20`,
              }}>
                <span style={{ fontSize: T.fontSize.xs, color: C.textDim }}>Unit Cost</span>
                <span style={{
                  fontSize: T.fontSize.sm,
                  fontWeight: T.fontWeight.bold,
                  fontFamily: T.font.sans,
                  color: C.text,
                }}>
                  {fmt(currentMat.cost.material || 0)}/{currentMat.cost.unit || "ea"}
                </span>
              </div>
            )}

            {/* Expanded details */}
            {showDetails && (
              <MaterialDetails mat={currentMat} C={C} T={T} />
            )}

            {/* Remove button */}
            <button
              onClick={handleRemove}
              style={{
                ...bt(C),
                width: "100%",
                justifyContent: "center",
                padding: "4px 8px",
                fontSize: T.fontSize.xs,
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textDim,
                borderRadius: T.radius.sm,
                marginTop: T.space[2],
                gap: 4,
              }}
            >
              <Ic d={I.x} size={9} color={C.textDim} />
              Remove Material
            </button>
          </div>
        ) : (
          <div style={{
            padding: "8px",
            borderRadius: T.radius.sm,
            background: `${C.orange}10`,
            border: `1px solid ${C.orange}25`,
            fontSize: T.fontSize.xs,
            color: C.orange,
            textAlign: "center",
          }}>
            No material assigned
          </div>
        )}
      </div>

      {/* ── Search ─────────────────────────────────────── */}
      <div style={{ ...card(C), padding: T.space[3] }}>
        <div style={{ position: "relative", marginBottom: T.space[2] }}>
          <Ic
            d={I.search}
            size={11}
            color={C.textDim}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search materials..."
            style={{
              ...inp(C),
              width: "100%",
              padding: "6px 8px 6px 26px",
              fontSize: T.fontSize.xs,
              boxSizing: "border-box",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "flex",
              }}
            >
              <Ic d={I.x} size={9} color={C.textDim} />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          marginBottom: showingResults ? T.space[2] : 0,
        }}>
          {categories.map(cat => (
            <button
              key={cat.slug}
              onClick={() => setActiveCategory(activeCategory === cat.slug ? null : cat.slug)}
              style={{
                ...bt(C),
                padding: "2px 8px",
                fontSize: 9,
                borderRadius: T.radius.sm,
                background: activeCategory === cat.slug ? `${C.accent}25` : C.bg2,
                color: activeCategory === cat.slug ? C.accent : C.textMuted,
                border: `1px solid ${activeCategory === cat.slug ? `${C.accent}40` : C.border}`,
                gap: 3,
              }}
            >
              {cat.icon && <span style={{ fontSize: 9 }}>{cat.icon}</span>}
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search results */}
        {showingResults && (
          <div style={{
            maxHeight: 200,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}>
            {results.length === 0 ? (
              <div style={{
                padding: T.space[2],
                textAlign: "center",
                fontSize: T.fontSize.xs,
                color: C.textDim,
              }}>
                No materials found
              </div>
            ) : (
              results.map(mat => (
                <MaterialRow
                  key={mat.slug}
                  mat={mat}
                  isActive={currentSlug === mat.slug}
                  C={C}
                  T={T}
                  onSelect={() => handleSelect(mat.slug)}
                  onHover={() => setPendingSlug(mat.slug)}
                  onLeave={() => setPendingSlug(null)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Suggestions ────────────────────────────────── */}
      {suggestions.length > 0 && !showingResults && (
        <div style={{ ...card(C), padding: T.space[3] }}>
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              width: "100%",
              marginBottom: showSuggestions ? T.space[2] : 0,
            }}
          >
            <Ic
              d={I.chevron}
              size={8}
              color={C.textDim}
              style={{ transform: showSuggestions ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            />
            <span style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: C.accent,
              fontFamily: T.font.display,
            }}>
              Suggested ({suggestions.length})
            </span>
          </button>

          {showSuggestions && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {suggestions.map(mat => (
                <MaterialRow
                  key={mat.slug}
                  mat={mat}
                  isActive={currentSlug === mat.slug}
                  C={C}
                  T={T}
                  onSelect={() => handleSelect(mat.slug)}
                  onHover={() => setPendingSlug(mat.slug)}
                  onLeave={() => setPendingSlug(null)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Product Search (Home Depot / BIMobject) ───── */}
      <ProductSearchPanel C={C} T={T} />

      {/* ── Swap Impact ────────────────────────────────── */}
      {swapImpact && (
        <div style={{
          ...card(C),
          padding: T.space[3],
          border: `1px solid ${C.accent}40`,
        }}>
          <div style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: C.accent,
            marginBottom: T.space[2],
            fontFamily: T.font.display,
          }}>
            Swap Impact
          </div>

          {/* Cost delta */}
          {swapImpact.costDelta != null && (
            <ImpactRow
              C={C}
              T={T}
              label="Cost"
              value={`${swapImpact.costDelta >= 0 ? "+" : ""}${fmt(swapImpact.costDelta)}`}
              color={swapImpact.costDelta <= 0 ? C.green : "#EF4444"}
            />
          )}

          {/* Lead time delta */}
          {swapImpact.leadTimeDelta != null && (
            <ImpactRow
              C={C}
              T={T}
              label="Lead Time"
              value={`${swapImpact.leadTimeDelta >= 0 ? "+" : ""}${swapImpact.leadTimeDelta}d`}
              color={swapImpact.leadTimeDelta <= 0 ? C.green : C.orange}
            />
          )}

          {/* Schedule delta */}
          {swapImpact.scheduleDelta != null && (
            <ImpactRow
              C={C}
              T={T}
              label="Schedule"
              value={`${swapImpact.scheduleDelta >= 0 ? "+" : ""}${swapImpact.scheduleDelta}d`}
              color={swapImpact.scheduleDelta <= 0 ? C.green : C.orange}
            />
          )}
        </div>
      )}
    </div>
  );
}


// ── Sub-components ────────────────────────────────────────────────

function Swatch({ color, T }) {
  return (
    <div style={{
      width: 16,
      height: 16,
      borderRadius: T.radius.sm,
      background: color || "#666",
      border: "1px solid rgba(255,255,255,0.12)",
      flexShrink: 0,
    }} />
  );
}

function MaterialRow({ mat, isActive, C, T, onSelect, onHover, onLeave }) {
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        ...bt(C),
        width: "100%",
        padding: "5px 8px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: isActive ? `${C.accent}15` : "transparent",
        borderRadius: T.radius.sm,
        border: isActive ? `1px solid ${C.accent}40` : `1px solid transparent`,
        transition: "all 0.15s ease",
      }}
    >
      <Swatch color={mat.visual?.color} T={T} />
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{
          fontSize: T.fontSize.xs,
          color: isActive ? C.accent : C.text,
          fontWeight: isActive ? T.fontWeight.bold : T.fontWeight.normal,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: T.font.display,
        }}>
          {mat.name}
        </div>
        {mat.manufacturer && (
          <div style={{ fontSize: 8, color: C.textDim, marginTop: 1 }}>
            {mat.manufacturer}
          </div>
        )}
      </div>
      {mat.cost?.material != null && (
        <span style={{
          fontSize: 9,
          color: C.textMuted,
          fontFamily: T.font.sans,
          flexShrink: 0,
        }}>
          {fmt(mat.cost.material)}/{mat.cost.unit || "ea"}
        </span>
      )}
      {isActive && (
        <Ic d={I.check} size={10} color={C.accent} />
      )}
    </button>
  );
}

function MaterialDetails({ mat, C, T }) {
  return (
    <div style={{
      marginTop: T.space[2],
      paddingTop: T.space[2],
      borderTop: `1px solid ${C.border}20`,
      display: "flex",
      flexDirection: "column",
      gap: T.space[1],
    }}>
      {/* Cost breakdown */}
      {mat.cost && (
        <DetailSection label="Cost Breakdown" C={C} T={T}>
          {mat.cost.material != null && (
            <DetailLine C={C} T={T} label="Material" value={`${fmt(mat.cost.material)}/${mat.cost.unit || "ea"}`} />
          )}
          {mat.cost.labor != null && (
            <DetailLine C={C} T={T} label="Labor" value={`${fmt(mat.cost.labor)}/${mat.cost.unit || "ea"}`} />
          )}
          {mat.cost.equipment != null && (
            <DetailLine C={C} T={T} label="Equipment" value={`${fmt(mat.cost.equipment)}/${mat.cost.unit || "ea"}`} />
          )}
          {mat.cost.total != null && (
            <DetailLine C={C} T={T} label="Total" value={`${fmt(mat.cost.total)}/${mat.cost.unit || "ea"}`} bold />
          )}
        </DetailSection>
      )}

      {/* Assembly layers */}
      {mat.assembly?.layers?.length > 0 && (
        <DetailSection label="Assembly Layers" C={C} T={T}>
          {mat.assembly.layers.map((layer, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "2px 0",
                fontSize: T.fontSize.xs,
                borderBottom: `1px solid ${C.border}10`,
              }}
            >
              <span style={{
                color: C.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                fontFamily: T.font.display,
              }}>
                {layer.name || `Layer ${i + 1}`}
              </span>
              {layer.thickness && (
                <span style={{
                  fontSize: 9,
                  color: C.textDim,
                  fontFamily: T.font.sans,
                  flexShrink: 0,
                  marginLeft: 8,
                }}>
                  {layer.thickness}
                </span>
              )}
            </div>
          ))}
        </DetailSection>
      )}

      {/* Schedule / lead time */}
      {mat.schedule && (
        <DetailSection label="Schedule" C={C} T={T}>
          {mat.schedule.leadTime != null && (
            <DetailLine C={C} T={T} label="Lead Time" value={`${mat.schedule.leadTime} days`} />
          )}
          {mat.schedule.installRate && (
            <DetailLine C={C} T={T} label="Install Rate" value={mat.schedule.installRate} />
          )}
          {mat.schedule.crew && (
            <DetailLine C={C} T={T} label="Crew Size" value={mat.schedule.crew} />
          )}
        </DetailSection>
      )}

      {/* Specs / properties */}
      {mat.specs && Object.keys(mat.specs).length > 0 && (
        <DetailSection label="Specifications" C={C} T={T}>
          {Object.entries(mat.specs).map(([k, v]) => (
            <DetailLine key={k} C={C} T={T} label={k} value={String(v)} />
          ))}
        </DetailSection>
      )}
    </div>
  );
}

function DetailSection({ label, C, T, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 9,
          color: C.textDim,
          fontFamily: T.font.display,
          width: "100%",
        }}
      >
        <Ic
          d={I.chevron}
          size={8}
          color={C.textDim}
          style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
        />
        {label}
      </button>
      {open && (
        <div style={{ paddingLeft: 12, marginTop: 2 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function DetailLine({ C, T, label, value, bold }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "2px 0",
      borderBottom: `1px solid ${C.border}10`,
    }}>
      <span style={{ fontSize: T.fontSize.xs, color: C.textDim, fontFamily: T.font.display }}>{label}</span>
      <span style={{
        fontSize: T.fontSize.xs,
        color: C.text,
        fontFamily: T.font.sans,
        fontWeight: bold ? T.fontWeight.bold : T.fontWeight.normal,
      }}>
        {value}
      </span>
    </div>
  );
}

function ProductSearchPanel({ C, T }) {
  const [open, setOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState("");
  const debounceRef = useRef(null);

  const { searchResults, loading, error, sourcesConfigured, totalItems } = useProductStore();
  const search = useProductStore(s => s.search);
  const checkSources = useProductStore(s => s.checkSources);

  // Check source configuration on mount
  useEffect(() => { checkSources(); }, [checkSources]);

  const anySourceConfigured = sourcesConfigured.homedepot || sourcesConfigured.bimobject;

  const handleInput = useCallback((val) => {
    setLocalQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => search(val), 400);
    }
  }, [search]);

  return (
    <div style={{ ...card(C), padding: T.space[3] }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          width: "100%",
        }}
      >
        <Ic
          d={I.chevron}
          size={8}
          color={C.textDim}
          style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
        />
        <span style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: C.accent,
          fontFamily: T.font.display,
        }}>
          Product Search
        </span>
        {!anySourceConfigured && (
          <span style={{
            fontSize: 8,
            color: C.orange,
            marginLeft: "auto",
          }}>
            Not configured
          </span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: T.space[2] }}>
          {!anySourceConfigured ? (
            <div style={{
              padding: T.space[2],
              borderRadius: T.radius.sm,
              background: `${C.orange}10`,
              border: `1px solid ${C.orange}25`,
              fontSize: T.fontSize.xs,
              color: C.orange,
            }}>
              Add BIGBOX_API_KEY to Vercel env vars to enable Home Depot product search with images, specs, and pricing. Sign up at bigboxapi.com (100 free requests, $15/mo after).
            </div>
          ) : (
            <>
              <div style={{ position: "relative", marginBottom: T.space[2] }}>
                <Ic
                  d={I.search}
                  size={11}
                  color={C.textDim}
                  style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                />
                <input
                  type="text"
                  value={localQuery}
                  onChange={e => handleInput(e.target.value)}
                  placeholder="Search Home Depot, BIMobject..."
                  style={{
                    ...inp(C),
                    width: "100%",
                    padding: "6px 8px 6px 26px",
                    fontSize: T.fontSize.xs,
                    boxSizing: "border-box",
                  }}
                />
                {loading && (
                  <span style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 8,
                    color: C.textDim,
                  }}>
                    Searching...
                  </span>
                )}
              </div>

              {error && (
                <div style={{
                  padding: 4,
                  fontSize: T.fontSize.xs,
                  color: "#EF4444",
                  marginBottom: T.space[1],
                }}>
                  {error}
                </div>
              )}

              {/* Source badges */}
              <div style={{ display: "flex", gap: 4, marginBottom: T.space[1] }}>
                {sourcesConfigured.homedepot && (
                  <span style={{
                    fontSize: 8,
                    padding: "1px 6px",
                    borderRadius: T.radius.sm,
                    background: "#F9630220",
                    color: "#F96302",
                    fontWeight: 600,
                  }}>
                    Home Depot (live)
                  </span>
                )}
                {sourcesConfigured.bimobject && (
                  <span style={{
                    fontSize: 8,
                    padding: "1px 6px",
                    borderRadius: T.radius.sm,
                    background: `${C.accent}20`,
                    color: C.accent,
                    fontWeight: 600,
                  }}>
                    BIMobject
                  </span>
                )}
              </div>

              {/* Results */}
              {searchResults.length > 0 && (
                <div style={{
                  maxHeight: 240,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}>
                  <div style={{ fontSize: 8, color: C.textDim, marginBottom: 2 }}>
                    {totalItems} result{totalItems !== 1 ? "s" : ""}
                  </div>
                  {searchResults.map(item => (
                    <ProductRow key={item.id} item={item} C={C} T={T} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProductRow({ item, C, T }) {
  return (
    <a
      href={item.productUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 8px",
        borderRadius: T.radius.sm,
        border: `1px solid ${C.border}`,
        textDecoration: "none",
        color: C.text,
        transition: "all 0.15s ease",
        cursor: "pointer",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${C.accent}10`; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          style={{
            width: 32,
            height: 32,
            objectFit: "contain",
            borderRadius: T.radius.sm,
            background: "#fff",
            flexShrink: 0,
          }}
        />
      ) : (
        <div style={{
          width: 32,
          height: 32,
          borderRadius: T.radius.sm,
          background: C.bg2,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 8,
          color: C.textDim,
        }}>
          N/A
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: T.fontSize.xs,
          color: C.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: T.font.display,
        }}>
          {item.name}
        </div>
        <div style={{ fontSize: 8, color: C.textDim, marginTop: 1 }}>
          {item.manufacturer}{item.rating > 0 ? ` · ${item.rating.toFixed(1)}★` : ""}{item.mpn ? ` · #${item.mpn}` : ""}
        </div>
      </div>
      {item.price > 0 && (
        <span style={{
          fontSize: 9,
          color: C.textMuted,
          fontFamily: T.font.sans,
          flexShrink: 0,
        }}>
          ${item.price.toFixed(2)}
        </span>
      )}
      <span style={{
        fontSize: 7,
        padding: "1px 4px",
        borderRadius: 3,
        background: item.source === "homedepot" ? "#F96302" + "15" : `${C.accent}15`,
        color: item.source === "homedepot" ? "#F96302" : C.accent,
        fontWeight: 600,
        flexShrink: 0,
      }}>
        {item.source === "homedepot" ? "HD" : "BIM"}
      </span>
    </a>
  );
}

function ImpactRow({ C, T, label, value, color }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "3px 0",
      borderBottom: `1px solid ${C.border}20`,
    }}>
      <span style={{ fontSize: T.fontSize.xs, color: C.textDim }}>{label}</span>
      <span style={{
        fontSize: T.fontSize.sm,
        fontWeight: T.fontWeight.bold,
        fontFamily: T.font.sans,
        color,
      }}>
        {value}
      </span>
    </div>
  );
}
