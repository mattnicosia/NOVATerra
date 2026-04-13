#!/usr/bin/env python3
"""
NOVATerra Auto-Labeling Pipeline
═════════════════════════════════
Uses Claude Vision to detect schedule_table and door_window regions
on blueprint PDFs from intake-template/plan-sets.

Generates YOLO-format labels (class x_center y_center width height)
for the two classes that have ZERO training examples:
  - Class 0: schedule_table
  - Class 3: door_window

Also detects floor_area (2), fixture (4), wall_linear (1), annotation (5)
to supplement the existing dataset.

Usage:
    python3 autolabel.py                    # Process all PDFs
    python3 autolabel.py --project "01"     # Process one project
    python3 autolabel.py --dry-run          # Preview without writing
    python3 autolabel.py --visualize        # Generate overlay images

Requires:
    pip install anthropic pymupdf pillow pyyaml
"""

import os
import sys
import json
import base64
import time
import yaml
from pathlib import Path
from collections import Counter

# ── Configuration ──
TRAINING_DIR = Path(__file__).parent
DATASET_DIR = TRAINING_DIR / "dataset"
INTAKE_DIR = TRAINING_DIR / "intake-template" / "plan-sets"
CONFIG_PATH = TRAINING_DIR / "config.yaml"

NEW_CLASSES = ["schedule_table", "wall_linear", "floor_area", "door_window", "fixture", "annotation"]

# Claude Vision prompt for auto-labeling
DETECTION_PROMPT = """You are labeling construction blueprint drawings for object detection training.

For this blueprint page, identify ALL instances of these object categories and return their bounding boxes:

1. **schedule_table** (class 0): Any tabular schedule, legend, or data table on the drawing.
   - Door schedules, window schedules, finish schedules, equipment schedules
   - Room finish matrices, fixture schedules, lighting schedules
   - Any table with rows and columns containing specification data
   - Legends with structured data (not simple keynote legends)

2. **wall_linear** (class 1): Wall line segments visible on floor plans.
   - Interior partition walls, exterior walls, demising walls
   - Must be structural/architectural walls, NOT dimension lines or grid lines

3. **floor_area** (class 2): Large enclosed floor/room areas.
   - Individual rooms or spaces on floor plans
   - Hatched or labeled areas indicating floor finishes

4. **door_window** (class 3): Individual door or window symbols.
   - Door swings (quarter-circle arcs with leaf line)
   - Window symbols (parallel lines in wall openings)
   - Sliding door symbols, folding door symbols
   - Each individual door/window is a separate detection

5. **fixture** (class 4): Plumbing, electrical, or HVAC fixture symbols.
   - Toilets, sinks, bathtubs, showers
   - Light fixtures, outlets, switches
   - HVAC diffusers, registers
   - Each individual fixture is a separate detection

6. **annotation** (class 5): Dimension strings, callouts, and detail markers.
   - Dimension lines with numbers
   - Section cut markers, detail callout circles
   - Room name/number labels
   - NOT general notes paragraphs (those are text, not annotations)

Return a JSON array of detections. Each detection:
{
  "class": 0-5,
  "class_name": "schedule_table" | "wall_linear" | "floor_area" | "door_window" | "fixture" | "annotation",
  "bbox": [x_min, y_min, x_max, y_max],  // pixel coordinates, origin top-left
  "confidence": 0.0-1.0
}

The image dimensions will be provided. Use pixel coordinates relative to the image.
Be thorough — label EVERY instance, especially schedule tables and doors/windows.
If the page is a cover sheet, title sheet, or has no relevant content, return [].

IMPORTANT:
- Schedule tables are the #1 priority. Do NOT miss any tables.
- For doors/windows, label each individual symbol, not the whole wall.
- Bbox should tightly enclose each object with ~5% padding.
"""


def load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def render_pdf_page(pdf_path, page_num, target_size=1280):
    """Render a PDF page to a JPEG image at target resolution."""
    import fitz  # PyMuPDF

    doc = fitz.open(str(pdf_path))
    if page_num >= len(doc):
        return None, 0, 0

    page = doc[page_num]
    # Scale to target size
    rect = page.rect
    scale = target_size / max(rect.width, rect.height)
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, alpha=False)

    img_bytes = pix.tobytes("jpeg", 85)
    width, height = pix.width, pix.height
    doc.close()

    return img_bytes, width, height


def call_claude_vision(img_bytes, width, height):
    """Call Claude to detect objects in a blueprint image."""
    import anthropic

    client = anthropic.Anthropic()
    img_b64 = base64.b64encode(img_bytes).decode()

    prompt = f"{DETECTION_PROMPT}\n\nImage dimensions: {width}x{height} pixels."

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": img_b64,
                    },
                },
                {"type": "text", "text": prompt},
            ],
        }],
    )

    text = response.content[0].text

    # Extract JSON array from response
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        return []

    try:
        detections = json.loads(text[start:end + 1])
        return [d for d in detections if isinstance(d, dict) and "bbox" in d]
    except json.JSONDecodeError:
        print(f"    ⚠ JSON parse error, skipping")
        return []


def detections_to_yolo(detections, img_width, img_height, min_confidence=0.3):
    """Convert pixel-coordinate detections to YOLO format (normalized)."""
    lines = []
    for det in detections:
        conf = det.get("confidence", 0.5)
        if conf < min_confidence:
            continue

        cls = det.get("class", -1)
        if cls < 0 or cls > 5:
            continue

        bbox = det["bbox"]
        if len(bbox) != 4:
            continue

        x_min, y_min, x_max, y_max = bbox

        # Clamp to image bounds
        x_min = max(0, min(x_min, img_width))
        x_max = max(0, min(x_max, img_width))
        y_min = max(0, min(y_min, img_height))
        y_max = max(0, min(y_max, img_height))

        # Skip tiny boxes
        w = x_max - x_min
        h = y_max - y_min
        if w < 10 or h < 10:
            continue

        # Convert to YOLO format (normalized center + size)
        x_center = (x_min + x_max) / 2 / img_width
        y_center = (y_min + y_max) / 2 / img_height
        norm_w = w / img_width
        norm_h = h / img_height

        lines.append(f"{cls} {x_center:.6f} {y_center:.6f} {norm_w:.6f} {norm_h:.6f}")

    return lines


def visualize_detections(img_bytes, detections, output_path, img_width, img_height):
    """Save an overlay image showing detected regions."""
    from PIL import Image, ImageDraw, ImageFont
    import io

    img = Image.open(io.BytesIO(img_bytes))
    draw = ImageDraw.Draw(img)

    colors = {
        0: "#FF0000",  # schedule_table — red
        1: "#00FF00",  # wall_linear — green
        2: "#0000FF",  # floor_area — blue
        3: "#FF00FF",  # door_window — magenta
        4: "#FFFF00",  # fixture — yellow
        5: "#00FFFF",  # annotation — cyan
    }

    for det in detections:
        cls = det.get("class", -1)
        bbox = det.get("bbox", [])
        if len(bbox) != 4 or cls < 0:
            continue

        # Ensure x1 < x2 and y1 < y2
        x1, y1, x2, y2 = bbox
        x1, x2 = min(x1, x2), max(x1, x2)
        y1, y2 = min(y1, y2), max(y1, y2)
        if x2 - x1 < 2 or y2 - y1 < 2:
            continue

        color = colors.get(cls, "#FFFFFF")
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        label = f"{NEW_CLASSES[cls]} {det.get('confidence', 0):.0%}"
        draw.text((bbox[0] + 2, bbox[1] + 2), label, fill=color)

    img.save(str(output_path), "JPEG", quality=85)


def find_intake_pdfs(project_filter=None):
    """Find all blueprint PDFs in intake-template/plan-sets."""
    pdfs = []
    if not INTAKE_DIR.exists():
        print(f"⚠ Intake directory not found: {INTAKE_DIR}")
        return pdfs

    for project_dir in sorted(INTAKE_DIR.iterdir()):
        if not project_dir.is_dir():
            continue
        if project_filter and project_filter not in project_dir.name:
            continue

        drawings_dir = project_dir / "drawings"
        if not drawings_dir.exists():
            continue

        for pdf_file in sorted(drawings_dir.glob("*.pdf")):
            pdfs.append({
                "path": pdf_file,
                "project": project_dir.name,
            })

    return pdfs


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Auto-label blueprint PDFs for YOLO training")
    parser.add_argument("--project", help="Filter to specific project (e.g., '01')")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing files")
    parser.add_argument("--visualize", action="store_true", help="Generate overlay images")
    parser.add_argument("--max-pages", type=int, default=999, help="Max pages per PDF")
    parser.add_argument("--split", default="train", choices=["train", "val"], help="Dataset split")
    args = parser.parse_args()

    pdfs = find_intake_pdfs(args.project)
    if not pdfs:
        print("No PDFs found in intake-template/plan-sets/")
        return

    print(f"Found {len(pdfs)} PDFs across {len(set(p['project'] for p in pdfs))} projects\n")

    # Output directories
    split = args.split
    img_dir = DATASET_DIR / split / "images"
    lbl_dir = DATASET_DIR / split / "labels"
    viz_dir = TRAINING_DIR / "visualizations"

    if not args.dry_run:
        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)
        if args.visualize:
            viz_dir.mkdir(parents=True, exist_ok=True)

    total_stats = Counter()
    total_images = 0
    total_cost = 0.0

    for pdf_info in pdfs:
        pdf_path = pdf_info["path"]
        project = pdf_info["project"]
        print(f"─── {project} / {pdf_path.name} ───")

        import fitz
        doc = fitz.open(str(pdf_path))
        num_pages = min(len(doc), args.max_pages)
        doc.close()

        for page_num in range(num_pages):
            img_bytes, w, h = render_pdf_page(pdf_path, page_num)
            if img_bytes is None:
                continue

            # Generate unique filename
            safe_project = project.replace(" ", "_").replace("/", "_")[:30]
            safe_pdf = pdf_path.stem.replace(" ", "_")[:30]
            filename = f"intake_{safe_project}_{safe_pdf}_p{page_num:03d}"

            if args.dry_run:
                print(f"  Page {page_num + 1}/{num_pages}: {w}x{h} → would call Claude")
                continue

            # Call Claude Vision
            print(f"  Page {page_num + 1}/{num_pages}: {w}x{h}", end="", flush=True)
            try:
                detections = call_claude_vision(img_bytes, w, h)
            except Exception as e:
                print(f" ✗ Error: {e}")
                continue

            # Count by class
            page_counts = Counter(d.get("class", -1) for d in detections)
            for cls_id, count in page_counts.items():
                if 0 <= cls_id <= 5:
                    total_stats[NEW_CLASSES[cls_id]] += count

            print(f" → {len(detections)} detections", end="")
            for cls_id in sorted(page_counts.keys()):
                if 0 <= cls_id <= 5:
                    print(f" | {NEW_CLASSES[cls_id]}:{page_counts[cls_id]}", end="")
            print()

            # Convert to YOLO format
            yolo_lines = detections_to_yolo(detections, w, h)

            if yolo_lines:
                # Save image
                img_path = img_dir / f"{filename}.jpg"
                with open(img_path, "wb") as f:
                    f.write(img_bytes)

                # Save labels
                lbl_path = lbl_dir / f"{filename}.txt"
                with open(lbl_path, "w") as f:
                    f.write("\n".join(yolo_lines) + "\n")

                total_images += 1

                # Optional visualization
                if args.visualize:
                    viz_path = viz_dir / f"{filename}_viz.jpg"
                    visualize_detections(img_bytes, detections, viz_path, w, h)

            # Estimate API cost (Haiku: ~$0.01/page for vision)
            total_cost += 0.01

            # Rate limiting (Claude API)
            time.sleep(0.5)

    # Summary
    print(f"\n{'=' * 60}")
    print(f"AUTO-LABELING COMPLETE")
    print(f"{'=' * 60}")
    print(f"  Images processed: {total_images}")
    print(f"  Estimated API cost: ${total_cost:.2f}")
    print(f"\n  Detections by class:")
    for cls_name in NEW_CLASSES:
        count = total_stats.get(cls_name, 0)
        print(f"    {cls_name:20s}: {count:5d}")

    if total_stats.get("schedule_table", 0) == 0:
        print(f"\n  ⚠ WARNING: No schedule_table detections. Check if PDFs contain schedule pages.")
    if total_stats.get("door_window", 0) == 0:
        print(f"\n  ⚠ WARNING: No door_window detections. Check if PDFs contain floor plans with doors.")

    if not args.dry_run:
        # Clear label cache so YOLO picks up new data
        for cache in DATASET_DIR.rglob("labels.cache"):
            cache.unlink()
            print(f"  Cleared cache: {cache}")

    print(f"\nNext steps:")
    print(f"  1. Review visualizations in {viz_dir}/")
    print(f"  2. Run: python3 prepare_and_train.py")


if __name__ == "__main__":
    main()
