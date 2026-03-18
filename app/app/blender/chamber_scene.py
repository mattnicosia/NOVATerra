"""
NOVACORE Chamber v2 — Cinematic Architectural Vault
Visual Board rebuild: matching film-quality reference.

Key decisions (board unanimous):
  - NO emissive/glowing elements. Zero purple lines.
  - THICK structural vault ribs (gothic cathedral mass)
  - DORMANT obsidian sphere in scene (the hero)
  - HEAVY volumetric atmosphere (density 0.025+)
  - SINGLE dominant overhead key light
  - Monochromatic palette — dark stone, warm overhead
  - Architecture has MASS. Every element casts shadows.

Usage:
  blender --background --python chamber_scene.py -- --frame 1 --samples 64
  blender --background --python chamber_scene.py -- --animation --samples 512
  blender --background --python chamber_scene.py -- --preview   (1080p, 64 samples)
"""

import bpy
import bmesh
import math
import sys
import os
from mathutils import Vector

# ─── CLI args ─────────────────────────────────────────────────
argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = []

FRAME = None
ANIMATION = False
SAMPLES = 256
RESOLUTION_X = 3840
RESOLUTION_Y = 2160
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "renders", "v2")

i = 0
while i < len(argv):
    if argv[i] == "--frame" and i + 1 < len(argv):
        FRAME = int(argv[i + 1]); i += 2
    elif argv[i] == "--animation":
        ANIMATION = True; i += 1
    elif argv[i] == "--samples" and i + 1 < len(argv):
        SAMPLES = int(argv[i + 1]); i += 2
    elif argv[i] == "--resolution" and i + 1 < len(argv):
        res = argv[i + 1].split("x")
        RESOLUTION_X, RESOLUTION_Y = int(res[0]), int(res[1]); i += 2
    elif argv[i] == "--preview":
        SAMPLES = 64; RESOLUTION_X = 1920; RESOLUTION_Y = 1080; i += 1
    elif argv[i] == "--outdir" and i + 1 < len(argv):
        OUTPUT_DIR = argv[i + 1]; i += 2
    else:
        i += 1

os.makedirs(OUTPUT_DIR, exist_ok=True)
print(f"[NOVACORE v2] Samples: {SAMPLES}, Resolution: {RESOLUTION_X}x{RESOLUTION_Y}")
print(f"[NOVACORE v2] Output: {OUTPUT_DIR}")

# ─── Clean scene ──────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ═══════════════════════════════════════════════════════════════
#  MATERIALS — No emission. No glow. Physical accuracy only.
#  Paul Franklin: "Every surface tells a story through how it
#  catches light, not by generating its own."
# ═══════════════════════════════════════════════════════════════

def mat_obsidian(name, color=(0.010, 0.010, 0.015, 1.0),
                 roughness=0.25, metallic=0.05):
    """Dark volcanic glass — strong Fresnel at grazing angles.
    Patricio: 'Obsidian has a glass-like Fresnel response.'"""
    mat = bpy.data.materials.new(name)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    # Strong specular for obsidian glass-like reflections
    bsdf.inputs["IOR"].default_value = 1.50
    # Subtle coat for extra Fresnel catch
    bsdf.inputs["Coat Weight"].default_value = 0.15
    bsdf.inputs["Coat Roughness"].default_value = 0.10

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    out.location = (300, 0)
    return mat


def mat_dark_stone(name, color=(0.014, 0.014, 0.018, 1.0),
                   roughness=0.55, metallic=0.02):
    """Weathered dark stone — absorptive, micro-rough.
    Used for dome interior, thick ribs — architectural mass."""
    mat = bpy.data.materials.new(name)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic

    # Procedural noise for surface variation (weathering)
    tex_coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 25.0
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.7

    # Mix roughness: base ± noise for micro-variation
    map_range = nodes.new("ShaderNodeMapRange")
    map_range.inputs["From Min"].default_value = 0.0
    map_range.inputs["From Max"].default_value = 1.0
    map_range.inputs["To Min"].default_value = roughness - 0.1
    map_range.inputs["To Max"].default_value = roughness + 0.15

    # Bump from noise
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    bump.inputs["Distance"].default_value = 0.003

    links.new(tex_coord.outputs["Object"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], map_range.inputs["Value"])
    links.new(map_range.outputs["Result"], bsdf.inputs["Roughness"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    out.location = (600, 0)
    bsdf.location = (300, 0)
    tex_coord.location = (-300, 0)
    noise.location = (-100, 0)
    return mat


def mat_floor():
    """Obsidian floor with etched circuit/glyph pattern.
    Visible in overhead light, adds detail at ground level."""
    mat = bpy.data.materials.new("Floor")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.006, 0.006, 0.010, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.08
    bsdf.inputs["IOR"].default_value = 1.50
    bsdf.inputs["Coat Weight"].default_value = 0.10
    bsdf.inputs["Coat Roughness"].default_value = 0.15

    tex_coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (6.0, 6.0, 6.0)

    # Voronoi: circuit-board etch pattern
    vor1 = nodes.new("ShaderNodeTexVoronoi")
    vor1.voronoi_dimensions = '3D'
    vor1.feature = 'F1'
    vor1.inputs["Scale"].default_value = 14.0

    vor2 = nodes.new("ShaderNodeTexVoronoi")
    vor2.voronoi_dimensions = '3D'
    vor2.feature = 'F2'
    vor2.inputs["Scale"].default_value = 7.0

    subtract = nodes.new("ShaderNodeMath")
    subtract.operation = 'SUBTRACT'

    # Sharpen to lines
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.01
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp.color_ramp.elements[1].position = 0.05
    ramp.color_ramp.elements[1].color = (0.025, 0.025, 0.03, 1.0)

    # Bump
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.002

    # Roughness from pattern (etch is rougher)
    rough_map = nodes.new("ShaderNodeMapRange")
    rough_map.inputs["From Min"].default_value = 0.0
    rough_map.inputs["From Max"].default_value = 0.1
    rough_map.inputs["To Min"].default_value = 0.18
    rough_map.inputs["To Max"].default_value = 0.40

    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], vor1.inputs["Vector"])
    links.new(mapping.outputs["Vector"], vor2.inputs["Vector"])
    links.new(vor1.outputs["Distance"], subtract.inputs[0])
    links.new(vor2.outputs["Distance"], subtract.inputs[1])
    links.new(subtract.outputs["Value"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(subtract.outputs["Value"], rough_map.inputs["Value"])
    links.new(rough_map.outputs["Result"], bsdf.inputs["Roughness"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    return mat


def mat_sphere():
    """Dormant obsidian monolith — the HERO of the composition.
    Paul Franklin: 'The sphere is a discovered artifact. Dark stone,
    matte, ancient. It doesn't glow — it absorbs.'
    Subtle dark subsurface for depth."""
    mat = bpy.data.materials.new("Sphere_Obsidian")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.014, 0.014, 0.018, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.75  # Raw slate — absorbs, doesn't reflect
    bsdf.inputs["Metallic"].default_value = 0.0    # ZERO metallic — pure dielectric stone
    bsdf.inputs["IOR"].default_value = 1.50
    bsdf.inputs["Coat Weight"].default_value = 0.0  # No coat — no gloss at all
    # Subtle dark subsurface for depth (light barely penetrates obsidian)
    bsdf.inputs["Subsurface Weight"].default_value = 0.008
    bsdf.inputs["Subsurface Radius"].default_value = (0.03, 0.015, 0.04)
    bsdf.inputs["Subsurface Scale"].default_value = 0.3

    # Stronger surface imperfection — weathered ancient stone, not polished
    tex_coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 30.0
    noise.inputs["Detail"].default_value = 12.0
    noise.inputs["Roughness"].default_value = 0.7

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08  # More visible stone grain
    bump.inputs["Distance"].default_value = 0.002

    links.new(tex_coord.outputs["Object"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    return mat


# ═══════════════════════════════════════════════════════════════
#  GEOMETRY — Architecture with MASS.
#  Jony: "Every element earns its place through physical presence."
# ═══════════════════════════════════════════════════════════════

FLOOR_Z = -2.5   # Base level
SPHERE_Z = 1.8   # Sphere center (floating above platform)
DOME_RADIUS = 20.0
DOME_BASE_Z = FLOOR_Z


def create_floor():
    """Massive circular floor — polished obsidian with etch pattern."""
    bpy.ops.mesh.primitive_cylinder_add(
        radius=28, depth=0.5, vertices=128,
        location=(0, 0, FLOOR_Z - 0.25)
    )
    floor = bpy.context.active_object
    floor.name = "Floor"
    floor.data.materials.append(mat_floor())
    bpy.ops.object.shade_smooth()
    return floor


def create_ring_platform():
    """Concentric raised rings — the altar. Heavy stone, no glow.
    Reference: 3 concentric rings with steps leading up."""
    rings = []
    ring_specs = [
        # (inner_r, outer_r, height, name)
        (1.8, 3.5, 0.45, "Inner"),
        (4.0, 5.8, 0.35, "Middle"),
        (6.2, 8.0, 0.25, "Outer"),
    ]

    for inner_r, outer_r, height, name in ring_specs:
        bpy.ops.mesh.primitive_cylinder_add(
            radius=outer_r, depth=height, vertices=128,
            location=(0, 0, FLOOR_Z + height / 2)
        )
        outer_obj = bpy.context.active_object
        outer_obj.name = f"Ring_{name}"

        # Boolean subtract center hole
        bpy.ops.mesh.primitive_cylinder_add(
            radius=inner_r, depth=height + 0.2, vertices=128,
            location=(0, 0, FLOOR_Z + height / 2)
        )
        hole = bpy.context.active_object

        bool_mod = outer_obj.modifiers.new("Bool", "BOOLEAN")
        bool_mod.operation = 'DIFFERENCE'
        bool_mod.object = hole
        bpy.context.view_layer.objects.active = outer_obj
        bpy.ops.object.modifier_apply(modifier="Bool")
        bpy.data.objects.remove(hole, do_unlink=True)

        bpy.ops.object.shade_smooth()

        # Bevel top edges — catches overhead light
        bevel = outer_obj.modifiers.new("Bevel", "BEVEL")
        bevel.width = 0.03
        bevel.segments = 2
        bevel.limit_method = 'ANGLE'
        bevel.angle_limit = math.radians(55)

        # Material: obsidian, slightly different per ring
        offset = (outer_r - 2.0) * 0.001
        outer_obj.data.materials.append(
            mat_obsidian(f"Ring_{name}",
                color=(0.012 + offset, 0.012 + offset, 0.016 + offset, 1.0),
                roughness=0.30, metallic=0.06)
        )
        rings.append(outer_obj)

    return rings


def create_steps():
    """4 wide steps leading up to the outer ring. Human scale reference."""
    steps = []
    step_mat = mat_obsidian("Steps",
        color=(0.013, 0.013, 0.017, 1.0), roughness=0.38, metallic=0.04)

    for idx, (w, d, h, x_off) in enumerate([
        (4.0, 1.5, 0.10, 9.0),
        (3.6, 1.2, 0.10, 9.0),
        (3.2, 1.0, 0.10, 9.0),
        (2.8, 0.8, 0.10, 9.0),
    ]):
        z = FLOOR_Z + idx * h + h / 2
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x_off, 0, z))
        step = bpy.context.active_object
        step.scale = (d / 2, w / 2, h / 2)
        bpy.ops.object.transform_apply(scale=True)
        step.name = f"Step_{idx}"
        step.data.materials.append(step_mat)

        bevel = step.modifiers.new("Bevel", "BEVEL")
        bevel.width = 0.01
        bevel.segments = 1
        steps.append(step)
    return steps


def create_sphere():
    """THE HERO — Dormant obsidian monolith hovering above the altar.
    Paul Franklin: 'It's a discovered artifact. Ancient. Patient.
    It doesn't glow. It absorbs light and watches you.'

    Large, smooth, physically correct obsidian.
    The real-time WebGL sphere overlays this during awakening."""
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=2.2, segments=128, ring_count=64,
        location=(0, 0, SPHERE_Z)
    )
    sphere = bpy.context.active_object
    sphere.name = "Sphere_Dormant"
    sphere.data.materials.append(mat_sphere())
    bpy.ops.object.shade_smooth()
    return sphere


def create_dome():
    """Massive vault ceiling — the enclosure.
    Interior surface is dark stone. Weathered, ancient.
    Must feel cathedral-scale."""
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=DOME_RADIUS, segments=128, ring_count=64,
        location=(0, 0, DOME_BASE_Z)
    )
    dome = bpy.context.active_object
    dome.name = "VaultDome"

    # Keep upper hemisphere only
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(dome.data)
    to_del = [v for v in bm.verts if v.co.z < DOME_BASE_Z]
    bmesh.ops.delete(bm, geom=to_del, context='VERTS')
    bmesh.update_edit_mesh(dome.data)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Flip normals — we see inside
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.flip_normals()
    bpy.ops.object.mode_set(mode='OBJECT')

    bpy.ops.object.shade_smooth()
    dome.data.materials.append(
        mat_dark_stone("DomeInterior",
            color=(0.010, 0.010, 0.014, 1.0),
            roughness=0.50, metallic=0.04)
    )
    return dome


def create_containment_shell():
    """Invisible light-containment hemisphere — replaces the visible dome.
    Much larger (radius 40), dead-black, featureless. You never see it
    directly — it just prevents volumetric scatter from bleeding to infinity.
    The ribs and overhead rings provide all the visible architecture."""
    shell_r = 22.0  # Just larger than rib tips (dome was 20) — contains light without being visible
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=shell_r, segments=64, ring_count=32,
        location=(0, 0, DOME_BASE_Z)
    )
    shell = bpy.context.active_object
    shell.name = "ContainmentShell"

    # Keep upper hemisphere only
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(shell.data)
    to_del = [v for v in bm.verts if v.co.z < DOME_BASE_Z]
    bmesh.ops.delete(bm, geom=to_del, context='VERTS')
    bmesh.update_edit_mesh(shell.data)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Flip normals — we see inside
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.flip_normals()
    bpy.ops.object.mode_set(mode='OBJECT')

    bpy.ops.object.shade_smooth()

    # Dead-black material — absorbs everything, invisible in render
    mat = bpy.data.materials.new("ContainmentBlack")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.002, 0.002, 0.003, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0  # Perfectly diffuse — no reflections
    bsdf.inputs["Metallic"].default_value = 0.0
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    shell.data.materials.append(mat)
    return shell


def create_vault_ribs():
    """THICK structural ribs — gothic cathedral scale.
    Paul Franklin: 'These cast shadows. They define the space.
    They're architecture, not decoration.'

    Continuous swept Bezier curves with rectangular cross-section.
    Thick enough to cast real shadows from overhead light."""
    ribs = []
    rib_count = 24
    rib_mat = mat_dark_stone("RibStone",
        color=(0.016, 0.016, 0.020, 1.0),
        roughness=0.48, metallic=0.06)

    dome_r = DOME_RADIUS - 0.4  # Slightly inset from dome surface
    n_pts = 20  # Points per curve arc

    for i in range(rib_count):
        angle = (i / rib_count) * math.pi * 2

        # Create a curve for this rib
        curve_data = bpy.data.curves.new(f'Rib_{i:02d}', 'CURVE')
        curve_data.dimensions = '3D'
        curve_data.bevel_depth = 0.55   # MASSIVE — gothic cathedral buttress scale
        curve_data.bevel_resolution = 2
        curve_data.fill_mode = 'FULL'
        # Rectangular cross-section via bevel object
        # (Using circular bevel for simplicity — still creates mass)

        spline = curve_data.splines.new('BEZIER')
        spline.bezier_points.add(n_pts - 1)

        for j, pt in enumerate(spline.bezier_points):
            t = j / (n_pts - 1)
            elev = t * math.radians(80)
            z = DOME_BASE_Z + dome_r * math.sin(elev)
            horiz_r = dome_r * math.cos(elev)
            x = math.cos(angle) * horiz_r
            y = math.sin(angle) * horiz_r
            pt.co = (x, y, z)
            pt.handle_left_type = 'AUTO'
            pt.handle_right_type = 'AUTO'

        curve_obj = bpy.data.objects.new(f'Rib_{i:02d}', curve_data)
        bpy.context.collection.objects.link(curve_obj)
        curve_obj.data.materials.append(rib_mat)
        ribs.append(curve_obj)

    return ribs


def create_overhead_rings():
    """Thick structural ring bands at dome elevations.
    Reference shows heavy curved bands sweeping across the vault.
    These are structural, not decorative — thick torus geometry."""
    rings = []
    ring_mat = mat_dark_stone("OverheadBand",
        color=(0.013, 0.013, 0.017, 1.0),
        roughness=0.45, metallic=0.08)

    dome_r = DOME_RADIUS - 0.5

    # Three heavy ring bands at key elevations
    for elev_deg, thickness in [(18, 0.70), (40, 0.85), (60, 0.65)]:
        elev = math.radians(elev_deg)
        z = DOME_BASE_Z + dome_r * math.sin(elev)
        horiz_r = dome_r * math.cos(elev)

        bpy.ops.mesh.primitive_torus_add(
            major_radius=horiz_r,
            minor_radius=thickness,
            major_segments=128,
            minor_segments=16,
            location=(0, 0, z)
        )
        ring = bpy.context.active_object
        ring.name = f"OverheadBand_{elev_deg}"
        ring.data.materials.append(ring_mat)
        bpy.ops.object.shade_smooth()
        rings.append(ring)

    return rings


# ═══════════════════════════════════════════════════════════════
#  LIGHTING — Single dominant key. Minimal fill. Dramatic shadows.
#  Paul Franklin: "The key light defines the world.
#  One source. Let everything else fall into shadow."
# ═══════════════════════════════════════════════════════════════

def setup_lighting():
    # ─── KEY: Overhead area light (through dome opening) ──────
    # This is THE light. Everything else is subordinate.
    bpy.ops.object.light_add(type='AREA', location=(0, 0, 18))
    key = bpy.context.active_object
    key.name = "Key_Overhead"
    key.data.energy = 4000  # Dramatically reduced — black shell + volumetrics
    key.data.size = 5.0  # Focused — creates defined shadows and god rays
    key.data.color = (0.95, 0.90, 0.80)  # Warm amber
    key.rotation_euler = (0, 0, 0)

    # ─── Subtle wide fill from above (catches dome details) ───
    bpy.ops.object.light_add(type='AREA', location=(0, 0, 16))
    fill_top = bpy.context.active_object
    fill_top.name = "Fill_Wide"
    fill_top.data.energy = 200
    fill_top.data.size = 20.0  # Very wide, very soft
    fill_top.data.color = (0.85, 0.85, 0.90)
    fill_top.rotation_euler = (0, 0, 0)

    # ─── Very subtle bounce from floor ────────────────────────
    bpy.ops.object.light_add(type='AREA', location=(0, 0, FLOOR_Z + 0.3))
    fill_floor = bpy.context.active_object
    fill_floor.name = "Fill_Floor"
    fill_floor.data.energy = 80
    fill_floor.data.size = 20.0
    fill_floor.data.color = (0.70, 0.72, 0.82)
    fill_floor.rotation_euler = (math.pi, 0, 0)  # Pointing up

    # ─── Sphere proximity light ───────────────────────────────
    # Very subtle — just enough to show sphere isn't floating in void
    # Simulates ambient occlusion / bounce near the sphere
    # Sphere top highlight — area light above sphere, pointing down
    bpy.ops.object.light_add(type='AREA', location=(0, 0, SPHERE_Z + 4.0))
    sphere_top = bpy.context.active_object
    sphere_top.name = "SphereTopLight"
    sphere_top.data.energy = 300  # Crown highlight — separates sphere from background
    sphere_top.data.size = 4.0  # Wider, softer highlight on sphere crown
    sphere_top.data.color = (0.90, 0.88, 0.82)
    sphere_top.rotation_euler = (0, 0, 0)  # Pointing down at sphere

    # ─── Dome wash uplights — make vault architecture visible ──
    # Reference shows dome structure clearly lit from below/ambient
    for i in range(6):
        angle = (i / 6) * math.pi * 2
        x = math.cos(angle) * 14
        y = math.sin(angle) * 14
        bpy.ops.object.light_add(type='AREA', location=(x, y, FLOOR_Z + 1.0))
        wash = bpy.context.active_object
        wash.name = f"DomeWash_{i}"
        wash.data.energy = 25  # Very subtle rib structure fill
        wash.data.size = 5.0
        wash.data.color = (0.80, 0.82, 0.88)
        wash.rotation_euler = (math.pi, 0, 0)  # Pointing up

    # ─── Rim lights for depth ─────────────────────────────────
    for i in range(4):
        angle = (i / 4) * math.pi * 2 + 0.4
        x = math.cos(angle) * 16
        y = math.sin(angle) * 16
        bpy.ops.object.light_add(type='SPOT', location=(x, y, 5))
        rim = bpy.context.active_object
        rim.name = f"Rim_{i}"
        rim.data.energy = 60  # Very subtle rim separation only
        rim.data.spot_size = math.radians(75)  # Wide, diffuse
        rim.data.spot_blend = 0.6
        rim.data.color = (0.82, 0.84, 0.90)
        direction = Vector((0, 0, 2)) - Vector((x, y, 5))
        rim.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


# ═══════════════════════════════════════════════════════════════
#  ATMOSPHERE — Heavy volumetrics. God rays. Visible depth haze.
#  IQ: "Density 0.004 is invisible. You need 0.025+."
#  Paul Franklin: "The atmosphere IS a character."
# ═══════════════════════════════════════════════════════════════

def setup_world():
    world = bpy.data.worlds.new("ChamberWorld")
    scene.world = world
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.001, 0.001, 0.002, 1.0)
    bg.inputs["Strength"].default_value = 0.05

    # HEAVY volumetric scatter — this creates the god rays
    vol = nodes.new("ShaderNodeVolumeScatter")
    vol.inputs["Color"].default_value = (0.88, 0.87, 0.90, 1.0)
    vol.inputs["Density"].default_value = 0.008  # Reduced — still visible god rays but not whiteout
    vol.inputs["Anisotropy"].default_value = 0.35  # Forward scattering for god rays

    links.new(bg.outputs["Background"], out.inputs["Surface"])
    links.new(vol.outputs["Volume"], out.inputs["Volume"])

    out.location = (300, 0)
    bg.location = (0, 0)
    vol.location = (0, -200)


# ═══════════════════════════════════════════════════════════════
#  CAMERA — Slow orbit. Human eye level. Looking UP at sphere.
# ═══════════════════════════════════════════════════════════════

def setup_camera():
    """Orbiting camera — 360° over 15 seconds (450 frames at 30fps).
    Sarah: 'Half the frames, twice the quality per frame.'"""

    # Camera at human eye level, pulled back to show full vault
    bpy.ops.object.camera_add(location=(0, -13, 1.5))
    cam = bpy.context.active_object
    cam.name = "OrbitCamera"
    scene.camera = cam

    cam.data.lens = 22  # Wide enough to capture vault scale
    cam.data.clip_start = 0.1
    cam.data.clip_end = 100
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = 13.0
    cam.data.dof.aperture_fstop = 3.2  # Gentle bokeh on background

    # Track target — look at sphere, slightly above center
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 1.2))
    target = bpy.context.active_object
    target.name = "CamTarget"

    track = cam.constraints.new('TRACK_TO')
    track.target = target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'

    # Orbit pivot
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    pivot = bpy.context.active_object
    pivot.name = "OrbitPivot"
    cam.parent = pivot

    # 450 frames = 15 seconds at 30fps
    scene.frame_start = 1
    scene.frame_end = 450
    scene.render.fps = 30

    pivot.rotation_euler = (0, 0, 0)
    pivot.keyframe_insert(data_path="rotation_euler", frame=1)
    pivot.rotation_euler = (0, 0, math.pi * 2)
    pivot.keyframe_insert(data_path="rotation_euler", frame=451)

    # Linear interpolation for seamless loop
    try:
        action = pivot.animation_data.action
        fcurves = None
        if hasattr(action, 'fcurves'):
            fcurves = action.fcurves
        elif hasattr(action, 'layers') and len(action.layers) > 0:
            for strip in action.layers[0].strips:
                if hasattr(strip, 'channelbags'):
                    for bag in strip.channelbags:
                        fcurves = bag.fcurves
                        break
        if fcurves:
            for fc in fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = 'LINEAR'
            print("[NOVACORE v2] Linear orbit interpolation set")
    except Exception as e:
        print(f"[NOVACORE v2] Warning: fcurves: {e}")

    return cam


# ═══════════════════════════════════════════════════════════════
#  RENDER SETTINGS — Film quality. Cycles + Metal GPU.
# ═══════════════════════════════════════════════════════════════

def setup_render():
    scene.render.engine = 'CYCLES'
    scene.render.resolution_x = RESOLUTION_X
    scene.render.resolution_y = RESOLUTION_Y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False

    cycles = scene.cycles
    cycles.device = 'GPU'
    cycles.samples = SAMPLES
    cycles.use_denoising = True
    cycles.denoiser = 'OPENIMAGEDENOISE'
    cycles.preview_samples = 32

    # Volumetric quality — critical for god rays
    cycles.volume_step_rate = 0.5    # Finer steps = cleaner god rays
    cycles.volume_max_steps = 512    # More steps for thick atmosphere
    cycles.volume_preview_step_rate = 2.0

    # Film settings
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.compression = 15

    # Filmic color management — cinematic
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'High Contrast'
    scene.view_settings.exposure = 0.0  # Neutral — let Filmic High Contrast do the work
    scene.view_settings.gamma = 1.0

    # Metal GPU
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for device in prefs.devices:
        device.use = (device.type == 'METAL')

    scene.render.filepath = os.path.join(OUTPUT_DIR, "frame_")


# ═══════════════════════════════════════════════════════════════
#  BUILD & RENDER
# ═══════════════════════════════════════════════════════════════

print("[NOVACORE v2] Building chamber scene...")

create_floor()
create_ring_platform()
create_steps()
create_sphere()        # THE HERO — dormant obsidian monolith
create_containment_shell()  # Invisible dark enclosure — contains volumetric light
create_vault_ribs()
create_overhead_rings()
setup_lighting()       # 4 lights only. Let path tracer work.
setup_world()          # Heavy volumetrics.
setup_camera()         # 450 frames, 15s loop
setup_render()

print(f"[NOVACORE v2] Scene built. Objects: {len(bpy.data.objects)}")

# ─── Render ───────────────────────────────────────────────────
if FRAME is not None:
    print(f"[NOVACORE v2] Rendering frame {FRAME}...")
    scene.frame_set(FRAME)
    scene.render.filepath = os.path.join(OUTPUT_DIR, f"frame_{FRAME:04d}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[NOVACORE v2] Frame {FRAME} saved.")

elif ANIMATION:
    print(f"[NOVACORE v2] Rendering animation ({scene.frame_start}-{scene.frame_end})...")
    scene.render.filepath = os.path.join(OUTPUT_DIR, "frame_")
    bpy.ops.render.render(animation=True)
    print("[NOVACORE v2] Animation complete.")

else:
    blend_path = os.path.join(OUTPUT_DIR, "chamber_v2.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"[NOVACORE v2] Scene saved to {blend_path}")
    print("[NOVACORE v2] Run --frame 1 --preview for quick test.")
