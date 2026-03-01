// SceneViewer.jsx — Interactive 3D building model viewer
// Renders IFC elements with hover highlighting, section plane,
// floor isolation, x-ray mode, and edge rendering.

import { useRef, useMemo, useCallback, createContext, useContext, createElement } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { useModelStore } from '@/stores/modelStore';
import { fmt } from '@/utils/format';
import { getTradeColor } from '@/utils/geometryBuilder';

// ── Clip plane context (shared across all elements) ─────────────
const ClipContext = createContext([]);
const EMPTY_PLANES = [];

function ClipProvider({ sectionY, children }) {
  const planes = useMemo(() => {
    if (sectionY === null || sectionY === undefined) return EMPTY_PLANES;
    return [new THREE.Plane(new THREE.Vector3(0, -1, 0), sectionY)];
  }, [sectionY]);
  return <ClipContext.Provider value={planes}>{children}</ClipContext.Provider>;
}

// ── Material wrapper with clipping + hover/select support ───────
function ClippedMaterial({ color, opacity, transparent, selected, hovered, xray, side }) {
  const clipPlanes = useContext(ClipContext);
  const emissive = hovered ? '#444466' : '#000000';
  const emissiveIntensity = hovered ? 0.6 : 0;
  const finalOpacity = xray ? Math.min(opacity, 0.15) : opacity;

  return (
    <meshStandardMaterial
      color={color}
      transparent={transparent || finalOpacity < 1 || xray}
      opacity={finalOpacity}
      side={side || THREE.DoubleSide}
      clippingPlanes={clipPlanes}
      clipShadows
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      depthWrite={!xray && finalOpacity >= 0.9}
    />
  );
}

// ── Wall element: extruded path ──────────────────────────────────
function WallElement({ element, selected, hovered, viewMode, maxCost, xray, onClick, onHover }) {
  const { path, height, thickness, elevation } = element.geometry;

  const geometry = useMemo(() => {
    if (!path || path.length < 2) return null;
    const shape = new THREE.Shape();
    shape.moveTo(-thickness / 2, 0);
    shape.lineTo(thickness / 2, 0);
    shape.lineTo(thickness / 2, height);
    shape.lineTo(-thickness / 2, height);
    shape.closePath();

    const pts = path.map(p => new THREE.Vector3(p.x, 0, p.z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0);

    const extrudeSettings = {
      steps: Math.max((path.length - 1) * 4, 8),
      bevelEnabled: false,
      extrudePath: curve,
    };

    try {
      return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    } catch {
      const dx = path[path.length - 1].x - path[0].x;
      const dz = path[path.length - 1].z - path[0].z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.1) return null;
      const geo = new THREE.BoxGeometry(len, height, thickness);
      geo.translate((path[0].x + path[path.length - 1].x) / 2, height / 2, (path[0].z + path[path.length - 1].z) / 2);
      return geo;
    }
  }, [path, height, thickness]);

  if (!geometry) return null;

  const color = getElementColor(element, viewMode, maxCost);
  const opacity = getElementOpacity(element, viewMode);

  return (
    <mesh
      geometry={geometry}
      position={[0, elevation, 0]}
      onClick={(e) => { e.stopPropagation(); onClick(element.id); }}
      onPointerOver={(e) => { e.stopPropagation(); onHover(element.id); }}
      onPointerOut={() => onHover(null)}
    >
      <ClippedMaterial color={color} opacity={opacity} transparent={opacity < 1} selected={selected} hovered={hovered} xray={xray} />
      {selected && <Edges threshold={15} color="#ffffff" lineWidth={1} />}
    </mesh>
  );
}

// ── Slab element: flat polygon ───────────────────────────────────
function SlabElement({ element, selected, hovered, viewMode, maxCost, xray, onClick, onHover }) {
  const { points, thickness, elevation } = element.geometry;

  const geometry = useMemo(() => {
    if (!points || points.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, points[i].z);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness || 0.5, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [points, thickness]);

  if (!geometry) return null;

  const color = getElementColor(element, viewMode, maxCost);
  const opacity = getElementOpacity(element, viewMode);

  return (
    <mesh
      geometry={geometry}
      position={[0, elevation, 0]}
      onClick={(e) => { e.stopPropagation(); onClick(element.id); }}
      onPointerOver={(e) => { e.stopPropagation(); onHover(element.id); }}
      onPointerOut={() => onHover(null)}
    >
      <ClippedMaterial color={color} opacity={opacity} transparent={opacity < 1} selected={selected} hovered={hovered} xray={xray} />
      {selected && <Edges threshold={15} color="#ffffff" lineWidth={1} />}
    </mesh>
  );
}

// ── Box element: placed object (footings, fixtures) ──────────────
function BoxElement({ element, selected, hovered, viewMode, maxCost, xray, onClick, onHover }) {
  const { position, width, depth, height, elevation } = element.geometry;

  const color = getElementColor(element, viewMode, maxCost);
  const opacity = getElementOpacity(element, viewMode);

  return (
    <mesh
      position={[position.x, elevation + height / 2, position.z]}
      onClick={(e) => { e.stopPropagation(); onClick(element.id); }}
      onPointerOver={(e) => { e.stopPropagation(); onHover(element.id); }}
      onPointerOut={() => onHover(null)}
    >
      <boxGeometry args={[width, height, depth]} />
      <ClippedMaterial color={color} opacity={opacity} transparent={opacity < 1} selected={selected} hovered={hovered} xray={xray} />
      {selected && <Edges threshold={15} color="#ffffff" lineWidth={1} />}
    </mesh>
  );
}

// ── IFC Mesh element ─────────────────────────────────────────────
function IFCMeshElement({ element, selected, hovered, viewMode, maxCost, xray, onClick, onHover }) {
  const { vertices, indices, matrix } = element.geometry;

  const geometry = useMemo(() => {
    if (!vertices || !indices) return null;
    const geo = new THREE.BufferGeometry();
    // web-ifc vertices: [x,y,z,nx,ny,nz] per vertex
    const stride = 6;
    const vertCount = vertices.length / stride;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
      positions[i * 3] = vertices[i * stride];
      positions[i * 3 + 1] = vertices[i * stride + 1];
      positions[i * 3 + 2] = vertices[i * stride + 2];
      normals[i * 3] = vertices[i * stride + 3];
      normals[i * 3 + 1] = vertices[i * stride + 4];
      normals[i * 3 + 2] = vertices[i * stride + 5];
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geo.computeBoundingSphere();
    return geo;
  }, [vertices, indices]);

  const matrixTransform = useMemo(() => {
    if (!matrix) return new THREE.Matrix4();
    const m = new THREE.Matrix4();
    m.fromArray(matrix);
    return m;
  }, [matrix]);

  if (!geometry) return null;

  const color = getElementColor(element, viewMode, maxCost);
  const opacity = getElementOpacity(element, viewMode);

  return (
    <mesh
      geometry={geometry}
      matrix={matrixTransform}
      matrixAutoUpdate={false}
      onClick={(e) => { e.stopPropagation(); onClick(element.id); }}
      onPointerOver={(e) => { e.stopPropagation(); onHover(element.id); }}
      onPointerOut={() => onHover(null)}
    >
      <ClippedMaterial color={color} opacity={opacity} transparent={opacity < 1} selected={selected} hovered={hovered} xray={xray} />
      {selected && <Edges threshold={15} color="#ffffff" lineWidth={1} />}
    </mesh>
  );
}

// ── Floor Shell: translucent building envelope ───────────────────
function FloorShell({ outline, elevation, height, viewMode }) {
  const clipPlanes = useContext(ClipContext);

  const geometry = useMemo(() => {
    if (!outline || outline.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(outline[0].x, outline[0].z);
    for (let i = 1; i < outline.length; i++) {
      shape.lineTo(outline[i].x, outline[i].z);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [outline, height]);

  const edgesGeo = useMemo(() => {
    if (!geometry) return null;
    return new THREE.EdgesGeometry(geometry, 15);
  }, [geometry]);

  if (!geometry) return null;

  const isCoverage = viewMode === 'coverage';

  return (
    <group position={[0, elevation, 0]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color="#8888ff"
          transparent
          opacity={isCoverage ? 0.06 : 0.04}
          roughness={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
          clippingPlanes={clipPlanes}
        />
      </mesh>
      {edgesGeo && (
        <lineSegments geometry={edgesGeo}>
          <lineBasicMaterial color="#6677cc" transparent opacity={isCoverage ? 0.35 : 0.2} />
        </lineSegments>
      )}
    </group>
  );
}

// ── Coverage Cell: colored grid tile on floor plane ──────────────
function CoverageCell({ cell, elevation }) {
  const color = cell.covered ? '#10B981' : '#EF4444';
  const opacity = cell.covered ? 0.2 : 0.35;

  return (
    <mesh position={[cell.cx, elevation + 0.05, cell.cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[cell.size * 0.92, cell.size * 0.92]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// ── Section plane indicator ──────────────────────────────────────
function SectionPlaneIndicator({ sectionY, span }) {
  if (sectionY === null || sectionY === undefined) return null;
  return (
    <group>
      <mesh position={[0, sectionY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[span * 2.5, span * 2.5]} />
        <meshBasicMaterial color="#8B5CF6" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, sectionY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[span * 1.2, span * 1.22, 64]} />
        <meshBasicMaterial color="#8B5CF6" transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── Color/opacity helpers ────────────────────────────────────────
function getElementColor(element, viewMode, maxCost) {
  if (viewMode === 'presentation') return '#e0e0e0';
  if (viewMode === 'cost') {
    const intensity = maxCost > 0 ? Math.min(element.cost / maxCost, 1) : 0;
    const r = Math.round(255 * Math.min(intensity * 2, 1));
    const g = Math.round(255 * Math.min((1 - intensity) * 2, 1));
    return `rgb(${r},${g},60)`;
  }
  if (viewMode === 'gaps') {
    return element.linkedItemId ? element.color : '#ef4444';
  }
  if (viewMode === 'coverage') return element.color;
  return element.color; // trade mode
}

function getElementOpacity(element, viewMode) {
  if (viewMode === 'gaps' && element.linkedItemId) return 0.25;
  if (viewMode === 'presentation') return 0.85;
  if (viewMode === 'coverage') return 0.15;
  return 0.8;
}

// ── Auto-fit camera to scene ─────────────────────────────────────
function CameraFit({ elements, outlines }) {
  const { camera } = useThree();

  useMemo(() => {
    if (elements.length === 0 && Object.keys(outlines).length === 0) return;

    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, maxY = 0;

    elements.forEach(el => {
      const g = el.geometry;
      if (g.kind === 'extrudedPath' && g.path) {
        g.path.forEach(p => {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });
        maxY = Math.max(maxY, (g.elevation || 0) + (g.height || 10));
      } else if (g.kind === 'polygon' && g.points) {
        g.points.forEach(p => {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });
      } else if (g.kind === 'box' && g.position) {
        minX = Math.min(minX, g.position.x); maxX = Math.max(maxX, g.position.x);
        minZ = Math.min(minZ, g.position.z); maxZ = Math.max(maxZ, g.position.z);
      } else if (g.kind === 'ifcMesh') {
        maxY = Math.max(maxY, 40);
      }
    });

    Object.values(outlines).forEach(({ polygon }) => {
      if (!polygon) return;
      polygon.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      });
    });

    if (!isFinite(minX)) return;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 20);
    const dist = span * 1.2;

    camera.position.set(cx + dist * 0.6, Math.max(maxY, 12) + dist * 0.4, cz + dist * 0.6);
    camera.lookAt(cx, Math.max(maxY, 12) / 3, cz);
    camera.updateProjectionMatrix();
  }, [elements, outlines, camera]);

  return null;
}

// ── Enable local clipping on the renderer ────────────────────────
function EnableClipping() {
  const { gl } = useThree();
  useMemo(() => { gl.localClippingEnabled = true; }, [gl]);
  return null;
}

// ── Main Scene ───────────────────────────────────────────────────
export default function SceneViewer() {
  const elements = useModelStore(s => s.elements);
  const selectedElementId = useModelStore(s => s.selectedElementId);
  const hoveredElementId = useModelStore(s => s.hoveredElementId);
  const viewMode = useModelStore(s => s.viewMode);
  const selectElement = useModelStore(s => s.selectElement);
  const setHoveredElement = useModelStore(s => s.setHoveredElement);
  const outlines = useModelStore(s => s.outlines);
  const floorAssignments = useModelStore(s => s.floorAssignments);
  const coverageCells = useModelStore(s => s.coverageCells);
  const floorHeight = useModelStore(s => s.floorHeight);
  const hiddenFloors = useModelStore(s => s.hiddenFloors);
  const sectionPlaneY = useModelStore(s => s.sectionPlaneY);
  const xrayMode = useModelStore(s => s.xrayMode);

  const maxCost = useMemo(() => {
    const costs = elements.map(e => e.cost).filter(c => c > 0);
    return costs.length > 0 ? Math.max(...costs) : 1;
  }, [elements]);

  const handleClick = useCallback((id) => {
    selectElement(id);
  }, [selectElement]);

  const handleHover = useCallback((id) => {
    setHoveredElement(id);
  }, [setHoveredElement]);

  // Filter elements by floor visibility
  const visibleElements = useMemo(() => {
    if (hiddenFloors.length === 0) return elements;
    return elements.filter(el => !hiddenFloors.includes(el.level));
  }, [elements, hiddenFloors]);

  // Compute scene span for section plane indicator
  const sceneSpan = useMemo(() => {
    let span = 40;
    elements.forEach(el => {
      const g = el.geometry;
      if (g.kind === 'extrudedPath' && g.path) {
        g.path.forEach(p => { span = Math.max(span, Math.abs(p.x), Math.abs(p.z)); });
      }
    });
    return span;
  }, [elements]);

  // Shell data from outlines + floor assignments
  const shells = useMemo(() => {
    const result = [];
    for (const [drawingId, { polygon }] of Object.entries(outlines)) {
      const fa = floorAssignments[drawingId];
      const elevation = fa?.elevation ?? 0;
      const height = fa?.height ?? floorHeight;
      result.push({ drawingId, polygon, elevation, height });
    }
    return result;
  }, [outlines, floorAssignments, floorHeight]);

  const defaultCoverageElevation = useMemo(() => {
    if (shells.length === 0) return 0;
    return Math.min(...shells.map(s => s.elevation));
  }, [shells]);

  const hasShells = shells.length > 0;
  const showShells = hasShells && viewMode !== 'presentation';
  const showCoverage = viewMode === 'coverage' && coverageCells.length > 0;
  const bgColor = viewMode === 'presentation' ? '#f8f9fa' : '#0d1117';

  return (
    <Canvas
      camera={{ position: [60, 40, 60], fov: 50, near: 0.1, far: 5000 }}
      style={{ width: '100%', height: '100%', borderRadius: 8, cursor: hoveredElementId ? 'pointer' : 'grab' }}
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => { selectElement(null); setHoveredElement(null); }}
    >
      <EnableClipping />
      <color attach="background" args={[bgColor]} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[100, 100, 50]} intensity={0.8} castShadow />
      <directionalLight position={[-50, 80, -50]} intensity={0.3} />

      <Grid
        infiniteGrid
        fadeDistance={300}
        fadeStrength={2}
        cellSize={1}
        sectionSize={10}
        cellColor={viewMode === 'presentation' ? '#ddd' : '#1a2030'}
        sectionColor={viewMode === 'presentation' ? '#bbb' : '#2a3a50'}
        cellThickness={0.5}
        sectionThickness={1}
      />

      <CameraFit elements={elements} outlines={outlines} />

      <ClipProvider sectionY={sectionPlaneY}>
        {/* Building elements */}
        {visibleElements.map(el => {
          const isSelected = el.id === selectedElementId;
          const isHovered = el.id === hoveredElementId;
          const Comp = el.geometry.kind === 'extrudedPath' ? WallElement
            : el.geometry.kind === 'polygon' ? SlabElement
            : el.geometry.kind === 'box' ? BoxElement
            : el.geometry.kind === 'ifcMesh' ? IFCMeshElement
            : null;
          if (!Comp) return null;
          return createElement(Comp, {
            key: el.id,
            element: el,
            selected: isSelected,
            hovered: isHovered,
            viewMode,
            maxCost,
            xray: xrayMode,
            onClick: handleClick,
            onHover: handleHover,
          });
        })}

        {/* Floor shells */}
        {showShells && shells.map(s => (
          <FloorShell
            key={s.drawingId}
            outline={s.polygon}
            elevation={s.elevation}
            height={s.height}
            viewMode={viewMode}
          />
        ))}
      </ClipProvider>

      {/* Section plane indicator */}
      <SectionPlaneIndicator sectionY={sectionPlaneY} span={sceneSpan} />

      {/* Coverage grid cells */}
      {showCoverage && coverageCells.map(cell => (
        <CoverageCell
          key={cell.id}
          cell={cell}
          elevation={cell.elevation ?? defaultCoverageElevation}
        />
      ))}

      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
    </Canvas>
  );
}
