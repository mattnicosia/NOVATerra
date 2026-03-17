// Chamber v4 — The Vault: cinematic architectural space containing the Artifact
//
// Visual Board v4 overhaul (rating target: 65+/100):
//   Fix 1: SCALE — walls 2× taller (16), radius 10, camera further back
//   Fix 2: RIB MASS — thick stone buttresses (0.5 wide × 1.0 deep), not paper fins
//   Fix 3: MATERIALS — stone is dielectric (metalness=0, roughness 0.75–0.9)
//   Fix 4: OCULUS GOD RAYS — volumetric cone from ceiling + spotLight
//   Fix 5: GLOW REDUCTION — near-monochromatic, only 1-2 subtle horizontal rings
//   GC FIX: persistent useRef(Color) for per-frame lerps (no .clone() allocations)
//
// Architecture:
//   - Obsidian floor (custom shader: caustics + light pool + Fresnel + circuit etch)
//   - Volumetric shaft (custom shader: noise-driven atmospheric density)
//   - Oculus god rays (volumetric cone from ceiling opening)
//   - Ribbed cylindrical walls with thick stone buttresses
//   - Concentric ring platform with center void
//   - Approach steps from +Z
//   - Ceiling oculus with radial ribs
//   - Vault dome (subtle architectural ceiling)
//   - Ground fog, particles, orbit controls

import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Sparkles, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { chamberVertexShader } from "./shaders/chamber.vert";
import { chamberFragmentShader } from "./shaders/chamber.frag";
import { volumetricVertexShader } from "./shaders/volumetric.vert";
import { volumetricFragmentShader } from "./shaders/volumetric.frag";
import { fogVertexShader } from "./shaders/fog.vert";
import { fogFragmentShader } from "./shaders/fog.frag";
import { domeVertexShader } from "./shaders/dome.vert";
import { domeFragmentShader } from "./shaders/dome.frag";

// ── Architecture Constants ──────────────────────────────────────────
// v4: Massive scale — camera at z=12 must be INSIDE the walls (BackSide rendering)
const WALL_RADIUS = 14;
const WALL_HEIGHT = 16;
const RIB_COUNT = 16;
const HORIZONTAL_RINGS = 5;
const PILLAR_RING_RADIUS = 14;

// Ring platform dimensions — scaled to fill the wider floor
const PLATFORM_RINGS = [
  { outer: 7.5, inner: 6.2, rise: 0.45 },
  { outer: 6.0, inner: 4.5, rise: 0.9 },
  { outer: 4.3, inner: 3.0, rise: 1.35 },
  { outer: 2.8, inner: 1.8, rise: 1.8 },
];

// Oculus ceiling rings — must match wall radius at outer edge
const OCULUS_RINGS = [
  { outer: 14.0, inner: 11.0, thickness: 0.22 },
  { outer: 10.8, inner: 7.5, thickness: 0.18 },
  { outer: 7.3, inner: 3.5, thickness: 0.14 },
];

// ── Stone material palette (v4: dielectric, no metalness) ───────────
const STONE_COLOR = "#0A0A10";
const WALL_MATERIAL_PROPS = { color: STONE_COLOR, roughness: 0.88, metalness: 0.0, side: THREE.BackSide };
const PLATFORM_MATERIAL_PROPS = { color: STONE_COLOR, roughness: 0.75, metalness: 0.0, side: THREE.DoubleSide };
const STEP_MATERIAL_PROPS = { color: STONE_COLOR, roughness: 0.9, metalness: 0.0 };
const OCULUS_MATERIAL_PROPS = { color: STONE_COLOR, roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide };

// ── Camera Setup — establishing shot for massive chamber ────────────
function CameraSetup() {
  const { camera } = useThree();
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      // v4: Higher + further back to frame the towering walls + platform
      camera.position.set(0, 4.5, 12);
      camera.lookAt(0, -0.8, 0);
      initialized.current = true;
    }
  }, [camera]);

  return null;
}

// ── Chamber Floor — obsidian surface with caustic light shader ───────
function ChamberFloor({ size, awaken, morph, innerLight }) {
  const matRef = useRef();
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uAwaken: { value: awaken },
      uMorph: { value: morph },
      uInnerLight: { value: innerLight },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial uniform snapshot; updates via refs in useFrame
    [],
  );

  useFrame((state, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
    u.uMorph.value += (morphRef.current - u.uMorph.value) * t;
    u.uInnerLight.value += (innerLightRef.current - u.uInnerLight.value) * t;
  });

  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} renderOrder={-1}>
      <circleGeometry args={[18, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={chamberVertexShader}
        fragmentShader={chamberFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── Volumetric Light Shaft — visible column of artifact light ────────
function VolumetricShaft({ size, awaken, morph, innerLight }) {
  const matRef = useRef();
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uAwaken: { value: awaken },
      uMorph: { value: morph },
      uInnerLight: { value: innerLight },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial uniform snapshot; updates via refs in useFrame
    [],
  );

  useFrame((state, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
    u.uMorph.value += (morphRef.current - u.uMorph.value) * t;
    u.uInnerLight.value += (innerLightRef.current - u.uInnerLight.value) * t;
  });

  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);
  const shaftTop = shellRadius;
  const shaftHeight = shaftTop - floorY;
  const centerY = (shaftTop + floorY) / 2;

  return (
    <mesh position={[0, centerY, 0]}>
      <cylinderGeometry
        args={[
          shellRadius * 0.6, // top radius — narrow near artifact
          shellRadius * 2.2, // bottom radius — light spreads at floor
          shaftHeight,
          32, // radial segments
          8, // height segments
          true, // open ended
        ]}
      />
      <shaderMaterial
        ref={matRef}
        vertexShader={volumetricVertexShader}
        fragmentShader={volumetricFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── Oculus God Rays — volumetric light pouring through ceiling ───────
// v4: The hero lighting element. Light enters through the oculus opening
// and streams down through atmosphere to illuminate the artifact.
function OculusGodRays({ size, awaken, morph, innerLight }) {
  const matRef = useRef();
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uAwaken: { value: awaken },
      uMorph: { value: morph },
      uInnerLight: { value: innerLight },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial uniform snapshot; updates via refs in useFrame
    [],
  );

  useFrame((state, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
    u.uMorph.value += (morphRef.current - u.uMorph.value) * t;
    u.uInnerLight.value += (innerLightRef.current - u.uInnerLight.value) * t;
  });

  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);
  const ceilingY = floorY + WALL_HEIGHT;

  // Cone from just below ceiling to near sphere
  // Wide at top (oculus opening), narrow at bottom (near artifact)
  const godRayTop = ceilingY - 0.5;
  const godRayBottom = shellRadius + 0.5; // just above sphere
  const godRayHeight = godRayTop - godRayBottom;
  const godRayCenterY = (godRayTop + godRayBottom) / 2;

  return (
    <mesh position={[0, godRayCenterY, 0]}>
      <cylinderGeometry
        args={[
          OCULUS_RINGS[2].inner * 0.9, // top radius — matches innermost oculus opening
          shellRadius * 1.2, // bottom radius — wider spread near sphere
          godRayHeight,
          32, // radial segments
          8, // height segments
          true, // open ended
        ]}
      />
      <shaderMaterial
        ref={matRef}
        vertexShader={volumetricVertexShader}
        fragmentShader={volumetricFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── Ground Fog — atmospheric haze at floor level ────────────────────
function GroundFog({ size, awaken, morph, innerLight }) {
  const matRef = useRef();
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uAwaken: { value: awaken },
      uMorph: { value: morph },
      uInnerLight: { value: innerLight },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial uniform snapshot; updates via refs in useFrame
    [],
  );

  useFrame((state, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
    u.uMorph.value += (morphRef.current - u.uMorph.value) * t;
    u.uInnerLight.value += (innerLightRef.current - u.uInnerLight.value) * t;
  });

  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.08, 0]}>
      <circleGeometry args={[16, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={fogVertexShader}
        fragmentShader={fogFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── Chamber Walls — thick ribbed cylindrical enclosure ──────────────
// v4: Ribs are massive stone buttresses (0.5 wide × 1.0 deep), not paper fins
function ChamberWalls({ size, awaken, morph, innerLight }) {
  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);
  const wallBottom = floorY;
  const wallCenterY = floorY + WALL_HEIGHT / 2;

  // Merged structural geometry
  const wallGeo = useMemo(() => {
    const geos = [];

    // Base cylinder (viewed from inside = BackSide on material)
    const cyl = new THREE.CylinderGeometry(WALL_RADIUS, WALL_RADIUS, WALL_HEIGHT, 64, 1, true);
    cyl.translate(0, wallCenterY, 0);
    geos.push(cyl);

    // v4: Thick vertical buttresses — massive stone members protruding inward
    for (let i = 0; i < RIB_COUNT; i++) {
      const angle = (i / RIB_COUNT) * Math.PI * 2;

      // Main buttress body — thick and deep
      const rib = new THREE.BoxGeometry(0.5, WALL_HEIGHT, 1.0);
      const mat = new THREE.Matrix4();
      mat.makeRotationY(angle);
      mat.setPosition(Math.cos(angle) * (WALL_RADIUS - 0.5), wallCenterY, Math.sin(angle) * (WALL_RADIUS - 0.5));
      rib.applyMatrix4(mat);
      geos.push(rib);

      // Tapered cap at top of each buttress
      const cap = new THREE.BoxGeometry(0.6, 0.4, 1.2);
      const capMat = new THREE.Matrix4();
      capMat.makeRotationY(angle);
      capMat.setPosition(
        Math.cos(angle) * (WALL_RADIUS - 0.55),
        wallBottom + WALL_HEIGHT - 0.2,
        Math.sin(angle) * (WALL_RADIUS - 0.55),
      );
      cap.applyMatrix4(capMat);
      geos.push(cap);

      // Base widening at bottom of each buttress
      const base = new THREE.BoxGeometry(0.65, 0.5, 1.3);
      const baseMat = new THREE.Matrix4();
      baseMat.makeRotationY(angle);
      baseMat.setPosition(
        Math.cos(angle) * (WALL_RADIUS - 0.55),
        wallBottom + 0.25,
        Math.sin(angle) * (WALL_RADIUS - 0.55),
      );
      base.applyMatrix4(baseMat);
      geos.push(base);
    }

    // Horizontal ring ledges on wall interior
    for (let i = 1; i <= HORIZONTAL_RINGS; i++) {
      const ledgeY = wallBottom + (i / (HORIZONTAL_RINGS + 1)) * WALL_HEIGHT;
      const ledge = new THREE.RingGeometry(WALL_RADIUS - 0.2, WALL_RADIUS, 64);
      ledge.rotateX(-Math.PI / 2);
      ledge.translate(0, ledgeY, 0);
      geos.push(ledge);
    }

    return mergeGeometries(geos);
  }, [wallCenterY, wallBottom]);

  const wallMat = useMemo(() => new THREE.MeshStandardMaterial(WALL_MATERIAL_PROPS), []);

  // v4: DRASTICALLY reduced glow — only 2 subtle horizontal rings, no vertical strips
  const novaGlow = useMemo(() => new THREE.Color("#6B4CE6"), []);
  const coreGlow = useMemo(() => new THREE.Color("#E8920A"), []);
  const tempColor = useRef(new THREE.Color()); // GC fix: persistent color

  const glowGeo = useMemo(() => {
    const geos = [];
    // Only 2 horizontal glow torus rings (at 1/3 and 2/3 height)
    for (let i = 2; i <= 3; i++) {
      const ledgeY = wallBottom + (i / (HORIZONTAL_RINGS + 1)) * WALL_HEIGHT;
      const torus = new THREE.TorusGeometry(WALL_RADIUS - 0.1, 0.012, 4, 64);
      torus.rotateX(Math.PI / 2);
      torus.translate(0, ledgeY, 0);
      geos.push(torus);
    }
    return mergeGeometries(geos);
  }, [wallBottom]);

  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: novaGlow.clone(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- novaGlow is a stable useMemo Color
    [],
  );

  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);
  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  useFrame((_, delta) => {
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    // GC fix: use persistent tempColor instead of clone()
    tempColor.current.copy(novaGlow).lerp(coreGlow, morphRef.current);
    glowMat.color.lerp(tempColor.current, t);
    // v4: very subtle opacity (was 0.25)
    const targetOpacity = awakenRef.current * innerLightRef.current * 0.05;
    glowMat.opacity += (targetOpacity - glowMat.opacity) * t;
  });

  return (
    <group>
      <mesh geometry={wallGeo} material={wallMat} />
      <mesh geometry={glowGeo} material={glowMat} />
    </group>
  );
}

// ── Ring Platform — concentric stepped rings with center void ───────
function RingPlatform({ size, awaken, morph, innerLight }) {
  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);

  const platformGeo = useMemo(() => {
    const geos = [];

    for (let i = 0; i < PLATFORM_RINGS.length; i++) {
      const ring = PLATFORM_RINGS[i];
      const topY = floorY + ring.rise;
      const prevRise = i === 0 ? 0 : PLATFORM_RINGS[i - 1].rise;
      const botY = floorY + prevRise;
      const stepH = topY - botY;

      // Top annular face
      const top = new THREE.RingGeometry(ring.inner, ring.outer, 64);
      top.rotateX(-Math.PI / 2);
      top.translate(0, topY, 0);
      geos.push(top);

      // Outer vertical step face (riser)
      const outerWall = new THREE.CylinderGeometry(ring.outer, ring.outer, stepH, 64, 1, true);
      outerWall.translate(0, (topY + botY) / 2, 0);
      geos.push(outerWall);

      // Inner vertical wall (facing the void)
      const innerWall = new THREE.CylinderGeometry(ring.inner, ring.inner, ring.rise, 64, 1, true);
      innerWall.translate(0, floorY + ring.rise / 2, 0);
      geos.push(innerWall);
    }

    return mergeGeometries(geos);
  }, [floorY]);

  const platformMat = useMemo(() => new THREE.MeshStandardMaterial(PLATFORM_MATERIAL_PROPS), []);

  // v4: Only 1 subtle glow ring at innermost platform edge
  const novaGlow = useMemo(() => new THREE.Color("#6B4CE6"), []);
  const coreGlow = useMemo(() => new THREE.Color("#E8920A"), []);
  const tempColor = useRef(new THREE.Color()); // GC fix

  const glowGeo = useMemo(() => {
    const geos = [];
    // Only innermost ring's inner lip
    const innerRing = PLATFORM_RINGS[PLATFORM_RINGS.length - 1];
    const torus = new THREE.TorusGeometry(innerRing.inner, 0.015, 4, 64);
    torus.rotateX(Math.PI / 2);
    torus.translate(0, floorY + innerRing.rise + 0.01, 0);
    geos.push(torus);
    return mergeGeometries(geos);
  }, [floorY]);

  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: novaGlow.clone(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- novaGlow is a stable useMemo Color
    [],
  );

  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);
  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  useFrame((_, delta) => {
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    tempColor.current.copy(novaGlow).lerp(coreGlow, morphRef.current);
    glowMat.color.lerp(tempColor.current, t);
    const targetOpacity = awakenRef.current * innerLightRef.current * 0.04;
    glowMat.opacity += (targetOpacity - glowMat.opacity) * t;
  });

  return (
    <group>
      <mesh geometry={platformGeo} material={platformMat} renderOrder={0} />
      <mesh geometry={glowGeo} material={glowMat} />
    </group>
  );
}

// ── Platform Steps — approach stairs from +Z (toward camera) ────────
function PlatformSteps({ size }) {
  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);

  const stepsGeo = useMemo(() => {
    const geos = [];
    const STEP_COUNT = 6;
    const STEP_WIDTH = 3.5; // v4: wider to match bigger chamber
    const STEP_DEPTH = 0.6;
    const TOTAL_RISE = PLATFORM_RINGS[0].rise;

    for (let i = 0; i < STEP_COUNT; i++) {
      const stepRise = (i + 1) * (TOTAL_RISE / STEP_COUNT);
      const stepY = floorY + stepRise / 2;
      const stepZ = PLATFORM_RINGS[0].outer + (STEP_COUNT - i - 0.5) * STEP_DEPTH;
      const box = new THREE.BoxGeometry(STEP_WIDTH, stepRise, STEP_DEPTH);
      box.translate(0, stepY, stepZ);
      geos.push(box);
    }

    return mergeGeometries(geos);
  }, [floorY]);

  const stepMat = useMemo(() => new THREE.MeshStandardMaterial(STEP_MATERIAL_PROPS), []);

  return <mesh geometry={stepsGeo} material={stepMat} />;
}

// ── Oculus — ceiling ring structure with thick radial ribs ───────────
function Oculus({ size, awaken, morph, innerLight }) {
  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);
  const ceilingY = floorY + WALL_HEIGHT;

  const oculusGeo = useMemo(() => {
    const geos = [];

    // Concentric ceiling ring faces (facing downward)
    for (const ring of OCULUS_RINGS) {
      const face = new THREE.RingGeometry(ring.inner, ring.outer, 64);
      face.rotateX(Math.PI / 2); // face downward
      face.translate(0, ceilingY, 0);
      geos.push(face);

      // Inner vertical lip
      const lip = new THREE.CylinderGeometry(ring.inner, ring.inner, ring.thickness, 64, 1, true);
      lip.translate(0, ceilingY - ring.thickness / 2, 0);
      geos.push(lip);
    }

    // v4: Thick radial ribs connecting rings (16 ribs matching wall rib count)
    for (let i = 0; i < RIB_COUNT; i++) {
      const angle = (i / RIB_COUNT) * Math.PI * 2;
      const ribLength = OCULUS_RINGS[0].outer - OCULUS_RINGS[2].inner;
      const ribCenterR = (OCULUS_RINGS[0].outer + OCULUS_RINGS[2].inner) / 2;
      // v4: Much thicker ribs (was 0.04 × 0.12)
      const rib = new THREE.BoxGeometry(0.3, 0.18, ribLength);
      const mat4 = new THREE.Matrix4();
      mat4.makeRotationY(angle);
      mat4.setPosition(Math.cos(angle) * ribCenterR, ceilingY - 0.09, Math.sin(angle) * ribCenterR);
      rib.applyMatrix4(mat4);
      geos.push(rib);
    }

    return mergeGeometries(geos);
  }, [ceilingY]);

  const oculusMat = useMemo(() => new THREE.MeshStandardMaterial(OCULUS_MATERIAL_PROPS), []);

  // v4: Only 1 subtle glow ring at innermost oculus edge
  const novaGlow = useMemo(() => new THREE.Color("#6B4CE6"), []);
  const coreGlow = useMemo(() => new THREE.Color("#E8920A"), []);
  const tempColor = useRef(new THREE.Color()); // GC fix

  const glowGeo = useMemo(() => {
    const geos = [];
    // Only innermost ring
    const ring = OCULUS_RINGS[OCULUS_RINGS.length - 1];
    const torus = new THREE.TorusGeometry(ring.inner, 0.018, 4, 64);
    torus.rotateX(Math.PI / 2);
    torus.translate(0, ceilingY - 0.01, 0);
    geos.push(torus);
    return mergeGeometries(geos);
  }, [ceilingY]);

  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: novaGlow.clone(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- novaGlow is a stable useMemo Color
    [],
  );

  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);
  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  useFrame((_, delta) => {
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    tempColor.current.copy(novaGlow).lerp(coreGlow, morphRef.current);
    glowMat.color.lerp(tempColor.current, t);
    const targetOpacity = awakenRef.current * innerLightRef.current * 0.04;
    glowMat.opacity += (targetOpacity - glowMat.opacity) * t;
  });

  return (
    <group>
      <mesh geometry={oculusGeo} material={oculusMat} />
      <mesh geometry={glowGeo} material={glowMat} />
    </group>
  );
}

// ── Vault Dome — subtle architectural ceiling for enclosure ──────────
function VaultDome({ size: _size, awaken, morph, innerLight }) {
  const matRef = useRef();
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  const uniforms = useMemo(
    () => ({
      uAwaken: { value: awaken },
      uMorph: { value: morph },
      uInnerLight: { value: innerLight },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial uniform snapshot; updates via refs in useFrame
    [],
  );

  useFrame((_, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
    u.uMorph.value += (morphRef.current - u.uMorph.value) * t;
    u.uInnerLight.value += (innerLightRef.current - u.uInnerLight.value) * t;
  });

  return (
    <mesh position={[0, 0, 0]}>
      <sphereGeometry args={[PILLAR_RING_RADIUS + 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={domeVertexShader}
        fragmentShader={domeFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── Artifact Point Light — dynamic illumination from sphere energy ───
// v4: Increased distance (30) and intensity (12×) to fill bigger chamber
function ArtifactLight({ awaken, morph, innerLight }) {
  const lightRef = useRef();
  const novaColor = useMemo(() => new THREE.Color("#6B4CE6"), []);
  const coreColor = useMemo(() => new THREE.Color("#E8920A"), []);
  const targetColor = useMemo(() => new THREE.Color(), []);
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  useFrame((_, delta) => {
    if (!lightRef.current) return;
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);

    // Smooth color morph
    targetColor.copy(novaColor).lerp(coreColor, morphRef.current);
    lightRef.current.color.lerp(targetColor, t);

    // v4: Stronger intensity to fill the massive chamber
    const targetIntensity = awakenRef.current * innerLightRef.current * 12.0;
    lightRef.current.intensity += (targetIntensity - lightRef.current.intensity) * t;
  });

  return <pointLight ref={lightRef} position={[0, 0, 0]} intensity={0} distance={38} decay={1.3} />;
}

// ── Oculus Spot Light — directional light from ceiling opening ───────
// v4: Adds real shadow-casting light from the oculus down to the sphere
function OculusSpotLight({ size, awaken, innerLight }) {
  const lightRef = useRef();
  const awakenRef = useRef(awaken);
  const innerLightRef = useRef(innerLight);
  awakenRef.current = awaken;
  innerLightRef.current = innerLight;

  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);
  const ceilingY = floorY + WALL_HEIGHT;

  useFrame((_, delta) => {
    if (!lightRef.current) return;
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    const targetIntensity = awakenRef.current * innerLightRef.current * 4.0;
    lightRef.current.intensity += (targetIntensity - lightRef.current.intensity) * t;
  });

  return (
    <spotLight
      ref={lightRef}
      position={[0, ceilingY - 0.5, 0]}
      target-position={[0, 0, 0]}
      intensity={0}
      distance={WALL_HEIGHT + 2}
      angle={Math.PI / 5}
      penumbra={0.8}
      decay={1.2}
      color="#B8C4E8"
    />
  );
}

// ── Main Chamber Component ───────────────────────────────────────────
export default function Chamber({ size = 1.6, awaken = 0.0, morph = 0.0, innerLight = 0.7 }) {
  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);

  return (
    <group>
      {/* Dark vault background */}
      <color attach="background" args={["#020204"]} />

      {/* v4: Neutral ambient (was blue-tinted #0a0a18) */}
      <ambientLight intensity={0.008} color="#0C0C0C" />

      {/* Dynamic artifact illumination — lights walls and environment */}
      <ArtifactLight awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* v4: Directional light from oculus opening */}
      <OculusSpotLight size={size} awaken={awaken} innerLight={innerLight} />

      {/* Obsidian floor with caustic light patterns */}
      <ChamberFloor size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* Volumetric light shaft — visible column of artifact light through dust */}
      <VolumetricShaft size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* v4: God rays from ceiling oculus — the hero volumetric element */}
      <OculusGodRays size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* Ground fog — atmospheric haze at floor level */}
      <GroundFog size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* Thick-ribbed cylindrical walls */}
      <ChamberWalls size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* Concentric ring platform with center void */}
      <RingPlatform size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* Approach steps from +Z direction (toward camera) */}
      <PlatformSteps size={size} />

      {/* Ceiling oculus with thick radial ribs — light enters here */}
      <Oculus size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* Vault ceiling dome — subtle architectural enclosure */}
      <VaultDome size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* ── Particle Layer 1: Ambient dust — sparse, slow, fills the vault ── */}
      <Sparkles
        count={50}
        size={1.2}
        scale={[18, 12, 18]}
        position={[0, 3, 0]}
        speed={0.08}
        opacity={0.1 + awaken * 0.12}
        color={morph > 0.5 ? "#C4782A" : "#3355AA"}
      />

      {/* ── Particle Layer 2: Energy motes — concentrated near artifact ── */}
      <Sparkles
        count={30}
        size={1.8}
        scale={[3, 3.5, 3]}
        position={[0, 0.3, 0]}
        speed={0.2}
        opacity={awaken * 0.4}
        color={morph > 0.5 ? "#FFB84D" : "#6688FF"}
      />

      {/* ── Particle Layer 3: Floor-level dust — ground atmosphere ── */}
      <Sparkles
        count={30}
        size={0.8}
        scale={[16, 1.5, 16]}
        position={[0, floorY + 0.5, 0]}
        speed={0.05}
        opacity={0.06 + awaken * 0.08}
        color={morph > 0.5 ? "#E8920A" : "#4466FF"}
      />

      {/* Camera setup + interactive orbit controls */}
      <CameraSetup />
      <OrbitControls
        makeDefault
        target={[0, -0.6, 0]}
        minDistance={4}
        maxDistance={13}
        maxPolarAngle={Math.PI / 2.05}
        minPolarAngle={0.15}
        enableDamping
        dampingFactor={0.04}
        autoRotate
        autoRotateSpeed={0.25}
        rotateSpeed={0.5}
      />
    </group>
  );
}
