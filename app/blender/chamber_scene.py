"""
NOVACORE Chamber — Cinematic Architectural Vault
Blender Python script for headless rendering via CLI.

Usage:
  blender --background --python chamber_scene.py -- --frame 1 --samples 32
  blender --background --python chamber_scene.py -- --animation --samples 256

Builds: concentric ring platform, ribbed vault dome, detailed floor,
volumetric god rays, atmospheric haze. Sphere void at center for
real-time WebGL compositing.

Visual Board reference: dark obsidian architectural vault with
concentric rings, ribbed ceiling, volumetric lighting from above.
"""

import bpy
import bmesh
import math
import sys
import os
from mathutils import Vector, Matrix

# ─── Parse CLI args ────────────────────────────────────────────────
argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = []

FRAME = None
ANIMATION = False
SAMPLES = 64
RESOLUTION_X = 3840
RESOLUTION_Y = 2160
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "renders")

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
        SAMPLES = 32; RESOLUTION_X = 1920; RESOLUTION_Y = 1080; i += 1
    elif argv[i] == "--outdir" and i + 1 < len(argv):
        OUTPUT_DIR = argv[i + 1]; i += 2
    else:
        i += 1

print(f"[NOVACORE] Samples: {SAMPLES}, Resolution: {RESOLUTION_X}x{RESOLUTION_Y}")
print(f"[NOVACORE] Output: {OUTPUT_DIR}")

# ─── Clean scene ───────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ═══════════════════════════════════════════════════════════════════
#  MATERIALS
# ═══════════════════════════════════════════════════════════════════

def make_obsidian_material(name, base_color=(0.012, 0.012, 0.018, 1.0),
                           roughness=0.28, metallic=0.08):
    """Dark volcanic glass — near-black with subtle specular."""
    mat = bpy.data.materials.new(name)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Base Color"].default_value = base_color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    # Subtle subsurface for depth
    principled.inputs["Subsurface Weight"].default_value = 0.02
    principled.inputs["Subsurface Radius"].default_value = (0.05, 0.02, 0.08)

    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    output.location = (400, 0)
    principled.location = (0, 0)
    return mat


def make_floor_material():
    """Obsidian floor with procedural circuit-board etch pattern."""
    mat = bpy.data.materials.new("FloorObsidian")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")

    # Base obsidian
    principled.inputs["Base Color"].default_value = (0.008, 0.008, 0.014, 1.0)
    principled.inputs["Roughness"].default_value = 0.22
    principled.inputs["Metallic"].default_value = 0.12

    # Voronoi for circuit-board pattern (displacement + roughness variation)
    tex_coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (8.0, 8.0, 8.0)

    voronoi = nodes.new("ShaderNodeTexVoronoi")
    voronoi.voronoi_dimensions = '3D'
    voronoi.feature = 'F1'
    voronoi.inputs["Scale"].default_value = 12.0

    voronoi2 = nodes.new("ShaderNodeTexVoronoi")
    voronoi2.voronoi_dimensions = '3D'
    voronoi2.feature = 'F2'
    voronoi2.inputs["Scale"].default_value = 6.0

    # Mix voronoi layers for circuit-etch look
    mix_vor = nodes.new("ShaderNodeMixRGB")
    mix_vor.blend_type = 'SUBTRACT'
    mix_vor.inputs["Fac"].default_value = 0.5

    # Color ramp to sharpen edges into lines
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.02
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp.color_ramp.elements[1].position = 0.06
    ramp.color_ramp.elements[1].color = (0.03, 0.03, 0.04, 1.0)

    # Bump for surface detail
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    bump.inputs["Distance"].default_value = 0.002

    # Wire it up
    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], voronoi.inputs["Vector"])
    links.new(mapping.outputs["Vector"], voronoi2.inputs["Vector"])
    links.new(voronoi.outputs["Distance"], mix_vor.inputs["Color1"])
    links.new(voronoi2.outputs["Distance"], mix_vor.inputs["Color2"])
    links.new(mix_vor.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])

    # Roughness variation from voronoi (etched areas slightly rougher)
    rough_ramp = nodes.new("ShaderNodeValToRGB")
    rough_ramp.color_ramp.elements[0].position = 0.0
    rough_ramp.color_ramp.elements[0].color = (0.18, 0.18, 0.18, 1.0)
    rough_ramp.color_ramp.elements[1].position = 0.1
    rough_ramp.color_ramp.elements[1].color = (0.35, 0.35, 0.35, 1.0)
    links.new(mix_vor.outputs["Color"], rough_ramp.inputs["Fac"])
    links.new(rough_ramp.outputs["Color"], principled.inputs["Roughness"])

    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    # Layout nodes
    output.location = (800, 0)
    principled.location = (400, 0)
    tex_coord.location = (-600, 0)
    mapping.location = (-400, 0)
    voronoi.location = (-200, 100)
    voronoi2.location = (-200, -100)
    mix_vor.location = (0, 0)
    ramp.location = (200, 100)
    bump.location = (200, -100)

    return mat


def make_metal_rib_material():
    """Brushed dark metal for vault ribs."""
    mat = bpy.data.materials.new("VaultRibMetal")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Base Color"].default_value = (0.018, 0.018, 0.022, 1.0)
    principled.inputs["Roughness"].default_value = 0.38
    principled.inputs["Metallic"].default_value = 0.65

    # Anisotropic for brushed look
    principled.inputs["Anisotropic"].default_value = 0.3

    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    output.location = (400, 0)
    principled.location = (0, 0)
    return mat


def make_ring_material(name, lightness_offset=0.0):
    """Ring platform material — slightly lighter obsidian with edge wear."""
    base = 0.015 + lightness_offset
    mat = make_obsidian_material(name,
        base_color=(base, base, base + 0.005, 1.0),
        roughness=0.32, metallic=0.10)
    return mat


# ═══════════════════════════════════════════════════════════════════
#  GEOMETRY
# ═══════════════════════════════════════════════════════════════════

# ─── Floor ─────────────────────────────────────────────────────────
def create_floor():
    """Large circular obsidian floor."""
    bpy.ops.mesh.primitive_cylinder_add(
        radius=25, depth=0.3, vertices=128,
        location=(0, 0, -2.4)
    )
    floor = bpy.context.active_object
    floor.name = "ChamberFloor"
    floor.data.materials.append(make_floor_material())

    # Smooth shading
    bpy.ops.object.shade_smooth()

    # Subtle subdivision for displacement
    mod = floor.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = 0
    mod.render_levels = 2
    return floor


# ─── Concentric Ring Platform ──────────────────────────────────────
def create_ring_platform():
    """Three concentric raised rings below the sphere void.
    The altar — sacred geometry, architectural reverence."""
    rings = []
    ring_specs = [
        # (inner_r, outer_r, height, z_offset, name)
        (2.0, 3.2, 0.35, -2.25, "InnerRing"),
        (3.8, 5.2, 0.28, -2.25, "MiddleRing"),
        (5.8, 7.5, 0.20, -2.25, "OuterRing"),
    ]

    for inner_r, outer_r, height, z, name in ring_specs:
        # Create ring using torus-like approach: cylinder with inner hole
        bpy.ops.mesh.primitive_cylinder_add(
            radius=outer_r, depth=height, vertices=128,
            location=(0, 0, z + height / 2)
        )
        outer = bpy.context.active_object
        outer.name = name

        # Boolean subtract inner cylinder
        bpy.ops.mesh.primitive_cylinder_add(
            radius=inner_r, depth=height + 0.1, vertices=128,
            location=(0, 0, z + height / 2)
        )
        inner = bpy.context.active_object
        inner.name = f"{name}_hole"

        bool_mod = outer.modifiers.new("Bool", "BOOLEAN")
        bool_mod.operation = 'DIFFERENCE'
        bool_mod.object = inner
        bpy.context.view_layer.objects.active = outer
        bpy.ops.object.modifier_apply(modifier="Bool")

        # Delete the boolean cutter
        bpy.data.objects.remove(inner, do_unlink=True)

        # Smooth shading
        bpy.ops.object.shade_smooth()

        # Bevel top edges for subtle highlight catch
        bevel = outer.modifiers.new("Bevel", "BEVEL")
        bevel.width = 0.02
        bevel.segments = 2
        bevel.limit_method = 'ANGLE'
        bevel.angle_limit = math.radians(60)

        # Material
        lightness = (outer_r - 2.0) * 0.002  # outer rings slightly lighter
        outer.data.materials.append(make_ring_material(f"Ring_{name}", lightness))
        rings.append(outer)

    # Add emissive edge accent rings on platform inner edges
    # Subtle glowing lines echoing the dome circuit pattern
    platform_glow_mat = bpy.data.materials.new("PlatformEdgeGlow")
    pg_nodes = platform_glow_mat.node_tree.nodes
    pg_links = platform_glow_mat.node_tree.links
    pg_nodes.clear()
    pg_out = pg_nodes.new("ShaderNodeOutputMaterial")
    pg_p = pg_nodes.new("ShaderNodeBsdfPrincipled")
    pg_p.inputs["Base Color"].default_value = (0.02, 0.01, 0.04, 1.0)
    pg_p.inputs["Roughness"].default_value = 0.2
    pg_p.inputs["Metallic"].default_value = 0.9
    pg_p.inputs["Emission Color"].default_value = (0.10, 0.05, 0.25, 1.0)
    pg_p.inputs["Emission Strength"].default_value = 0.8
    pg_links.new(pg_p.outputs["BSDF"], pg_out.inputs["Surface"])

    for inner_r, _, height, z, name in ring_specs:
        # Thin emissive torus at inner edge of each ring
        bpy.ops.mesh.primitive_torus_add(
            major_radius=inner_r + 0.05,
            minor_radius=0.025,
            major_segments=96, minor_segments=6,
            location=(0, 0, z + height + 0.01)
        )
        glow = bpy.context.active_object
        glow.name = f"PlatformGlow_{name}"
        glow.data.materials.append(platform_glow_mat)
        rings.append(glow)

    return rings


# ─── Steps ─────────────────────────────────────────────────────────
def create_steps():
    """4 steps leading up to the outer ring — human scale reference."""
    steps = []
    step_specs = [
        # (width, depth, height, x_offset, z_offset)
        (3.0, 1.2, 0.08, 8.2, -2.25),
        (2.8, 1.0, 0.08, 8.2, -2.17),
        (2.6, 0.8, 0.08, 8.2, -2.09),
        (2.4, 0.6, 0.08, 8.2, -2.01),
    ]
    mat = make_obsidian_material("StepObsidian",
        base_color=(0.014, 0.014, 0.019, 1.0), roughness=0.35)

    for width, depth, height, x, z in step_specs:
        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(x, 0, z + height / 2)
        )
        step = bpy.context.active_object
        step.scale = (depth / 2, width / 2, height / 2)
        bpy.ops.object.transform_apply(scale=True)
        step.name = f"Step_{len(steps)}"
        step.data.materials.append(mat)

        # Subtle bevel
        bevel = step.modifiers.new("Bevel", "BEVEL")
        bevel.width = 0.008
        bevel.segments = 1

        steps.append(step)
    return steps


# ─── Vault Dome ────────────────────────────────────────────────────
def create_dome():
    """Large hemisphere enclosure — the vault ceiling."""
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=18, segments=128, ring_count=64,
        location=(0, 0, -2.25)
    )
    dome = bpy.context.active_object
    dome.name = "VaultDome"

    # Delete bottom half (keep upper hemisphere only)
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(dome.data)
    to_delete = [v for v in bm.verts if v.co.z < -2.25]
    bmesh.ops.delete(bm, geom=to_delete, context='VERTS')
    bmesh.update_edit_mesh(dome.data)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Invert normals (we see inside)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.flip_normals()
    bpy.ops.object.mode_set(mode='OBJECT')

    # Smooth shading — eliminates panel faceting for clean dome surface
    bpy.ops.object.shade_smooth()

    # Dark interior material — moderate roughness, some specular
    mat = make_obsidian_material("DomeInterior",
        base_color=(0.008, 0.008, 0.014, 1.0), roughness=0.35, metallic=0.10)
    dome.data.materials.append(mat)

    return dome


# ─── Vault Ribs ────────────────────────────────────────────────────
def create_vault_ribs():
    """24 radial ribs inside the dome — architectural structure.
    When backlit by volumetric light, they create dramatic silhouettes.

    Each rib is an arc of boxes marching from floor to dome apex,
    following the dome curvature. Much more visible than single boxes."""
    ribs = []
    rib_count = 16  # Clean radial pattern

    # Create emissive material for rib glow curves
    edge_mat = bpy.data.materials.new("RibEdgeGlow")
    edge_nodes = edge_mat.node_tree.nodes
    edge_links = edge_mat.node_tree.links
    edge_nodes.clear()
    e_output = edge_nodes.new("ShaderNodeOutputMaterial")
    e_principled = edge_nodes.new("ShaderNodeBsdfPrincipled")
    e_principled.inputs["Base Color"].default_value = (0.03, 0.02, 0.06, 1.0)
    e_principled.inputs["Roughness"].default_value = 0.25
    e_principled.inputs["Metallic"].default_value = 0.8
    e_principled.inputs["Emission Color"].default_value = (0.12, 0.06, 0.30, 1.0)
    e_principled.inputs["Emission Strength"].default_value = 0.8
    edge_links.new(e_principled.outputs["BSDF"], e_output.inputs["Surface"])

    dome_radius = 16.8
    base_z = -2.25

    # ── Smooth emissive Bezier curves (one continuous arc per rib) ──
    # No structural box segments — the curves ARE the ribs
    # Bezier curves following each dome meridian = perfectly smooth glowing lines
    inset_r = dome_radius - 0.5
    n_curve_pts = 24  # High enough for smooth arc

    for i in range(rib_count):
        angle = (i / rib_count) * math.pi * 2

        curve_data = bpy.data.curves.new(f'RibCurve_{i:02d}', 'CURVE')
        curve_data.dimensions = '3D'
        curve_data.bevel_depth = 0.025  # Refined thin tube for subtle glow
        curve_data.bevel_resolution = 3
        curve_data.fill_mode = 'FULL'

        spline = curve_data.splines.new('BEZIER')
        spline.bezier_points.add(n_curve_pts - 1)  # Already has 1

        for j, pt in enumerate(spline.bezier_points):
            t = j / (n_curve_pts - 1)
            elev = t * math.radians(76)
            z = base_z + inset_r * math.sin(elev)
            horiz_r = inset_r * math.cos(elev)
            x = math.cos(angle) * horiz_r
            y = math.sin(angle) * horiz_r
            pt.co = (x, y, z)
            pt.handle_left_type = 'AUTO'
            pt.handle_right_type = 'AUTO'

        curve_obj = bpy.data.objects.new(f'RibEdgeCurve_{i:02d}', curve_data)
        bpy.context.collection.objects.link(curve_obj)
        curve_obj.data.materials.append(edge_mat)
        ribs.append(curve_obj)

    return ribs


# ─── Overhead Ring Structure ───────────────────────────────────────
def create_overhead_rings():
    """Concentric overhead rings/bands echoing the floor platform.
    Creates the sweeping curved structure visible in the reference.
    Also adds emissive horizontal rings that connect the vertical rib lines
    into a neural-network / circuit-grid pattern on the dome."""
    rings = []
    mat = make_metal_rib_material()

    # Structural overhead rings (thick dark metal)
    ring_specs = [
        # (radius, tube_radius, height)
        (5.0, 0.30, 7.0),
        (8.5, 0.35, 9.5),
        (12.0, 0.40, 11.5),
        (15.0, 0.32, 13.5),
    ]

    for radius, tube_r, height in ring_specs:
        bpy.ops.mesh.primitive_torus_add(
            major_radius=radius, minor_radius=tube_r,
            major_segments=96, minor_segments=8,
            location=(0, 0, height)
        )
        ring = bpy.context.active_object
        ring.name = f"OverheadRing_{radius:.0f}"
        ring.data.materials.append(mat)
        rings.append(ring)

    # Emissive horizontal circuit rings on the dome surface
    # These connect the vertical rib edge lines into a grid/network
    edge_mat = bpy.data.materials.get("RibEdgeGlow")  # Reuse from ribs
    if edge_mat:
        dome_r = 16.5  # slightly inset from dome surface
        base_z = -2.25
        # Selective circuit rings at key elevations — 3 rings, not a full grid
        for elev_deg in [22, 45, 65]:
            elev = math.radians(elev_deg)
            z = base_z + dome_r * math.sin(elev)
            horiz_r = dome_r * math.cos(elev)

            bpy.ops.mesh.primitive_torus_add(
                major_radius=horiz_r, minor_radius=0.03,
                major_segments=96, minor_segments=6,
                location=(0, 0, z)
            )
            glow_ring = bpy.context.active_object
            glow_ring.name = f"DomeCircuit_{elev_deg}"
            glow_ring.data.materials.append(edge_mat)
            rings.append(glow_ring)

    return rings


# ═══════════════════════════════════════════════════════════════════
#  LIGHTING
# ═══════════════════════════════════════════════════════════════════

def setup_lighting():
    """Film-quality lighting: overhead key, sphere placeholder, fills."""

    # ─── Overhead area light (key light — through dome opening) ───
    # Paul Franklin: "The key light defines the world. It has to be
    # strong enough to reveal the architecture."
    bpy.ops.object.light_add(type='AREA', location=(0, 0, 16))
    key = bpy.context.active_object
    key.name = "KeyLight_Overhead"
    key.data.energy = 3500
    key.data.size = 8.0
    key.data.color = (0.95, 0.88, 0.78)  # Warm amber — cinematic contrast with cool dome
    key.rotation_euler = (0, 0, 0)  # Pointing straight down

    # Second overhead for broader fill through dome
    bpy.ops.object.light_add(type='AREA', location=(0, 0, 14))
    key2 = bpy.context.active_object
    key2.name = "KeyLight_Wide"
    key2.data.energy = 1200
    key2.data.size = 16.0
    key2.data.color = (0.88, 0.88, 0.92)
    key2.rotation_euler = (0, 0, 0)

    # ─── Sphere placeholder point light ───
    # Casts light/shadows on ring platform as if sphere were present
    bpy.ops.object.light_add(type='POINT', location=(0, 0, 0.5))
    sphere_light = bpy.context.active_object
    sphere_light.name = "SphereGlow"
    sphere_light.data.energy = 600
    sphere_light.data.color = (0.45, 0.35, 0.85)  # NOVA purple-blue tint
    sphere_light.data.shadow_soft_size = 1.5

    # Second sphere glow — wider, dimmer, for ambient fill on rings
    bpy.ops.object.light_add(type='POINT', location=(0, 0, 0))
    sphere_ambient = bpy.context.active_object
    sphere_ambient.name = "SphereAmbient"
    sphere_ambient.data.energy = 200
    sphere_ambient.data.color = (0.35, 0.30, 0.70)
    sphere_ambient.data.shadow_soft_size = 4.0

    # ─── Fill from below (bounce light) ───
    bpy.ops.object.light_add(type='AREA', location=(0, 0, -1.8))
    fill = bpy.context.active_object
    fill.name = "FillLight_Below"
    fill.data.energy = 120
    fill.data.size = 14.0
    fill.data.color = (0.65, 0.70, 0.88)  # Cool blue fill
    fill.rotation_euler = (math.pi, 0, 0)  # Pointing up

    # ─── Rim/accent lights for architectural depth ───
    for i, angle in enumerate([0.0, 0.8, 1.57, 2.4, 3.14, 4.0, 4.71, 5.6]):
        x = math.cos(angle) * 15
        y = math.sin(angle) * 15
        bpy.ops.object.light_add(type='SPOT', location=(x, y, 6))
        rim = bpy.context.active_object
        rim.name = f"RimLight_{i}"
        rim.data.energy = 200
        rim.data.spot_size = math.radians(55)
        rim.data.spot_blend = 0.6
        rim.data.color = (0.78, 0.80, 0.88)
        # Point toward center
        direction = Vector((0, 0, 0)) - Vector((x, y, 6))
        rim.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    # ─── Dome accent lights — illuminate ribs and overhead structure ───
    # Dome accent lights — subtle, spread widely, soft shadows
    for ring_h, ring_r, energy in [(7, 10, 150), (11, 5, 100)]:
        for i in range(4):
            angle = (i / 4) * math.pi * 2 + 0.5
            x = math.cos(angle) * ring_r
            y = math.sin(angle) * ring_r
            bpy.ops.object.light_add(type='POINT', location=(x, y, ring_h))
            dome_light = bpy.context.active_object
            dome_light.name = f"DomeAccent_{ring_h}_{i}"
            dome_light.data.energy = energy
            dome_light.data.color = (0.80, 0.82, 0.90)
            dome_light.data.shadow_soft_size = 5.0

    # Upward-facing area lights at floor level — soft dome wash
    # (Area lights create softer, more natural illumination than spots)
    for i in range(4):
        angle = (i / 4) * math.pi * 2 + 0.3
        x = math.cos(angle) * 13
        y = math.sin(angle) * 13
        bpy.ops.object.light_add(type='AREA', location=(x, y, -1.0))
        uplighter = bpy.context.active_object
        uplighter.name = f"DomeWash_{i}"
        uplighter.data.energy = 200
        uplighter.data.size = 6.0
        uplighter.data.color = (0.70, 0.72, 0.85)
        # Point straight up
        uplighter.rotation_euler = (math.pi, 0, 0)

    # Central overhead point (apex glow)
    bpy.ops.object.light_add(type='POINT', location=(0, 0, 14))
    apex = bpy.context.active_object
    apex.name = "ApexGlow"
    apex.data.energy = 400
    apex.data.color = (0.90, 0.88, 0.95)
    apex.data.shadow_soft_size = 5.0


# ═══════════════════════════════════════════════════════════════════
#  WORLD / ATMOSPHERE
# ═══════════════════════════════════════════════════════════════════

def setup_world():
    """World shader with volumetric scatter for god rays."""
    world = bpy.data.worlds.new("ChamberWorld")
    scene.world = world
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.002, 0.002, 0.004, 1.0)
    bg.inputs["Strength"].default_value = 0.1

    # Volumetric scatter for god rays
    vol_scatter = nodes.new("ShaderNodeVolumeScatter")
    vol_scatter.inputs["Color"].default_value = (0.85, 0.85, 0.92, 1.0)
    vol_scatter.inputs["Density"].default_value = 0.004
    vol_scatter.inputs["Anisotropy"].default_value = 0.3

    links.new(bg.outputs["Background"], output.inputs["Surface"])
    links.new(vol_scatter.outputs["Volume"], output.inputs["Volume"])

    output.location = (400, 0)
    bg.location = (0, 0)
    vol_scatter.location = (0, -200)


# ═══════════════════════════════════════════════════════════════════
#  CAMERA
# ═══════════════════════════════════════════════════════════════════

def setup_camera():
    """Orbiting camera — 360° rotation over 30 seconds (900 frames at 30fps)."""
    bpy.ops.object.camera_add(location=(0, -11, 3.0))
    cam = bpy.context.active_object
    cam.name = "OrbitCamera"
    scene.camera = cam

    # Camera settings
    cam.data.lens = 20  # Wider angle to capture more dome overhead
    cam.data.clip_start = 0.1
    cam.data.clip_end = 100
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = 11.0
    cam.data.dof.aperture_fstop = 4.0  # Subtle depth of field

    # Create empty at center as track target — raised to show more dome
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 1.5))
    target = bpy.context.active_object
    target.name = "CameraTarget"

    # Track-to constraint (camera always looks at center)
    track = cam.constraints.new('TRACK_TO')
    track.target = target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'

    # Parent camera to an empty that rotates (clean orbit)
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    orbit_pivot = bpy.context.active_object
    orbit_pivot.name = "OrbitPivot"

    cam.parent = orbit_pivot

    # Keyframe 360° rotation over 900 frames
    scene.frame_start = 1
    scene.frame_end = 900
    scene.render.fps = 30

    orbit_pivot.rotation_euler = (0, 0, 0)
    orbit_pivot.keyframe_insert(data_path="rotation_euler", frame=1)

    orbit_pivot.rotation_euler = (0, 0, math.pi * 2)
    orbit_pivot.keyframe_insert(data_path="rotation_euler", frame=901)

    # Linear interpolation for seamless loop (no ease in/out)
    try:
        action = orbit_pivot.animation_data.action
        # Blender 5.0+: try fcurves on action or its layers
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
            print("[NOVACORE] Camera orbit set to linear interpolation")
        else:
            print("[NOVACORE] Warning: Could not set linear interpolation on camera orbit")
    except Exception as e:
        print(f"[NOVACORE] Warning: fcurves access failed ({e}), orbit may have ease in/out")

    return cam


# ═══════════════════════════════════════════════════════════════════
#  RENDER SETTINGS
# ═══════════════════════════════════════════════════════════════════

def setup_render():
    """Cycles path tracer with Metal GPU, film-quality settings."""
    scene.render.engine = 'CYCLES'
    scene.render.resolution_x = RESOLUTION_X
    scene.render.resolution_y = RESOLUTION_Y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False

    # Cycles settings
    cycles = scene.cycles
    cycles.device = 'GPU'
    cycles.samples = SAMPLES
    cycles.use_denoising = True
    cycles.denoiser = 'OPENIMAGEDENOISE'
    cycles.preview_samples = 32

    # Volumetric settings for god rays
    cycles.volume_step_rate = 1.0
    cycles.volume_max_steps = 256
    cycles.volume_preview_step_rate = 4.0

    # Film exposure and color management
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.compression = 15

    # Color management — filmic for cinematic look
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'High Contrast'
    scene.view_settings.exposure = 0.7
    scene.view_settings.gamma = 1.0

    # Enable Metal GPU
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for device in prefs.devices:
        device.use = (device.type == 'METAL')

    # Output path
    scene.render.filepath = os.path.join(OUTPUT_DIR, "frame_")


# ═══════════════════════════════════════════════════════════════════
#  BUILD SCENE
# ═══════════════════════════════════════════════════════════════════

print("[NOVACORE] Building chamber scene...")

create_floor()
create_ring_platform()
create_steps()
create_dome()
create_vault_ribs()
create_overhead_rings()
setup_lighting()
setup_world()
setup_camera()
setup_render()

print("[NOVACORE] Scene built. Objects:", len(bpy.data.objects))

# ─── Render ────────────────────────────────────────────────────────
if FRAME is not None:
    print(f"[NOVACORE] Rendering frame {FRAME}...")
    scene.frame_set(FRAME)
    scene.render.filepath = os.path.join(OUTPUT_DIR, f"frame_{FRAME:04d}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[NOVACORE] Frame {FRAME} saved to {scene.render.filepath}")

elif ANIMATION:
    print(f"[NOVACORE] Rendering animation (frames {scene.frame_start}-{scene.frame_end})...")
    scene.render.filepath = os.path.join(OUTPUT_DIR, "frame_")
    bpy.ops.render.render(animation=True)
    print("[NOVACORE] Animation render complete.")

else:
    # Save .blend file for inspection
    blend_path = os.path.join(OUTPUT_DIR, "chamber_scene.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"[NOVACORE] Scene saved to {blend_path}")
    print("[NOVACORE] Run with --frame 1 --samples 32 to render a test frame.")
